/**
 * uiRenderer.js — Display Layer
 * -------------------------------------------------------------
 * Pure DOM-writing functions. Nothing in here mutates application
 * state — it only ever reads a snapshot (from processManager or
 * simulationEngine) and paints it.
 * -------------------------------------------------------------
 */

const TYPE_LABELS = {
  foreground: 'Foreground',
  background: 'Background',
  system: 'System',
  batch: 'Batch',
};

const STATUS_LABELS = {
  'not-arrived': 'Not Arrived',
  waiting: 'Waiting',
  running: 'Running',
  completed: 'Completed',
};

/* A small fixed hue rotation (golden angle) so any process id gets a
   stable, well-separated color without a palette lookup table. */
function colorForProcess(id) {
  const hue = (Number(id) * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 70%, 58%)`;
}

/**
 * Renders the Pending Queue table from a process snapshot.
 * @param {Array<Object>} processes
 * @param {HTMLTableSectionElement} tbody
 */
export function renderPendingQueue(processes, tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!processes.length) {
    tbody.appendChild(buildEmptyRow('No processes queued yet.'));
    return;
  }

  processes.forEach((process, index) => {
    const row = document.createElement('tr');
    row.dataset.index = String(index);
    row.title = TYPE_LABELS[process.type] || process.type;

    row.appendChild(buildCell(String(index)));
    row.appendChild(buildCell(process.name));
    row.appendChild(buildCell(String(process.arrivalTime)));
    row.appendChild(buildCell(String(process.burstTime)));
    row.appendChild(buildCell(String(process.priority)));

    tbody.appendChild(row);
  });
}

/**
 * Writes a status message into the Action Message panel.
 * @param {HTMLElement} el
 * @param {string} text
 * @param {'info'|'success'|'error'} [tone]
 */
export function renderActionMessage(el, text, tone = 'info') {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

/**
 * Renders the Live Simulation Status table from a simulationEngine snapshot.
 * @param {Object} snapshot — as produced by simulationEngine.computeLiveSnapshot
 * @param {HTMLTableSectionElement} tbody
 */
export function renderSimStatusTable(snapshot, tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!snapshot || !snapshot.processes.length) {
    tbody.appendChild(buildEmptyRow('Simulation has not started.', 6));
    return;
  }

  snapshot.processes.forEach((p) => {
    const row = document.createElement('tr');
    row.dataset.status = p.status;

    row.appendChild(buildCell(p.name));
    row.appendChild(buildStatusCell(p.status));
    row.appendChild(buildLevelCell(p.level));
    row.appendChild(buildCell(`${p.completionPct}%`));
    row.appendChild(buildCell(String(p.remainingTime)));
    row.appendChild(buildCell(String(p.waitingTime)));

    tbody.appendChild(row);
  });
}

/** Resets the Live Simulation Status table to its pre-run placeholder. */
export function resetSimStatusTable(tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';
  tbody.appendChild(buildEmptyRow('Simulation has not started.', 6));
}

/**
 * Updates the Metrics Panel read-outs.
 * @param {{avgWaitingTime:number, avgExecutionTime:number, totalExecutionTime:number,
 *           avgTurnaroundTime?:number, avgResponseTime?:number}} metrics
 * @param {{metricAvgWaiting:HTMLElement, metricAvgExec:HTMLElement, metricTotalExec:HTMLElement,
 *           metricAvgTurnaround?:HTMLElement, metricAvgResponse?:HTMLElement}} dom
 */
export function renderMetrics(metrics, dom) {
  if (!metrics || !dom) return;
  if (dom.metricAvgWaiting) dom.metricAvgWaiting.textContent = metrics.avgWaitingTime.toFixed(2);
  if (dom.metricAvgExec) dom.metricAvgExec.textContent = metrics.avgExecutionTime.toFixed(2);
  if (dom.metricTotalExec) dom.metricTotalExec.textContent = metrics.totalExecutionTime.toFixed(2);
  if (dom.metricAvgTurnaround) {
    dom.metricAvgTurnaround.textContent = (metrics.avgTurnaroundTime ?? 0).toFixed(2);
  }
  if (dom.metricAvgResponse) {
    dom.metricAvgResponse.textContent = (metrics.avgResponseTime ?? 0).toFixed(2);
  }
}

/** Resets the Metrics Panel to its zeroed default display. */
export function resetMetrics(dom) {
  renderMetrics(
    { avgWaitingTime: 0, avgExecutionTime: 0, totalExecutionTime: 0, avgTurnaroundTime: 0, avgResponseTime: 0 },
    dom
  );
}

/**
 * Updates the CPU Matrix Panel (status, next-in-queue, overall progress bar).
 * @param {Object} snapshot
 * @param {{cpuStatus:HTMLElement, nextQueueName:HTMLElement, overallProgressBar:HTMLElement, overallProgressFill:HTMLElement}} dom
 */
export function renderCpuMatrix(snapshot, dom) {
  if (!snapshot || !dom) return;

  if (dom.cpuStatus) {
    dom.cpuStatus.textContent =
      snapshot.cpu.status === 'running' ? `Running · ${snapshot.cpu.processName}` : 'Idle';
  }
  if (dom.nextQueueName) {
    dom.nextQueueName.textContent = snapshot.nextInQueue ? snapshot.nextInQueue.name : '—';
  }
  if (dom.overallProgressFill) {
    dom.overallProgressFill.style.width = `${snapshot.overallProgressPct}%`;
  }
  if (dom.overallProgressBar) {
    dom.overallProgressBar.setAttribute('aria-valuenow', String(snapshot.overallProgressPct));
  }
}

/** Resets the CPU Matrix Panel to its idle default display. */
export function resetCpuMatrix(dom) {
  if (!dom) return;
  if (dom.cpuStatus) dom.cpuStatus.textContent = 'Idle';
  if (dom.nextQueueName) dom.nextQueueName.textContent = '—';
  if (dom.overallProgressFill) dom.overallProgressFill.style.width = '0%';
  if (dom.overallProgressBar) dom.overallProgressBar.setAttribute('aria-valuenow', '0');
}

/**
 * Appends a single 1-second Gantt block for the current tick. Clears the
 * "not started" placeholder the first time it's called after a reset.
 * @param {{second:number, processId:?number, processName:?string, level?:?number}} entry
 * @param {HTMLElement} container
 */
export function appendGanttBlock(entry, container) {
  if (!container) return;
  const placeholder = container.querySelector('.gantt-chart__placeholder');
  if (placeholder) placeholder.remove();

  const hasLevel = entry.level !== undefined && entry.level !== null;
  const block = document.createElement('div');
  block.className = entry.processId === null ? 'gantt-block gantt-block--idle' : 'gantt-block';
  block.title = `t=${entry.second} — ${entry.processId === null ? 'CPU idle' : entry.processName}${hasLevel ? ` (Q${entry.level})` : ''}`;
  block.textContent = entry.processId === null ? '·' : entry.processName;
  if (entry.processId !== null) {
    block.style.background = colorForProcess(entry.processId);
    if (hasLevel) block.dataset.level = String(entry.level);
  }

  container.appendChild(block);
  container.scrollLeft = container.scrollWidth;
}

/** Clears all rendered Gantt blocks and restores the placeholder message. */
export function resetGantt(container) {
  if (!container) return;
  container.innerHTML = '<p class="gantt-chart__placeholder">Timeline will render here once the simulation starts.</p>';
}

/**
 * Renders the Process Results table (final per-process metrics) once a
 * simulation completes — Process ID, Arrival, Burst, Completion,
 * Turnaround, and Response Time, straight from algorithms.js's result.
 * @param {Array<Object>} processes — result.processes from algorithms.js
 *   (each has name, arrivalTime, burstTime, completionTime, turnaroundTime, responseTime)
 * @param {HTMLTableSectionElement} tbody
 */
export function renderResultsTable(processes, tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!processes || !processes.length) {
    tbody.appendChild(buildEmptyRow('Run a simulation to see per-process results.', 6));
    return;
  }

  processes
    .slice()
    .sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id)
    .forEach((p) => {
      const row = document.createElement('tr');
      row.appendChild(buildCell(p.name));
      row.appendChild(buildCell(String(p.arrivalTime)));
      row.appendChild(buildCell(String(p.burstTime)));
      row.appendChild(buildCell(String(p.completionTime)));
      row.appendChild(buildCell(String(p.turnaroundTime)));
      row.appendChild(buildCell(String(p.responseTime)));
      tbody.appendChild(row);
    });
}

/** Resets the Process Results table to its pre-run placeholder. */
export function resetResultsTable(tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';
  tbody.appendChild(buildEmptyRow('Run a simulation to see per-process results.', 6));
}

/**
 * Toggles the header system LED between idle and live states.
 * @param {{systemLed:HTMLElement, systemLedLabel:HTMLElement}} dom
 * @param {boolean} isRunning
 */
export function renderSystemLed(dom, isRunning) {
  if (!dom) return;
  if (dom.systemLed) dom.systemLed.classList.toggle('led--live', isRunning);
  if (dom.systemLedLabel) dom.systemLedLabel.textContent = isRunning ? 'SIMULATION RUNNING' : 'SYSTEM IDLE';
}

/* ---------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------- */

function buildCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function buildStatusCell(status) {
  const td = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'status-pill';
  pill.dataset.status = status;
  pill.textContent = STATUS_LABELS[status] || status;
  td.appendChild(pill);
  return td;
}

/** Renders a process's current MLFQ queue level as a color-coded pill, or
 * an em-dash for algorithms that don't have levels (level is null). */
function buildLevelCell(level) {
  const td = document.createElement('td');
  if (level === null || level === undefined) {
    td.textContent = '—';
    return td;
  }
  const pill = document.createElement('span');
  pill.className = 'level-pill';
  pill.dataset.level = String(level);
  pill.textContent = `Q${level}`;
  td.appendChild(pill);
  return td;
}

function buildEmptyRow(message, colSpan = 5) {
  const row = document.createElement('tr');
  row.className = 'table-empty-row';
  const cell = document.createElement('td');
  cell.colSpan = colSpan;
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}
