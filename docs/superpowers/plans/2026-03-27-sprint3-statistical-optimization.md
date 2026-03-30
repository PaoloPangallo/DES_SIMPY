# Sprint 3: Statistical Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Monte Carlo batch-run engine to the backend and a statistical comparison dashboard to the frontend, enabling multi-replication experiments with box plots and histograms.

**Architecture:** A new `/simulations/batch` endpoint runs N independent simulation replications synchronously in a `ProcessPoolExecutor`, returning aggregated KPI percentile statistics. A new `/experiments` frontend page lists past batch runs (stored in a backend dict), renders box plots via Recharts `ComposedChart`, and exports CSVs. Existing single-run scenario classes are reused unchanged.

**Tech Stack:** Python `concurrent.futures.ProcessPoolExecutor` (parallel runs), `statistics` stdlib (percentiles), FastAPI (new router), React + Recharts `ComposedChart` (box plots), Ant Design Table (experiment list).

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/app/engine/batch_runner.py` | Run N replications in a process pool, return stats |
| Create | `backend/app/routers/experiments.py` | `/simulations/batch` and `/experiments` REST endpoints |
| Modify | `backend/main.py` | Register experiments router |
| Create | `backend/tests/test_batch_runner.py` | Unit tests for batch runner |
| Create | `frontend/src/pages/ExperimentsPage.tsx` | Experiment list + box plots + histogram |
| Create | `frontend/src/components/BoxPlot.tsx` | Recharts-based box plot component |
| Modify | `frontend/src/App.tsx` | Add `/experiments` route |
| Modify | `frontend/src/pages/HomePage.tsx` | Add "Experiments" nav link |

---

## Task 1: Batch Runner — Backend Engine

**Files:**
- Create: `backend/app/engine/batch_runner.py`
- Test: `backend/tests/test_batch_runner.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_batch_runner.py`:

```python
import pytest
from app.engine.batch_runner import run_single_replication, run_batch, BatchResult


def test_run_single_replication_returns_kpis():
    result = run_single_replication(
        scenario_type="call_center",
        config={"num_agents": 3, "arrival_rate": 2.0, "service_rate": 1.5, "patience": 10.0, "max_queue": 20},
        duration=5.0,
        seed=42,
    )
    assert isinstance(result, dict)
    assert "throughput" in result
    assert result["throughput"] >= 0


def test_run_batch_returns_percentiles():
    result = run_batch(
        scenario_type="call_center",
        config={"num_agents": 3, "arrival_rate": 2.0, "service_rate": 1.5, "patience": 10.0, "max_queue": 20},
        duration=5.0,
        n_replications=3,
    )
    assert isinstance(result, BatchResult)
    assert "throughput" in result.percentiles
    p = result.percentiles["throughput"]
    assert "p10" in p and "p50" in p and "p90" in p
    assert p["p10"] <= p["p50"] <= p["p90"]
    assert len(result.replications) == 3


def test_run_batch_handles_zero_replications():
    with pytest.raises(ValueError, match="n_replications must be >= 1"):
        run_batch(
            scenario_type="call_center",
            config={"num_agents": 2, "arrival_rate": 1.0, "service_rate": 1.0, "patience": 5.0, "max_queue": 10},
            duration=5.0,
            n_replications=0,
        )
```

- [ ] **Step 2: Run to confirm they fail**

```
cd backend && pytest tests/test_batch_runner.py -v
```
Expected: FAIL — `ModuleNotFoundError: app.engine.batch_runner`

- [ ] **Step 3: Implement the batch runner**

Create `backend/app/engine/batch_runner.py`:

```python
"""Run N independent simulation replications and aggregate KPI statistics."""
from __future__ import annotations

import statistics
import random
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

from app.scenarios import SCENARIO_REGISTRY


@dataclass
class BatchResult:
    scenario_type: str
    n_replications: int
    replications: list[dict[str, float]]  # raw KPIs per replication
    percentiles: dict[str, dict[str, float]]  # kpi -> {p10, p25, p50, p75, p90, mean, std}


