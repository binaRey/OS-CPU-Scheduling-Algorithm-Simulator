/**
 * algorithms.js — Engine Room
 * -------------------------------------------------------------
 * Pure computation only: no DOM access, no mutation of anything
 * outside a function's own local clones. Every algorithm takes a
 * process-matrix snapshot (as returned by processManager.getProcesses())
 * and returns a result object:
 *
 *   {
 *     processes: [{ id, name, type, arrivalTime, burstTime, priority,
 *                    completionTime, waitingTime, turnaroundTime }, ...],
 *     timeline: [{ second, processId, processName }, ...],   // one entry
 *                                                             // per unit of time, processId is
 *                                                             // null while the CPU is idle
 *     metrics: { avgWaitingTime, avgTurnaroundTime, avgBurstTime,
 *                totalExecutionTime, cpuUtilization }
 *   }
 *
 * All five algorithms simulate second-by-second so simulationEngine.js
 * (Phase 4) can step through `timeline` directly to animate the Gantt
 * chart and live status table.
 * -------------------------------------------------------------
 */

const ALGORITHM_KEYS = ['fcfs', 'sjf', 'srtf', 'priority-np', 'priority-p', 'rr'];

/* ---------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------- */

function cloneForSimulation(processes) {
  return processes
    .filter((p) => p.burstTime > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      arrivalTime: p.arrivalTime,
      burstTime: p.burstTime,
      priority: p.priority,
      remainingTime: p.burstTime,
      completionTime: null,
      waitingTime: 0,
      turnaroundTime: 0,
      responseTime: null,
    }));
}

function emptyResult() {
  return {
    processes: [],
    timeline: [],
    metrics: {
      avgWaitingTime: 0,
      avgTurnaroundTime: 0,
      avgBurstTime: 0,
      avgResponseTime: 0,
      totalExecutionTime: 0,
      cpuUtilization: 0,
    },
  };
}

/** Computes final waiting/turnaround times for a finished process and marks it complete. */
function finalizeProcess(proc, finishTime) {
  proc.remainingTime = 0;
  proc.completionTime = finishTime;
  proc.turnaroundTime = finishTime - proc.arrivalTime;
  proc.waitingTime = proc.turnaroundTime - proc.burstTime;
}

/** Rounds to 2 decimal places without floating-point noise like 3.0000000004. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildMetrics(procs) {
  if (procs.length === 0) return emptyResult().metrics;

  const totalWaiting = procs.reduce((sum, p) => sum + p.waitingTime, 0);
  const totalTurnaround = procs.reduce((sum, p) => sum + p.turnaroundTime, 0);
  const totalBurst = procs.reduce((sum, p) => sum + p.burstTime, 0);
  const totalResponse = procs.reduce((sum, p) => sum + (p.responseTime ?? 0), 0);
  const earliestArrival = Math.min(...procs.map((p) => p.arrivalTime));
  const latestCompletion = Math.max(...procs.map((p) => p.completionTime));
  const makespan = Math.max(latestCompletion - earliestArrival, 0);

  return {
    avgWaitingTime: round2(totalWaiting / procs.length),
    avgTurnaroundTime: round2(totalTurnaround / procs.length),
    avgBurstTime: round2(totalBurst / procs.length),
    avgResponseTime: round2(totalResponse / procs.length),
    totalExecutionTime: round2(makespan),
    cpuUtilization: makespan > 0 ? round2((totalBurst / makespan) * 100) : 0,
  };
}

function buildResult(procs, timeline) {
  return {
    processes: procs.map((p) => ({ ...p })),
    timeline,
    metrics: buildMetrics(procs),
  };
}

/** Safety valve so a malformed input can never spin the loop forever. */
function computeSafetyLimit(procs) {
  const totalBurst = procs.reduce((sum, p) => sum + p.burstTime, 0);
  const latestArrival = Math.max(...procs.map((p) => p.arrivalTime));
  return totalBurst + latestArrival + 1000;
}

/* ---------------------------------------------------------------
 * Generic "pick one, run one second" engine
 * Powers FCFS, SJF, SRTF, and both Priority modes — the only thing
 * that differs between them is the selection rule and whether that
 * selection is re-evaluated every tick (preemptive) or held until
 * the running process finishes (non-preemptive).
 * ------------------------------------------------------------- */

function simulateBySelection(processes, selectFn, { preemptive }) {
  const procs = cloneForSimulation(processes);
  if (procs.length === 0) return emptyResult();

  const n = procs.length;
  const safetyLimit = computeSafetyLimit(procs);
  let time = Math.min(...procs.map((p) => p.arrivalTime));
  let completedCount = 0;
  let current = null;
  const timeline = [];

  while (completedCount < n && time < safetyLimit) {
    const ready = procs.filter((p) => p.arrivalTime <= time && p.remainingTime > 0);

    if (ready.length === 0) {
      timeline.push({ second: time, processId: null, processName: null });
      current = null;
      time += 1;
      continue;
    }

    const holdCurrent = !preemptive && current && current.remainingTime > 0 && current.arrivalTime <= time;
    const selected = holdCurrent ? current : selectFn(ready);
    current = selected;

    if (selected.responseTime === null) {
      selected.responseTime = time - selected.arrivalTime;
    }

    timeline.push({ second: time, processId: selected.id, processName: selected.name });
    selected.remainingTime -= 1;

    if (selected.remainingTime === 0) {
      finalizeProcess(selected, time + 1);
      completedCount += 1;
      current = null;
    }

    time += 1;
  }

  return buildResult(procs, timeline);
}

