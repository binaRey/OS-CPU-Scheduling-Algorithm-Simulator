/**
 * processManager.js — Data Layer
 * -------------------------------------------------------------
 * Owns the single in-memory process array. No DOM access happens
 * here — this module only validates input and mutates state.
 * Every public function returns a plain { ok, ... } result object
 * so callers (app.js) can decide how to surface success/errors.
 *
 * Process shape:
 *   { id, name, type, arrivalTime, burstTime, remainingTime,
 *     priority, waitingTime, turnaroundTime, completionTime }
 * -------------------------------------------------------------
 */

const PROCESS_TYPES = ['foreground', 'background', 'system', 'batch'];
const RANDOM_NAME_PREFIX = 'P';
const MAX_RANDOM_BATCH = 50;

/** @type {Array<Object>} */
let processes = [];
let nextId = 1;

/* ---------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------- */

/** Returns a shallow-cloned snapshot of the process list (read-only for callers). */
export function getProcesses() {
  return processes.map((p) => ({ ...p }));
}

export function getProcessCount() {
  return processes.length;
}

/* ---------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------- */

/**
 * Validates raw form-field values before they become a process.
 * @param {{name:string, arrivalTime:string|number, burstTime:string|number, priority?:string|number}} input
 * @returns {string[]} list of human-readable error messages (empty = valid)
 */
export function validateProcessInput(input) {
  const errors = [];
  const { name, arrivalTime, burstTime, priority } = input;

  if (!name || !String(name).trim()) {
    errors.push('Process name is required.');
  }

  if (arrivalTime === '' || arrivalTime === null || arrivalTime === undefined || Number.isNaN(Number(arrivalTime))) {
    errors.push('Arrival time must be a number.');
  } else if (Number(arrivalTime) < 0) {
    errors.push('Arrival time must be ≥ 0.');
  }

  if (burstTime === '' || burstTime === null || burstTime === undefined || Number.isNaN(Number(burstTime))) {
    errors.push('Exec time must be a number.');
  } else if (Number(burstTime) <= 0) {
    errors.push('Exec time must be > 0.');
  }

  if (priority !== '' && priority !== null && priority !== undefined) {
    if (Number.isNaN(Number(priority)) || Number(priority) < 1) {
      errors.push('Priority must be a number ≥ 1 when provided.');
    }
  }

  return errors;
}

/* ---------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------- */

function buildProcess({ name, type, arrivalTime, burstTime, priority }) {
  const burst = Number(burstTime);
  return {
    id: nextId++,
    name: String(name).trim(),
    type: PROCESS_TYPES.includes(type) ? type : 'foreground',
    arrivalTime: Number(arrivalTime),
    burstTime: burst,
    remainingTime: burst,
    priority: priority === '' || priority === null || priority === undefined ? 1 : Number(priority),
    waitingTime: 0,
    turnaroundTime: 0,
    completionTime: null,
  };
}

function isValidIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < processes.length;
}

function boundsError() {
  if (processes.length === 0) {
    return ['The queue is empty — nothing to target.'];
  }
  return [`Position must be an integer between 0 and ${processes.length - 1}.`];
}

/* ---------------------------------------------------------------
 * Mutations
 * ------------------------------------------------------------- */

/** Sequential insertion — appends a validated process to the end of the queue. */
export function enqueueProcess(input) {
  const errors = validateProcessInput(input);
  if (errors.length) return { ok: false, errors };

  const process = buildProcess(input);
  processes.push(process);
  return { ok: true, process, index: processes.length - 1 };
}

/** Splices a single process out of the queue by its position (0-based). */
export function dequeueProcessAt(index) {
  if (!isValidIndex(index)) {
    return { ok: false, errors: boundsError() };
  }
  const [removed] = processes.splice(index, 1);
  return { ok: true, process: removed };
}

/** Inline object override — validates and replaces the process at a given position. */
export function updateProcessAt(index, input) {
  if (!isValidIndex(index)) {
    return { ok: false, errors: boundsError() };
  }
  const errors = validateProcessInput(input);
  if (errors.length) return { ok: false, errors };

  const existing = processes[index];
  const burst = Number(input.burstTime);
  const updated = {
    ...existing,
    name: String(input.name).trim(),
    type: PROCESS_TYPES.includes(input.type) ? input.type : existing.type,
    arrivalTime: Number(input.arrivalTime),
    burstTime: burst,
    remainingTime: burst,
    priority:
      input.priority === '' || input.priority === null || input.priority === undefined
        ? existing.priority
        : Number(input.priority),
  };
  processes[index] = updated;
  return { ok: true, process: updated };
}

/** Generates a batch of randomized, valid processes and appends them to the queue. */
export function generateRandomProcesses(count) {
  const n = Math.max(1, Math.min(MAX_RANDOM_BATCH, Math.floor(Number(count)) || 1));
  const created = [];

  for (let i = 0; i < n; i += 1) {
    const process = buildProcess({
      name: 'temp',
      type: PROCESS_TYPES[Math.floor(Math.random() * PROCESS_TYPES.length)],
      arrivalTime: Math.floor(Math.random() * 10),
      burstTime: Math.floor(Math.random() * 9) + 1,
      priority: Math.floor(Math.random() * 5) + 1,
    });
    process.name = `${RANDOM_NAME_PREFIX}${process.id}`;
    processes.push(process);
    created.push(process);
  }

  return created;
}

/** Clears all state — used by the "Reset All" control. */
export function resetProcesses() {
  processes = [];
  nextId = 1;
}

export { PROCESS_TYPES };
