# CPU Scheduling Simulator — Diagnostics Console

A browser-based visualization of classic CPU scheduling algorithms, built for the
Operating Systems course (Project 01) at the University of San Jose-Recoletos. Processes
are queued through an interactive control panel, run through a chosen scheduling
algorithm, and animated second-by-second across a live status table and Gantt chart.

**Author:** Solo project.

---

## 1. Project Overview

The simulator is a single-page, no-build-step web app split into a clean data →
compute → timing → display pipeline:

| Layer | File | Responsibility |
|---|---|---|
| Data | `js/processManager.js` | Owns the in-memory process queue; validates and mutates it (enqueue, dequeue, update, random-generate). No DOM access. |
| Compute | `js/algorithms.js` | Pure functions — takes a process snapshot, returns `{ processes, timeline, metrics }` for a given algorithm. No DOM access. |
| Timing | `js/simulationEngine.js` | Steps through a computed `timeline` on an interval clock and derives a live-state snapshot every tick. No DOM access. |
| Display | `js/uiRenderer.js` | Pure DOM-writing functions — renders whatever snapshot it's handed. No state of its own. |
| Export | `js/exportManager.js` | Builds a CSV from a completed result and triggers a browser download. Its only DOM touch is the throwaway `<a download>` anchor the browser's file-save mechanism needs. |
| Orchestration | `js/app.js` | Wires DOM events to the layers above. |

Because the compute layer is pure and DOM-free, every algorithm's output can be
inspected or unit-tested independently of the UI.

---

## 2. How to Run It

This project uses native ES modules (`<script type="module">`), which browsers block
from loading over the `file://` protocol for security reasons. **You must serve it over
`http://`** — opening `index.html` by double-clicking it will show a blank page with
module-loading errors in the console.

### Option A — XAMPP / Apache (recommended for this course)
1. Copy the whole project folder into `htdocs` (e.g. `C:\xampp\htdocs\cpu-scheduling-simulator` or `/Applications/XAMPP/htdocs/cpu-scheduling-simulator`).
2. Start Apache from the XAMPP control panel.
3. Visit `http://localhost/cpu-scheduling-simulator/` in your browser.

### Option B — any local static server
From the project root:
```bash
# Python 3
python3 -m http.server 8000

# Node (if you have npx available)
npx serve .
```
Then open `http://localhost:8000`.

No build step, no `npm install`, no dependencies — just serve the folder as-is.

---

## 3. Project Structure

```
cpu-scheduling-simulator/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── algorithms.js       — FCFS, SJF, SRTF, Priority (NP/P), Round Robin, MLFQ,
    │                         + optional context-switch delay overhead
    ├── processManager.js   — in-memory process CRUD
    ├── simulationEngine.js — pure timing engine, no DOM
    ├── uiRenderer.js       — all DOM rendering
    ├── exportManager.js    — CSV export + browser download trigger
    └── app.js              — event wiring, orchestration
```

---

## 4. Scheduling Algorithms Implemented

All algorithms simulate second-by-second and return per-process Arrival, Burst,
Completion, Turnaround, Waiting, and Response times, plus averaged metrics.

- **FCFS (First Come First Serve)** — non-preemptive; processes run strictly in
  arrival order.
- **SJF (Shortest Job First)** — non-preemptive; among ready processes, the one with
  the smallest remaining burst runs next, but once started it runs to completion.
- **SRTF (Shortest Remaining Time First)** — the preemptive version of SJF; the
  ready process with the least remaining time is re-selected every tick, so a
  shorter arrival can interrupt a longer one already running.
- **Priority — Non-Preemptive** — the highest-priority ready process (lowest
  numeric value = highest priority) is picked when the CPU frees up, then runs
  uninterrupted.
- **Priority — Preemptive** — same priority rule, but re-evaluated every tick, so a
  higher-priority arrival can interrupt whatever is currently running.
- **Round Robin (RR)** — each ready process gets a fixed time-quantum slice in
  strict FIFO rotation; if it doesn't finish within its slice it goes to the back
  of the queue. Newly-arrived processes join the queue ahead of a
  just-preempted one.
