/**
 * simulationEngine.js — Timing Matrix
 * -------------------------------------------------------------
 * Pure timing/state engine. NO DOM access happens here — this
 * module only owns a `setInterval` clock and a cursor into a
 * pre-computed `timeline` (as produced by algorithms.js). Every
 * tick it derives a live-state snapshot and hands it to whatever
 * render callback app.js registered via configure().
 *
 * Lifecycle:
 *   configure({ timeline, processes, speed, finalMetrics, onTick, onComplete })
 *   startSimulation()   — always begins fresh from tick 0, clearing
 *                          any interval already running (guards
 *                          against overlapping intervals if the
 *                          Simulate button is clicked repeatedly)
 *   setSpeed(n)          — re-cadences the live interval without
 *                          losing the current cursor position
 *   pauseSimulation() / resumeSimulation() — documented for module
 *                          completeness; the current UI only wires
 *                          Simulate (restart) + Reset All, but a
 *                          future pause/resume control can call
 *                          these directly with no engine changes.
 *   stopSimulation()     — hard stop, cursor back to zero
 * -------------------------------------------------------------
 */

const BASE_TICK_MS = 800; // duration of one simulated second at 1x speed

let timelineRef = [];
let processesRef = []; // final computed processes: id, name, type, arrivalTime, burstTime, priority, waitingTime (frozen final), completionTime
let finalMetricsRef = null;

let intervalId = null;
let cursor = 0; // index into timelineRef of the NEXT tick to process
let speed = 1;
let running = false;

let onTick = null;
let onComplete = null;

/* ---------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------- */

/**
 * Loads a fresh scheduling result into the engine. Always stops
 * any simulation currently in flight first.
 */
export function configure({ timeline, processes, speed: initialSpeed, finalMetrics, onTick: tickCb, onComplete: completeCb }) {
  stopSimulation();
  timelineRef = Array.isArray(timeline) ? timeline : [];
  processesRef = Array.isArray(processes) ? processes : [];
  finalMetricsRef = finalMetrics || null;
  speed = Math.max(1, Number(initialSpeed) || 1);
  onTick = typeof tickCb === 'function' ? tickCb : null;
  onComplete = typeof completeCb === 'function' ? completeCb : null;
}

function msPerTick() {
  return Math.max(50, Math.round(BASE_TICK_MS / speed));
}

export function setSpeed(nextSpeed) {
  speed = Math.max(1, Number(nextSpeed) || 1);
  if (running) {
    clearInterval(intervalId);
    intervalId = setInterval(step, msPerTick());
  }
}

export function isRunning() {
  return running;
}

export function hasTimeline() {
  return timelineRef.length > 0;
}

/* ---------------------------------------------------------------
 * Playback controls
 * ------------------------------------------------------------- */

/** Always restarts from tick 0 — clicking Simulate mid-run intentionally re-runs clean. */
export function startSimulation() {
  if (!timelineRef.length) return false;
  if (intervalId) clearInterval(intervalId); // guard: never allow two intervals ticking at once
  cursor = 0;
  running = true;
  intervalId = setInterval(step, msPerTick());
  step(); // fire tick 0 immediately instead of waiting a full interval
  return true;
}

export function pauseSimulation() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  running = false;
}

export function resumeSimulation() {
  if (running || cursor >= timelineRef.length) return false;
  running = true;
  intervalId = setInterval(step, msPerTick());
  return true;
}

export function stopSimulation() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  running = false;
  cursor = 0;
}

/* ---------------------------------------------------------------
 * Tick logic
 * ------------------------------------------------------------- */

function step() {
  if (cursor >= timelineRef.length) {
    finish();
    return;
  }

  const tickIndex = cursor;
  cursor += 1;

  const snapshot = computeLiveSnapshot(tickIndex);
  if (onTick) onTick(snapshot);

  if (cursor >= timelineRef.length) {
    finish();
  }
}

function finish() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  running = false;

  const lastIndex = timelineRef.length - 1;
  const finalSnapshot = lastIndex >= 0 ? computeLiveSnapshot(lastIndex) : emptySnapshot();
  finalSnapshot.isComplete = true;
  // Use the algorithm's own precomputed metrics for the final read-out so
  // there is never any float-accumulation drift between "live" and "final".
  if (finalMetricsRef) finalSnapshot.metrics = { ...finalMetricsRef };

  if (onComplete) onComplete(finalSnapshot);
}

/* ---------------------------------------------------------------
 * Snapshot derivation (pure — safe to call standalone for tests)
 * ------------------------------------------------------------- */