/* --- Selection rules (tie-break: the stated criterion, then arrival, then id) --- */

function byEarliestArrival(ready) {
  return [...ready].sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id)[0];
}

function byShortestRemainingTime(ready) {
  return [...ready].sort(
    (a, b) => a.remainingTime - b.remainingTime || a.arrivalTime - b.arrivalTime || a.id - b.id
  )[0];
}

function byHighestPriority(ready) {
  // Lower numeric value = higher priority (matches the UI's "1 = highest").
  return [...ready].sort(
    (a, b) => a.priority - b.priority || a.arrivalTime - b.arrivalTime || a.id - b.id
  )[0];
}

/* ---------------------------------------------------------------
 * Algorithm 1: FCFS — First Come First Serve (non-preemptive)
 * ------------------------------------------------------------- */

export function fcfs(processes) {
  return simulateBySelection(processes, byEarliestArrival, { preemptive: false });
}

/* ---------------------------------------------------------------
 * Algorithm 2: SJF — Shortest Job First (non-preemptive)
 * ------------------------------------------------------------- */

export function sjf(processes) {
  return simulateBySelection(processes, byShortestRemainingTime, { preemptive: false });
}

/* ---------------------------------------------------------------
 * Algorithm 3: SRTF — Shortest Remaining Time First (preemptive)
 * ------------------------------------------------------------- */

export function srtf(processes) {
  return simulateBySelection(processes, byShortestRemainingTime, { preemptive: true });
}

/* ---------------------------------------------------------------
 * Algorithm 4: Priority Scheduling (preemptive or non-preemptive)
 * ------------------------------------------------------------- */

export function priorityScheduling(processes, { preemptive = false } = {}) {
  return simulateBySelection(processes, byHighestPriority, { preemptive });
}

/* ---------------------------------------------------------------
 * Algorithm 5: Round Robin (preemptive, fixed time-quantum slices)
 * -------------------------------------------------------------
 * Uses genuine FIFO queue rotation rather than the selection engine
 * above, since RR's fairness rule (newly-arrived processes join the
 * queue ahead of a just-preempted one) is a distinct mechanic from
 * "pick the best-ranked ready process every tick".
 * ------------------------------------------------------------- */

export function roundRobin(processes, timeQuantum) {
  const procs = cloneForSimulation(processes);
  if (procs.length === 0) return emptyResult();

  const quantum = Math.max(1, Math.floor(Number(timeQuantum)) || 1);
  const byArrival = [...procs].sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id);
  const n = procs.length;
  const safetyLimit = computeSafetyLimit(procs);

  const queue = [];
  let arrivalPointer = 0;
  let time = byArrival[0].arrivalTime;
  let completedCount = 0;
  const timeline = [];

  function admitArrivalsUpTo(uptoTime) {
    while (arrivalPointer < n && byArrival[arrivalPointer].arrivalTime <= uptoTime) {
      queue.push(byArrival[arrivalPointer]);
      arrivalPointer += 1;
    }
  }

  admitArrivalsUpTo(time);

  while (completedCount < n && time < safetyLimit) {
    if (queue.length === 0) {
      timeline.push({ second: time, processId: null, processName: null });
      time += 1;
      admitArrivalsUpTo(time);
      continue;
    }

    const proc = queue.shift();
    let sliceUsed = 0;

    if (proc.responseTime === null) {
      proc.responseTime = time - proc.arrivalTime;
    }

    while (sliceUsed < quantum && proc.remainingTime > 0) {
      timeline.push({ second: time, processId: proc.id, processName: proc.name });
      proc.remainingTime -= 1;
      time += 1;
      sliceUsed += 1;
      admitArrivalsUpTo(time); // arrivals during this slice queue ahead of the process below
      if (proc.remainingTime === 0) break;
    }

    if (proc.remainingTime === 0) {
      finalizeProcess(proc, time);
      completedCount += 1;
    } else {
      queue.push(proc);
    }
  }

  return buildResult(procs, timeline);
}

/* ---------------------------------------------------------------
 * Dispatcher — maps the Algorithm Panel's <select> value straight
 * to the correct engine so app.js/simulationEngine.js never need
 * a switch statement of their own.
 * ------------------------------------------------------------- */

export function runScheduler(algorithmKey, processes, { timeQuantum } = {}) {
  switch (algorithmKey) {
    case 'fcfs':
      return fcfs(processes);
    case 'sjf':
      return sjf(processes);
    case 'srtf':
      return srtf(processes);
    case 'priority-np':
      return priorityScheduling(processes, { preemptive: false });
    case 'priority-p':
      return priorityScheduling(processes, { preemptive: true });
    case 'rr':
      return roundRobin(processes, timeQuantum);
    default:
      throw new Error(`Unknown scheduling algorithm: "${algorithmKey}"`);
  }
}

export { ALGORITHM_KEYS };