- **MLFQ (Multilevel Feedback Queue)** — four priority queues, Q0 (highest) through
  Q3 (lowest). Every level except the bottom runs Round Robin with its own time
  quantum; the bottom level runs FCFS so nothing can starve indefinitely. A
  process that burns through its full allotment at a level without finishing is
  demoted one level down. A higher-priority queue gaining a process immediately
  preempts whatever's running at a lower level. Quantum and allotment double at
  each level below the top, scaled from the configurable Q0 base values (or
  sensible defaults — quantum 2, allotment 4 — if left blank). The queue level a
  process is running at is shown live in the Live Simulation Status table and as
  a color-coded border on each Gantt chart block (see the legend above the chart).

**Optional context-switching delay (bonus):** every algorithm above accepts a
configurable `contextSwitchDelay` (the "Context-Switch Delay" field in the Algorithm
panel, default 0 = off). Whenever the CPU timeline hands off from one process directly
to a *different* process, that many overhead ticks are inserted before the next
process runs — idle-to-process and process-to-idle handoffs are exempt, matching the
usual simplified textbook treatment. Every process's Completion/Turnaround/Waiting/
Response time and the averaged metrics (including Total Execution Time and CPU
Utilization) are recomputed against the padded timeline, so the overhead is fully
reflected in the results. Overhead ticks render as a red-hatched "CS" block on the
Gantt chart, distinct from a plain idle gap.

---

## 5. Sample Input & Expected Output

**Input** (added via the Process Input panel or equivalent random-generated batch):

| Process | Arrival | Burst | Priority |
|---|---|---|---|
| P1 | 0 | 5 | 1 |
| P2 | 1 | 3 | 2 |
| P3 | 2 | 8 | 1 |

**Expected output — FCFS:**

| Process | Arrival | Burst | Completion | Turnaround | Response |
|---|---|---|---|---|---|
| P1 | 0 | 5 | 5 | 5 | 0 |
| P2 | 1 | 3 | 8 | 7 | 4 |
| P3 | 2 | 8 | 16 | 14 | 6 |

Averages: Avg Waiting Time ≈ 3.33, Avg Turnaround Time ≈ 8.67, Avg Response Time ≈
3.33, Total Execution Time = 16, CPU Utilization = 100%.

The same three processes under **Round Robin (quantum = 2)** finish in a different
order with different response/turnaround figures (P2 gets a much lower response time
of 1, since RR interleaves it early), which is a good way to sanity-check that the
algorithm switch is actually changing scheduling behavior — run both from the
Algorithm dropdown and compare the Process Results panel.

---

## 6. Exporting Results

Once a simulation finishes, the **⭳ Export CSV** button above the Process Results
table (panel 08) becomes active. It downloads a CSV with:

- The algorithm name, the context-switch delay setting used, and a timestamp
- The full per-process results table (Arrival, Burst, Completion, Turnaround,
  Waiting, Response)
- The averaged metrics (Avg Waiting/Turnaround/Response/Burst Time, Total Execution
  Time, CPU Utilization)

The button is disabled again whenever a new simulation starts or Reset All is pressed,
so it can never export stale results.

## 7. Known Bugs, Limitations & Incomplete Features

- **Terminal/console deliverable (Phase 8):** not yet implemented. The project brief
  is ambiguous about whether the browser GUI satisfies the "must run in
  terminal/console" requirement or whether a separate console program is required
  in addition — this is pending instructor clarification.
- **No persistence:** the process queue lives in memory only; refreshing the page
  or navigating away clears it. There is no save/load or localStorage support.
- **No export:** results can't yet be exported to CSV or a text file (tracked as an
  optional bonus feature, not yet built).
- **No context-switching delay:** the simulator assumes zero-cost context switches
  between processes (also tracked as an optional bonus feature).
- **Safety valve on malformed input:** every algorithm caps its simulation loop at
  `totalBurstTime + latestArrivalTime + 1000` ticks so a pathological input can
  never hang the browser tab; this should never be reachable with normal input but
  is worth knowing about if a simulation appears to cut off unexpectedly.
- **MLFQ level count is fixed at 4** in the UI (Q0–Q3) even though the underlying
  `mlfq()` function accepts a configurable `numLevels`; there's no dropdown/input to
  change it from the interface.
- **Single active simulation:** starting a new simulation while one is animating
  restarts cleanly from tick 0 rather than queuing — this is intentional, not a bug,
  but worth noting if the Gantt chart appears to reset unexpectedly.

---

## 7. Screenshots

*(Add screenshots of the Diagnostics Console here — e.g. the full dashboard at rest,
a mid-run Gantt chart, and the Process Results panel after a completed run.)*