function emptySnapshot() {
  return {
    second: 0,
    cpu: { status: 'idle', processId: null, processName: null, level: null, isContextSwitch: false },
    nextInQueue: null,
    processes: [],
    overallProgressPct: 0,
    metrics: { avgWaitingTime: 0, avgExecutionTime: 0, totalExecutionTime: 0 },
    isComplete: false,
  };
}

/**
 * Builds the live state of the world as of timelineRef[tickIndex]
 * (inclusive). Replays every elapsed tick to derive each process's
 * remaining time, status, and running waiting time.
 */
export function computeLiveSnapshot(tickIndex) {
  const entry = timelineRef[tickIndex];
  if (!entry) return emptySnapshot();

  const currentSecond = entry.second;
  const elapsed = timelineRef.slice(0, tickIndex + 1);

  // executedTicks per process id, counted from the elapsed slice.
  // levelById tracks each process's most recent known queue level (MLFQ
  // only — timeline entries from other algorithms never carry `level`,
  // so this stays empty and every process falls back to "not applicable").
  const executedTicks = new Map();
  const levelById = new Map();
  elapsed.forEach((e) => {
    if (e.processId === null) return;
    executedTicks.set(e.processId, (executedTicks.get(e.processId) || 0) + 1);
    if (e.level !== undefined && e.level !== null) levelById.set(e.processId, e.level);
  });

  const nowInclusive = currentSecond + 1; // "time" has advanced past this tick's second

  const processes = processesRef.map((p) => {
    const executed = executedTicks.get(p.id) || 0;
    const remainingTime = Math.max(p.burstTime - executed, 0);
    const isCompleted = remainingTime === 0 && executed > 0;
    const hasArrived = p.arrivalTime <= currentSecond;

    let status;
    let waitingTime;

    if (!hasArrived) {
      status = 'not-arrived';
      waitingTime = 0;
    } else if (isCompleted) {
      status = 'completed';
      // Freeze at the process's own completion moment — do not keep
      // accruing waiting time just because other processes are still running.
      waitingTime = p.waitingTime;
    } else if (entry.processId === p.id) {
      status = 'running';
      waitingTime = Math.max(nowInclusive - p.arrivalTime - executed, 0);
    } else {
      status = 'waiting';
      waitingTime = Math.max(nowInclusive - p.arrivalTime - executed, 0);
    }

    return {
      id: p.id,
      name: p.name,
      type: p.type,
      status,
      burstTime: p.burstTime,
      remainingTime,
      completionPct: p.burstTime > 0 ? Math.round(((p.burstTime - remainingTime) / p.burstTime) * 100) : 0,
      waitingTime,
      executedTicks: executed,
      level: levelById.has(p.id) ? levelById.get(p.id) : null,
    };
  });

  const cpu = {
    status: entry.processId === null ? 'idle' : 'running',
    processId: entry.processId,
    processName: entry.processName,
    level: entry.level !== undefined ? entry.level : null,
    isContextSwitch: !!entry.isContextSwitch,
  };

  const nextInQueue = findNextProcess(tickIndex + 1, entry.processId);

  const totalTicks = timelineRef.length;
  const overallProgressPct = totalTicks > 0 ? Math.round(((tickIndex + 1) / totalTicks) * 100) : 0;

  const snapshot = {
    second: currentSecond,
    cpu,
    nextInQueue,
    processes,
    overallProgressPct,
    isComplete: false,
  };

  snapshot.metrics = computeLiveMetrics(snapshot);
  return snapshot;
}

function findNextProcess(fromIndexInclusive, excludeProcessId) {
  for (let i = fromIndexInclusive; i < timelineRef.length; i += 1) {
    const pid = timelineRef[i].processId;
    if (pid !== null && pid !== excludeProcessId) {
      return { id: pid, name: timelineRef[i].processName };
    }
  }
  return null;
}

/**
 * Derives running averages from a snapshot's per-process state.
 * Waiting time is averaged across every process that has arrived
 * (its true live contribution). Execution time is averaged only
 * across processes that have actually run at least one tick, since
 * a process that has merely arrived hasn't executed anything yet.
 */
export function computeLiveMetrics(snapshot) {
  const arrived = snapshot.processes.filter((p) => p.status !== 'not-arrived');
  const executed = snapshot.processes.filter((p) => p.executedTicks > 0);

  if (arrived.length === 0) {
    return { avgWaitingTime: 0, avgExecutionTime: 0, totalExecutionTime: 0 };
  }

  const totalWaiting = arrived.reduce((sum, p) => sum + p.waitingTime, 0);
  const totalBurstOfExecuted = executed.reduce((sum, p) => sum + p.burstTime, 0);

  return {
    avgWaitingTime: round2(totalWaiting / arrived.length),
    avgExecutionTime: executed.length ? round2(totalBurstOfExecuted / executed.length) : 0,
    totalExecutionTime: round2(snapshot.second + 1),
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