def run_single_replication(
    scenario_type: str,
    config: dict[str, Any],
    duration: float,
    seed: int | None = None,
) -> dict[str, float]:
    """Run one simulation replication synchronously (no async, no WS). Returns final KPIs."""
    entry = SCENARIO_REGISTRY.get(scenario_type)
    if entry is None:
        raise ValueError(f"Unknown scenario type: {scenario_type}")

    scenario_cls = entry["class"]
    config_cls = entry["config"]

    if seed is not None:
        random.seed(seed)

    # Build config, collect final KPIs via a no-op emit callback
    parsed_config = config_cls(**config)
    collected_kpis: dict[str, float] = {}

    def emit_noop(event_type: str, payload: dict, kpis: dict) -> None:
        collected_kpis.update(kpis)

    scenario = scenario_cls(config=parsed_config, emit=emit_noop)
    scenario.run(until=duration)

    # Fallback: call get_kpis if emit never fired
    if not collected_kpis:
        collected_kpis = scenario.get_kpis()

    return {k: float(v) for k, v in collected_kpis.items()}


def _compute_percentiles(values: list[float]) -> dict[str, float]:
    if len(values) == 0:
        return {"p10": 0.0, "p25": 0.0, "p50": 0.0, "p75": 0.0, "p90": 0.0, "mean": 0.0, "std": 0.0}
    sorted_vals = sorted(values)
    n = len(sorted_vals)

    def pct(p: float) -> float:
        idx = (p / 100) * (n - 1)
        lo, hi = int(idx), min(int(idx) + 1, n - 1)
        return sorted_vals[lo] + (idx - lo) * (sorted_vals[hi] - sorted_vals[lo])

    mean = statistics.mean(values)
    std = statistics.stdev(values) if n > 1 else 0.0
    return {"p10": pct(10), "p25": pct(25), "p50": pct(50), "p75": pct(75), "p90": pct(90), "mean": mean, "std": std}


def run_batch(
    scenario_type: str,
    config: dict[str, Any],
    duration: float,
    n_replications: int,
    max_workers: int = 4,
) -> BatchResult:
    if n_replications < 1:
        raise ValueError("n_replications must be >= 1")

    seeds = [random.randint(0, 2**31) for _ in range(n_replications)]
    replications: list[dict[str, float]] = []

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(run_single_replication, scenario_type, config, duration, seed): i
            for i, seed in enumerate(seeds)
        }
        results: list[dict[str, float] | None] = [None] * n_replications
        for fut in as_completed(futures):
            idx = futures[fut]
            results[idx] = fut.result()

    replications = [r for r in results if r is not None]

    # Aggregate per KPI
    all_keys: set[str] = set()
    for rep in replications:
        all_keys.update(rep.keys())

    percentiles: dict[str, dict[str, float]] = {}
    for key in all_keys:
        vals = [rep[key] for rep in replications if key in rep]
        percentiles[key] = _compute_percentiles(vals)

    return BatchResult(
        scenario_type=scenario_type,
        n_replications=n_replications,
        replications=replications,
        percentiles=percentiles,
    )
```

Note: This calls `scenario.run(until=duration)` directly. The base_scenario.py `run()` method wraps SimPy env.run(). Verify that method signature is correct after reading the file. If it differs, adjust the call accordingly.

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && pytest tests/test_batch_runner.py -v
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/batch_runner.py backend/tests/test_batch_runner.py
git commit -m "feat: add Monte Carlo batch runner engine with percentile aggregation"
```

---

## Task 2: Experiments Router — Backend

