# DES Arena – Development Roadmap [Sprint 1 COMPLETE]

## Sprint 1: Advanced Visualization & Analytics [DONE]

### 1.1 Congestion Heatmaps
- Overlay a color-coded heatmap on `ArenaCanvas` zones based on queue depth or entity wait time
- Use a green→yellow→red gradient; intensity driven by rolling average occupancy from the Zustand store
- Render as a semi-transparent fill layer beneath entities, updated on each animation frame

### 1.2 Analytical Exports
- Add a backend endpoint `/simulations/{id}/export` returning event history in Parquet format via `pyarrow`
- Optionally expose a DuckDB query interface for ad-hoc analysis of large event logs
- Frontend: download button in the ArenaPage toolbar

### 1.3 KPI Alerts
- Extend `simStore` with an `alerts` slice: `{ kpiKey, operator, threshold, triggered }[]`
- Backend: emit a `kpi_alert` event type when a threshold is crossed during the SimPy loop
- Frontend: highlight the relevant KPI card with a pulsing border; show a dismissible notification toast

---

## Sprint 2: Interactive Scenario Builder

### 2.1 Visual Logic Nodes
- Build a node-graph editor (React Flow or custom canvas) where each node represents a scenario step (arrival, service, routing, departure)
- Support conditional branching edges (e.g., "if queue > N, route to overflow")
- Serialize the graph to a JSON format that the backend can parse into a SimPy process

### 2.2 Resource Library
- Provide a sidebar palette of pre-configured actor templates: `Worker`, `Machine`, `Buffer`, `Conveyor`
- Each template ships with sensible default parameters and a Pydantic config schema
- Drag-and-drop onto the node graph to instantiate

### 2.3 Configuration Versioning
- Store named snapshots of scenario configs in browser `localStorage` (or optionally a backend table)
- UI: "Save snapshot" and "Restore snapshot" buttons in the config panel
- Diff viewer to compare two snapshots side-by-side before running a What-if experiment

---

## Sprint 3: Statistical Optimization

### 3.1 Monte Carlo Engine
- Add a `/simulations/batch` endpoint that accepts a base config + N replications + optional seed list
- Backend runs N simulations in a `ProcessPoolExecutor`, aggregating KPI distributions
- Return percentile statistics (p10, p50, p90) and raw replication data

### 3.2 Sensitivity Analysis
- Define a `SweepConfig`: parameter name, range (min/max/step), metric to observe
- Backend sweeps parameter values and runs a simulation per point, collecting the target metric
- Return a 2D grid suitable for a heatmap or line chart

### 3.3 Comparison Dashboard
- New frontend page `/experiments` listing past batch runs
- Per-experiment: box plot (Recharts `ComposedChart`) of KPI distributions across replications
- Side-by-side histogram for comparing two experiments
- Export comparison as CSV or PNG

---

## Technical Debt & Cross-Cutting Concerns

- **Test coverage**: maintain ≥80% across backend and frontend throughout all sprints
- **Performance**: profile canvas rendering at >200 entities; consider off-screen canvas or WebGL if needed
- **Accessibility**: ensure all new UI controls have ARIA labels and keyboard navigation
