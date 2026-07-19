/**
 * app.js — Core System Entry Point
 * -------------------------------------------------------------
 * Bootstraps DOM references and wires UI events to the data layer
 * (processManager), the compute layer (algorithms), the timing
 * layer (simulationEngine), and the display layer (uiRenderer).
 * -------------------------------------------------------------
 */

import * as processManager from './processManager.js';
import * as algorithms from './algorithms.js';
import * as simulationEngine from './simulationEngine.js';
import * as uiRenderer from './uiRenderer.js';

const ALGORITHM_LABELS = {
  fcfs: 'FCFS',
  sjf: 'SJF',
  srtf: 'SRTF',
  'priority-np': 'Priority (Non-Preemptive)',
  'priority-p': 'Priority (Preemptive)',
  rr: 'Round Robin',
  mlfq: 'MLFQ',
};

const dom = {};

/** Full result object from the most recent algorithms.runScheduler() call —
 * kept around so handleSimComplete can render final per-process figures
 * (completionTime/turnaroundTime/responseTime) that the live snapshot
 * doesn't carry. */
let lastSchedulingResult = null;

function cacheDom() {
  dom.inputName = document.getElementById('inputName');
  dom.inputType = document.getElementById('inputType');
  dom.inputArrival = document.getElementById('inputArrival');
  dom.inputBurst = document.getElementById('inputBurst');
  dom.inputPriority = document.getElementById('inputPriority');

  dom.randomLength = document.getElementById('randomLength');
  dom.positionInput = document.getElementById('positionInput');
  dom.btnGenerateRandom = document.getElementById('btnGenerateRandom');
  dom.btnEnqueue = document.getElementById('btnEnqueue');
  dom.btnDequeue = document.getElementById('btnDequeue');
  dom.btnUpdate = document.getElementById('btnUpdate');

  dom.pendingQueueBody = document.getElementById('pendingQueueBody');
  dom.actionMessage = document.getElementById('actionMessage');

  dom.quantumField = document.getElementById('quantumField');
  dom.quantumSlider = document.getElementById('quantumSlider');
  dom.quantumValue = document.getElementById('quantumValue');
  dom.allotmentField = document.getElementById('allotmentField');
  dom.allotmentInput = document.getElementById('allotmentInput');
  dom.speedSlider = document.getElementById('speedSlider');
  dom.speedValue = document.getElementById('speedValue');

  dom.algorithmSelect = document.getElementById('algorithmSelect');
  dom.btnSimulate = document.getElementById('btnSimulate');
  dom.btnResetAll = document.getElementById('btnResetAll');

  dom.ganttLevelLegend = document.getElementById('ganttLevelLegend');

  dom.simStatusBody = document.getElementById('simStatusBody');
  dom.metricAvgWaiting = document.getElementById('metricAvgWaiting');
  dom.metricAvgExec = document.getElementById('metricAvgExec');
  dom.metricTotalExec = document.getElementById('metricTotalExec');
  dom.metricAvgTurnaround = document.getElementById('metricAvgTurnaround');
  dom.metricAvgResponse = document.getElementById('metricAvgResponse');

  dom.resultsBody = document.getElementById('resultsBody');

  dom.cpuStatus = document.getElementById('cpuStatus');
  dom.nextQueueName = document.getElementById('nextQueueName');
  dom.overallProgressBar = document.getElementById('overallProgressBar');
  dom.overallProgressFill = document.getElementById('overallProgressFill');

  dom.ganttChart = document.getElementById('ganttChart');

  dom.systemLed = document.getElementById('systemLed');
  dom.systemLedLabel = document.getElementById('systemLedLabel');
}

/* ---------------------------------------------------------------
 * Form helpers
 * ------------------------------------------------------------- */

function readInputFields() {
  return {
    name: dom.inputName.value,
    type: dom.inputType.value,
    arrivalTime: dom.inputArrival.value,
    burstTime: dom.inputBurst.value,
    priority: dom.inputPriority.value,
  };
}

function clearInputFields() {
  dom.inputName.value = '';
  dom.inputArrival.value = '';
  dom.inputBurst.value = '';
  dom.inputPriority.value = '';
  dom.inputName.focus();
}