**Files:**
- Create: `backend/app/routers/experiments.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_experiments_router.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_experiments_router.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.engine.batch_runner import BatchResult

from main import app

client = TestClient(app)


def _mock_batch_result():
    return BatchResult(
        scenario_type="call_center",
        n_replications=2,
        replications=[{"throughput": 10.0}, {"throughput": 12.0}],
        percentiles={"throughput": {"p10": 10.0, "p25": 10.5, "p50": 11.0, "p75": 11.5, "p90": 12.0, "mean": 11.0, "std": 1.0}},
    )


def test_run_batch_returns_experiment_id():
    with patch("app.routers.experiments.run_batch", return_value=_mock_batch_result()):
        response = client.post("/experiments/run", json={
            "scenario_type": "call_center",
            "config": {"num_agents": 3, "arrival_rate": 2.0, "service_rate": 1.5, "patience": 10.0, "max_queue": 20},
            "duration": 10.0,
            "n_replications": 2,
        })
    assert response.status_code == 200
    data = response.json()
    assert "experiment_id" in data
    assert "percentiles" in data
    assert "throughput" in data["percentiles"]


def test_list_experiments_returns_entries():
    with patch("app.routers.experiments.run_batch", return_value=_mock_batch_result()):
        client.post("/experiments/run", json={
            "scenario_type": "call_center",
            "config": {"num_agents": 3, "arrival_rate": 2.0, "service_rate": 1.5, "patience": 10.0, "max_queue": 20},
            "duration": 10.0,
            "n_replications": 2,
        })
    response = client.get("/experiments/")
    assert response.status_code == 200
    assert len(response.json()) >= 1
```

- [ ] **Step 2: Run to confirm failure**

```
cd backend && pytest tests/test_experiments_router.py -v
```
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Create experiments router**

Create `backend/app/routers/experiments.py`:

```python
"""Batch experiment endpoints: run N replications and retrieve results."""
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.engine.batch_runner import run_batch, BatchResult

router = APIRouter(prefix="/experiments", tags=["experiments"])

# In-memory store (replace with DB in production)
_experiments: dict[str, dict] = {}


class BatchRunRequest(BaseModel):
    scenario_type: str
    config: dict[str, Any]
    duration: float
    n_replications: int = 10
    max_workers: int = 4


class BatchRunResponse(BaseModel):
    experiment_id: str
    scenario_type: str
    n_replications: int
    percentiles: dict[str, dict[str, float]]
    replications: list[dict[str, float]]
    created_at: str


@router.post("/run", response_model=BatchRunResponse)
async def run_experiment(req: BatchRunRequest):
    if req.n_replications < 1 or req.n_replications > 100:
        raise HTTPException(status_code=400, detail="n_replications must be between 1 and 100")

    result: BatchResult = run_batch(
        scenario_type=req.scenario_type,
        config=req.config,
        duration=req.duration,
        n_replications=req.n_replications,
        max_workers=req.max_workers,
    )

    exp_id = str(uuid.uuid4())
    record = {
        "experiment_id": exp_id,
        "scenario_type": result.scenario_type,
        "n_replications": result.n_replications,
        "percentiles": result.percentiles,
        "replications": result.replications,
        "created_at": datetime.utcnow().isoformat(),
    }
    _experiments[exp_id] = record
    return record


@router.get("/", response_model=list[dict])
async def list_experiments():
    return list(_experiments.values())


@router.get("/{experiment_id}", response_model=BatchRunResponse)
async def get_experiment(experiment_id: str):
    exp = _experiments.get(experiment_id)
    if exp is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp
```

- [ ] **Step 4: Register router in main.py**

Open `backend/main.py` and add:
```python
from app.routers.experiments import router as experiments_router
# ...
app.include_router(experiments_router)
```

- [ ] **Step 5: Run tests**

```
cd backend && pytest tests/test_experiments_router.py -v
```
Expected: PASS both tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/experiments.py backend/main.py backend/tests/test_experiments_router.py
git commit -m "feat: add /experiments batch run and list endpoints"
```

---

## Task 3: BoxPlot Component — Frontend

**Files:**
- Create: `frontend/src/components/BoxPlot.tsx`

A box plot rendered with Recharts `ComposedChart` using a Bar (box body) + ErrorBar (whiskers) combination.

- [ ] **Step 1: Create the BoxPlot component**

Create `frontend/src/components/BoxPlot.tsx`:

```tsx
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ErrorBar, Cell,
} from 'recharts';

interface BoxData {
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
}

interface Props {
  data: BoxData[];
  title?: string;
  unit?: string;
  color?: string;
}

// Recharts doesn't have a native box plot — we simulate one:
// Bar represents the IQR (p25 to p75). ErrorBar adds whiskers (p10/p90).
// The "bar" starts at p25 and has height (p75-p25).
// We use a custom shape to draw the median line.

