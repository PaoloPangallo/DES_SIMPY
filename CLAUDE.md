# CLAUDE.md

## Project Overview
**DES Arena** is a general-purpose Discrete Event Simulator (DES) inspired by tools like AnyLogic and Arena.
- **Backend**: Python + FastAPI + SimPy (`backend/`)
- **Frontend**: React + Ant Design + Recharts + Zustand (`frontend/`)
- **Key Feature**: Real-time WebSocket streaming of simulation events for live visualization.

## Development Commands

### Full Application
- Launch script (Windows): `powershell -File .\start_arena.ps1` (Starts BE on 8002, FE on 5174, and opens browser)

### Backend (`backend/`)
- **Install**: `pip install -r requirements.txt`
- **Run**: `uvicorn main:app --reload --port 8002`
- **Test**: `pytest` or `pytest tests/test_call_center.py`
- **Coverage**: `pytest --cov=app --cov-report=term-missing`
- **Benchmark**: `python scripts/benchmark_sim.py`

### Frontend (`frontend/`)
- **Install**: `npm install`
- **Run**: `npm run dev -- --port 5174`
- **Build**: `npm run build`
- **Preview**: `npm run preview`

---

## Technical Architecture

### 1. Backend Core Logic
- **SimPy Threading**: SimPy is synchronous and blocking. It runs in a separate thread via `asyncio.to_thread(_run_sync)`.
- **Event Bus**: Bridges the synchronous SimPy thread to the asynchronous FastAPI/WebSockets world using `loop.call_soon_threadsafe()`.
- **Back-pressure**: The `EventBus` has a maximum size (500). Events are dropped silently if the queue is full to avoid stalling the simulation.
- **Incremental KPIs**: KPIs are calculated incrementally (e.g., Welford's algorithm) within the SimPy loop to ensure high performance.

### 2. Frontend State Management
- **Zustand**: Using `useSimStore` in `src/store/simStore.ts` as the single source of truth.
- **Real-time Handling**: `pushEvent` and `pushBatch` handle incoming WebSocket messages, maintaining a history of KPIs and events.
- **Batching**: Simulation events are often batched on the server to reduce React re-renders.

### 3. Communication
- **REST**: Lifecycle management (create, run, pause, resume, stop, delete) and configuration discovery.
- **WebSocket**: Continuous stream of `SimulationEvent` objects.

---

## Coding Standards & Conventions

### Python (Backend)
- **Type Hints**: Required for all functions and classes.
- **Pydantic**: Use for all API request/response models and scenario configurations.
- **Docstrings**: Google-style or standard descriptive docstrings for public APIs.
- **Naming**: `snake_case` for variables/functions, `PascalCase` for classes.
- **Threading**: Never perform I/O or block the main thread; use `asyncio.to_thread` for long-running SimPy synchronous code.

### TypeScript (Frontend)
- **Naming**: `camelCase` for variables/functions/props, `PascalCase` for Components.
- **Props**: Always define interfaces for Component props.
- **Zustand**: Keep store updates granular. Use `pushBatch` when processing multiple events from the socket.
- **Canvas Rendering**: Use `requestAnimationFrame` for animations based on the `simTime` received from the store.

### Scenario Development
1. Create scenario in `backend/app/scenarios/`.
2. Define Pydantic config in `backend/app/models/configs.py`.
3. Register in `backend/app/scenarios/__init__.py`.
4. The frontend will automatically generate the config UI based on the Pydantic model.

---

## Project Structure
- `backend/app/engine/`: Core SimPy runner and event bus.
- `backend/app/scenarios/`: Simulation logic implementations.
- `backend/app/routers/`: API endpoints.
- `frontend/src/components/`: UI components (including `ArenaCanvas`).
- `frontend/src/store/`: State management (Zustand).
- `frontend/src/pages/`: Main application pages.

---

## Next 3 Sprints Roadmap

See `ROADMAP.md` for full details.

### Sprint 1: Advanced Visualization & Analytics [DONE]
- [X] Congestion heatmaps on `ArenaCanvas` for real-time bottleneck detection
- [X] Analytical exports (Parquet/DuckDB) for high-volume event data
- [X] Configurable KPI alert thresholds with UI highlighting

### Sprint 2: Interactive Scenario Builder
- Visual logic nodes extending the graph-based scenario with branching support
- Resource library with pre-defined templates (workers, machines, etc.)
- Configuration versioning for save/compare "What-if" scenarios

### Sprint 3: Statistical Optimization
- Monte Carlo engine for parallel simulation runs with confidence intervals
- Sensitivity analysis via multi-run parameter sweeping
- Comparison dashboard with statistical visualizations (box plots, histograms)