/** Reads and validates the "Target Position" field shared by Dequeue/Update. */
function readTargetPosition() {
  const raw = dom.positionInput.value;
  const index = Number(raw);

  if (raw === '' || !Number.isInteger(index) || index < 0) {
    showMessage('Enter a valid target position (0-based row index) first.', 'error');
    return null;
  }
  return index;
}

function refreshQueueTable() {
  uiRenderer.renderPendingQueue(processManager.getProcesses(), dom.pendingQueueBody);
}

function showMessage(text, tone = 'info') {
  uiRenderer.renderActionMessage(dom.actionMessage, text, tone);
}

/** Locks/unlocks queue-editing while a simulation is animating, so the
 * Pending Queue table can never drift out of sync with what's actively
 * being simulated against a frozen snapshot. */
function setQueueControlsDisabled(disabled) {
  [dom.btnEnqueue, dom.btnDequeue, dom.btnUpdate, dom.btnGenerateRandom].forEach((btn) => {
    btn.disabled = disabled;
  });
}

/* ---------------------------------------------------------------
 * Action handlers
 * ------------------------------------------------------------- */

function handleEnqueue() {
  const result = processManager.enqueueProcess(readInputFields());

  if (!result.ok) {
    showMessage(result.errors.join(' '), 'error');
    return;
  }

  refreshQueueTable();
  showMessage(`Enqueued "${result.process.name}" at position ${result.index}.`, 'success');
  clearInputFields();
}

function handleDequeue() {
  const index = readTargetPosition();
  if (index === null) return;

  const result = processManager.dequeueProcessAt(index);
  if (!result.ok) {
    showMessage(result.errors.join(' '), 'error');
    return;
  }

  refreshQueueTable();
  showMessage(`Removed "${result.process.name}" from position ${index}.`, 'success');
}

function handleUpdate() {
  const index = readTargetPosition();
  if (index === null) return;

  const result = processManager.updateProcessAt(index, readInputFields());
  if (!result.ok) {
    showMessage(result.errors.join(' '), 'error');
    return;
  }

  refreshQueueTable();
  showMessage(`Updated position ${index} → "${result.process.name}".`, 'success');
}

function handleGenerateRandom() {
  const created = processManager.generateRandomProcesses(dom.randomLength.value);
  refreshQueueTable();
  showMessage(
    `Generated ${created.length} random process${created.length === 1 ? '' : 'es'} and added to the queue.`,
    'success'
  );
}

/* ---------------------------------------------------------------
 * Simulation handlers
 * ------------------------------------------------------------- */

function handleSimulate() {
  const processes = processManager.getProcesses();

  if (processes.length === 0) {
    showMessage('Add at least one process to the queue before simulating.', 'error');
    return;
  }

  const algorithmKey = dom.algorithmSelect.value;
  let result;
  try {
    result = algorithms.runScheduler(algorithmKey, processes, {
      timeQuantum: dom.quantumSlider.value,
      allotment: dom.allotmentInput.value,
    });
  } catch (err) {
    showMessage(err.message, 'error');
    return;
  }

  if (result.timeline.length === 0) {
    showMessage('Nothing to simulate — every process has a zero burst time.', 'error');
    return;
  }

  uiRenderer.resetGantt(dom.ganttChart);
  uiRenderer.resetSimStatusTable(dom.simStatusBody);
  uiRenderer.resetResultsTable(dom.resultsBody);

  lastSchedulingResult = result;

  simulationEngine.configure({
    timeline: result.timeline,
    processes: result.processes,
    speed: Number(dom.speedSlider.value),
    finalMetrics: {
      avgWaitingTime: result.metrics.avgWaitingTime,
      avgExecutionTime: result.metrics.avgBurstTime,
      totalExecutionTime: result.metrics.totalExecutionTime,
      avgTurnaroundTime: result.metrics.avgTurnaroundTime,
      avgResponseTime: result.metrics.avgResponseTime,
    },
    onTick: handleTick,
    onComplete: handleSimComplete,
  });

  simulationEngine.startSimulation();
  uiRenderer.renderSystemLed(dom, true);
  setQueueControlsDisabled(true);
  showMessage(
    `Running ${ALGORITHM_LABELS[algorithmKey] || algorithmKey} across ${result.processes.length} process(es)...`,
    'info'
  );
}

