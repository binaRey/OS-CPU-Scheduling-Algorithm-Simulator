/**
 * exportManager.js — Export Layer (Phase 10 bonus)
 * -------------------------------------------------------------
 * Turns a completed scheduling result into a downloadable CSV file.
 * Reads only the data it's handed by app.js (algorithms.js's
 * result.processes / result.metrics, plus the algorithm label) — it
 * never reaches back into processManager, algorithms, or
 * simulationEngine. The one DOM touch it makes is the browser's own
 * file-save mechanism (a throwaway <a download> click), which is
 * unavoidable for a client-side export and is kept isolated here so
 * uiRenderer.js can stay focused on painting the live dashboard.
 * -------------------------------------------------------------
 */

/** Escapes a single CSV field — wraps in quotes only when needed. */
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields) {
  return `${fields.map(csvEscape).join(',')}\r\n`;
}

/**
 * Builds CSV text: a header block (algorithm + settings), the
 * per-process results table, then the averaged metrics.
 * @param {{algorithmLabel:string, processes:Array<Object>, metrics:Object,
 *           contextSwitchDelay?:number}} data
 * @returns {string}
 */
export function buildResultsCsv({ algorithmLabel, processes, metrics, contextSwitchDelay = 0 }) {
  let csv = '';
  csv += csvRow(['CPU Scheduling Simulation Results']);
  csv += csvRow(['Algorithm', algorithmLabel]);
  csv += csvRow(['Context-Switch Delay (ticks)', contextSwitchDelay]);
  csv += csvRow(['Generated', new Date().toISOString()]);
  csv += '\r\n';

  csv += csvRow(['Process', 'Arrival', 'Burst', 'Completion', 'Turnaround', 'Waiting', 'Response']);
  (processes || [])
    .slice()
    .sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id)
    .forEach((p) => {
      csv += csvRow([p.name, p.arrivalTime, p.burstTime, p.completionTime, p.turnaroundTime, p.waitingTime, p.responseTime]);
    });

  csv += '\r\n';
  csv += csvRow(['Metric', 'Value']);
  csv += csvRow(['Avg Waiting Time', metrics?.avgWaitingTime ?? 0]);
  csv += csvRow(['Avg Turnaround Time', metrics?.avgTurnaroundTime ?? 0]);
  csv += csvRow(['Avg Response Time', metrics?.avgResponseTime ?? 0]);
  csv += csvRow(['Avg Burst Time', metrics?.avgBurstTime ?? 0]);
  csv += csvRow(['Total Execution Time', metrics?.totalExecutionTime ?? 0]);
  csv += csvRow(['CPU Utilization (%)', metrics?.cpuUtilization ?? 0]);

  return csv;
}

/** Triggers a client-side file download via a throwaway <a download> anchor. */
export function downloadTextFile(filename, content, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Convenience wrapper: builds the CSV and immediately downloads it,
 * named after the algorithm and timestamped so repeat runs don't collide. */
export function exportResultsAsCsv({ algorithmKey, algorithmLabel, processes, metrics, contextSwitchDelay }) {
  const csv = buildResultsCsv({ algorithmLabel, processes, metrics, contextSwitchDelay });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  downloadTextFile(`cpu-scheduling-${algorithmKey}-${stamp}.csv`, csv);
}