function BoxShape(props: {
  x?: number; y?: number; width?: number; height?: number;
  value?: number[]; fill?: string; p50?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill = '#2563eb', p50 = 0 } = props;
  // y is top of bar in SVG coords, p50 position relative to bar
  const totalHeight = Math.abs(height);
  const midY = y + (height < 0 ? height : 0) + totalHeight / 2; // approximate — override with p50 mapping
  return (
    <g>
      <rect x={x} y={Math.min(y, y + height)} width={width} height={totalHeight}
        fill={fill} fillOpacity={0.35} stroke={fill} strokeWidth={1.5} />
      {/* Median line */}
      <line x1={x} x2={x + width} y1={midY} y2={midY}
        stroke={fill} strokeWidth={2.5} />
    </g>
  );
}

export default function BoxPlot({ data, title, unit = '', color = '#2563eb' }: Props) {
  // Transform for Recharts: each data point = { label, base: p25, boxHeight: p75-p25, errorNeg: p25-p10, errorPos: p90-p75 }
  const chartData = data.map(d => ({
    label: d.label,
    base: d.p25,
    boxHeight: d.p75 - d.p25,
    errorNeg: d.p25 - d.p10,
    errorPos: d.p90 - d.p75,
    p50: d.p50,
    mean: d.mean,
  }));

  return (
    <div>
      {title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: '#1e293b' }}>{title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit={unit} />
          <Tooltip
            formatter={(val: number, name: string) => [
              `${val.toFixed(3)}${unit}`,
              name === 'boxHeight' ? 'IQR (p25–p75)' : name,
            ]}
          />
          <Bar dataKey="boxHeight" stackId="box" fill={color} shape={<BoxShape fill={color} />}>
            <ErrorBar dataKey="errorNeg" width={8} strokeWidth={2} stroke={color} direction="y" />
            <ErrorBar dataKey="errorPos" width={8} strokeWidth={2} stroke={color} direction="y" />
            {chartData.map((_, i) => <Cell key={i} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/BoxPlot.tsx
git commit -m "feat: add BoxPlot component using Recharts ComposedChart"
```

---

## Task 4: Experiments Page — Frontend

**Files:**
- Create: `frontend/src/pages/ExperimentsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: Create ExperimentsPage**

Create `frontend/src/pages/ExperimentsPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { Button, Table, Typography, Select, Space, Card, Spin, message, Empty, Tabs } from 'antd';
import { BarChartOutlined, DownloadOutlined, SyncOutlined } from '@ant-design/icons';
import BoxPlot from '../components/BoxPlot';

const { Title, Text } = Typography;

interface Experiment {
  experiment_id: string;
  scenario_type: string;
  n_replications: number;
  percentiles: Record<string, Record<string, number>>;
  replications: Record<string, number>[];
  created_at: string;
}

const API = 'http://localhost:8002';

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const fetchExperiments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/experiments/`);
      const data = await res.json();
      setExperiments(data.reverse());
    } catch {
      message.error('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExperiments(); }, []);

  const exportCsv = (exp: Experiment) => {
    const keys = Object.keys(exp.replications[0] ?? {});
    const header = keys.join(',');
    const rows = exp.replications.map(r => keys.map(k => r[k] ?? '').join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${exp.experiment_id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderBoxPlots = (exp: Experiment) => {
    const kpiKeys = Object.keys(exp.percentiles);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {kpiKeys.map(key => {
          const p = exp.percentiles[key];
          return (
            <Card key={key} size="small" title={key}>
              <BoxPlot
                data={[{ label: key, ...p }]}
                unit=""
                color="#2563eb"
              />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                p50: {p.p50.toFixed(3)} · mean: {p.mean.toFixed(3)} · std: {p.std.toFixed(3)}
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderComparison = () => {
    const expA = experiments.find(e => e.experiment_id === compareA);
    const expB = experiments.find(e => e.experiment_id === compareB);
    if (!expA || !expB) return <Empty description="Select two experiments to compare" />;

    const sharedKeys = Object.keys(expA.percentiles).filter(k => k in expB.percentiles);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {sharedKeys.map(key => (
          <Card key={key} size="small" title={key}>
            <BoxPlot
              data={[
                { label: expA.experiment_id.slice(0, 8), ...expA.percentiles[key] },
                { label: expB.experiment_id.slice(0, 8), ...expB.percentiles[key] },
              ]}
              color="#2563eb"
            />
          </Card>
        ))}
      </div>
    );
  };

  const columns = [
    { title: 'ID', dataIndex: 'experiment_id', render: (v: string) => v.slice(0, 8) },
    { title: 'Scenario', dataIndex: 'scenario_type' },
    { title: 'Replications', dataIndex: 'n_replications' },
    { title: 'Created', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    {
      title: 'Actions',
      render: (_: unknown, record: Experiment) => (
        <Space>
          <Button size="small" icon={<BarChartOutlined />} onClick={() => setSelected(record)}>View</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => exportCsv(record)}>CSV</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Experiments</Title>
        <Button icon={<SyncOutlined />} onClick={fetchExperiments} loading={loading}>Refresh</Button>
      </div>

      <Tabs
        items={[
          {
            key: 'list',
            label: 'All Experiments',
            children: (
              <>
                <Table
                  dataSource={experiments}
                  columns={columns}
                  rowKey="experiment_id"
                  loading={loading}
                  size="small"
                  style={{ marginBottom: 24 }}
                  onRow={record => ({ onClick: () => setSelected(record) })}
                />
                {selected && (
                  <Card
                    title={`Experiment ${selected.experiment_id.slice(0, 8)} · ${selected.scenario_type} · ${selected.n_replications} reps`}
                    extra={<Button size="small" onClick={() => setSelected(null)}>Close</Button>}
                  >
                    {renderBoxPlots(selected)}
                  </Card>
                )}
              </>
            ),
          },
          {
            key: 'compare',
            label: 'Compare',
            children: (
              <>
                <Space style={{ marginBottom: 16 }}>
                  <Text>Experiment A:</Text>
                  <Select
                    style={{ width: 200 }}
                    placeholder="Select experiment"
                    onChange={setCompareA}
                    options={experiments.map(e => ({ value: e.experiment_id, label: `${e.experiment_id.slice(0, 8)} (${e.scenario_type})` }))}
                  />
                  <Text>vs B:</Text>
                  <Select
                    style={{ width: 200 }}
                    placeholder="Select experiment"
                    onChange={setCompareB}
                    options={experiments.map(e => ({ value: e.experiment_id, label: `${e.experiment_id.slice(0, 8)} (${e.scenario_type})` }))}
                  />
                </Space>
                {renderComparison()}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

Open `App.tsx`. Add:
```tsx
import ExperimentsPage from './pages/ExperimentsPage';
// In the Routes section:
<Route path="/experiments" element={<ExperimentsPage />} />
```

- [ ] **Step 3: Add nav link to HomePage**

In `HomePage.tsx`, add a navigation button or link:
```tsx
import { useNavigate } from 'react-router-dom';
// ...
const navigate = useNavigate();
// Add button near existing navigation:
<Button
  icon={<BarChartOutlined />}
  onClick={() => navigate('/experiments')}
  size="small"
>
  Experiments
</Button>
```

Import `BarChartOutlined` from `@ant-design/icons`.

- [ ] **Step 4: Build to check for type errors**

```
cd frontend && npm run build 2>&1 | head -60
```
Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ExperimentsPage.tsx frontend/src/App.tsx frontend/src/pages/HomePage.tsx
git commit -m "feat: add Experiments page with box plots and comparison view"
```

---

## Verification

- [ ] Full backend test suite: `cd backend && pytest -v`
- [ ] Frontend build: `cd frontend && npm run build`
- [ ] Manual test end-to-end:
  1. Start the app: `powershell -File .\start_arena.ps1`
  2. Navigate to `/experiments`
  3. POST a batch run via the backend directly:
     ```bash
     curl -X POST http://localhost:8002/experiments/run \
       -H "Content-Type: application/json" \
       -d '{"scenario_type":"call_center","config":{"num_agents":3,"arrival_rate":2.0,"service_rate":1.5,"patience":10.0,"max_queue":20},"duration":10.0,"n_replications":5}'
     ```
  4. Refresh the Experiments page
  5. Click "View" — box plots appear
  6. Select two experiments in "Compare" tab — side-by-side box plots appear
  7. Click "CSV" — file downloads