function handleTick(snapshot) {
  uiRenderer.renderSimStatusTable(snapshot, dom.simStatusBody);
  uiRenderer.renderMetrics(snapshot.metrics, dom);
  uiRenderer.renderCpuMatrix(snapshot, dom);
  uiRenderer.appendGanttBlock(
    {
      second: snapshot.second,
      processId: snapshot.cpu.processId,
      processName: snapshot.cpu.processName,
      level: snapshot.cpu.level,
    },
    dom.ganttChart
  );
}

function handleSimComplete(finalSnapshot) {
  uiRenderer.renderSimStatusTable(finalSnapshot, dom.simStatusBody);
  uiRenderer.renderMetrics(finalSnapshot.metrics, dom);
  uiRenderer.renderCpuMatrix(finalSnapshot, dom);
  uiRenderer.renderSystemLed(dom, false);
  if (lastSchedulingResult) {
    uiRenderer.renderResultsTable(lastSchedulingResult.processes, dom.resultsBody);
  }
  setQueueControlsDisabled(false);
  showMessage('Simulation complete.', 'success');
}

function handleResetAll() {
  simulationEngine.stopSimulation();
  processManager.resetProcesses();
  lastSchedulingResult = null;

  refreshQueueTable();
  uiRenderer.resetSimStatusTable(dom.simStatusBody);
  uiRenderer.resetResultsTable(dom.resultsBody);
  uiRenderer.resetMetrics(dom);
  uiRenderer.resetCpuMatrix(dom);
  uiRenderer.resetGantt(dom.ganttChart);
  uiRenderer.renderSystemLed(dom, false);
  setQueueControlsDisabled(false);

  dom.algorithmSelect.value = 'fcfs';
  updateAlgorithmFieldsVisibility();
  dom.speedSlider.value = '1';
  dom.speedValue.textContent = '1×';
  dom.quantumSlider.value = '2';
  dom.quantumValue.textContent = '2';
  dom.allotmentInput.value = '';

  clearInputFields();
  dom.positionInput.value = '';
  dom.randomLength.value = '';

  showMessage('All state cleared. Ready for new input.', 'info');
}

/* ---------------------------------------------------------------
 * Static UI wiring
 * ------------------------------------------------------------- */

function updateAlgorithmFieldsVisibility() {
  const algorithmKey = dom.algorithmSelect.value;
  const isRoundRobin = algorithmKey === 'rr';
  const isMlfq = algorithmKey === 'mlfq';
  dom.quantumField.classList.toggle('is-hidden', !isRoundRobin && !isMlfq);
  dom.allotmentField.classList.toggle('is-hidden', !isMlfq);
  dom.ganttLevelLegend.classList.toggle('is-hidden', !isMlfq);
}

function wireSliderReadouts() {
  dom.quantumSlider.addEventListener('input', () => {
    dom.quantumValue.textContent = dom.quantumSlider.value;
  });
  dom.speedSlider.addEventListener('input', () => {
    dom.speedValue.textContent = `${dom.speedSlider.value}×`;
    if (simulationEngine.isRunning()) {
      simulationEngine.setSpeed(dom.speedSlider.value);
    }
  });
  dom.algorithmSelect.addEventListener('change', updateAlgorithmFieldsVisibility);
}

/* ---------------------------------------------------------------
 * Bootstrap
 * ------------------------------------------------------------- */

function bindEvents() {
  dom.btnEnqueue.addEventListener('click', handleEnqueue);
  dom.btnDequeue.addEventListener('click', handleDequeue);
  dom.btnUpdate.addEventListener('click', handleUpdate);
  dom.btnGenerateRandom.addEventListener('click', handleGenerateRandom);
  dom.btnSimulate.addEventListener('click', handleSimulate);
  dom.btnResetAll.addEventListener('click', handleResetAll);
}

function init() {
  cacheDom();
  bindEvents();
  wireSliderReadouts();
  updateAlgorithmFieldsVisibility();
  refreshQueueTable();
}

document.addEventListener('DOMContentLoaded', init);
