# Sprint 1: Advanced Visualization & Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add congestion heatmaps to ArenaCanvas, Parquet export from the backend, and configurable KPI alert thresholds with UI notification.

**Architecture:** Heatmap is purely a frontend canvas rendering enhancement — KPI data is already emitted by the backend (utilizationS1, utilizationS2, bufferLevel, queueLength). Parquet export is a new backend endpoint using pyarrow. KPI alerts are detected on the frontend by comparing incoming KPI values against user-defined rules stored in Zustand; no backend changes required for alerts.

**Tech Stack:** Python `pyarrow` + `pandas` (export), React canvas 2D API (heatmap), Ant Design `notification` API (alerts), Zustand (alert rules store slice).

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/components/ArenaCanvas.tsx` | Add heatmap overlay rendering step |
| Modify | `frontend/src/store/simStore.ts` | Add `alertRules` and `activeAlerts` slices |
| Modify | `frontend/src/pages/ArenaPage.tsx` | Add heatmap toggle button + export button + alert rule config drawer |
| Modify | `frontend/src/components/KpiPanel.tsx` | Highlight alerted KPI cards |
| Create | `frontend/src/components/AlertRulesDrawer.tsx` | Drawer UI for defining alert rules |
| Modify | `backend/app/routers/results.py` | Add `/results/{sim_id}/export/parquet` endpoint |
| Modify | `backend/requirements.txt` | Add `pyarrow`, `pandas` |

---

## Task 1: Parquet Export — Backend

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/routers/results.py`
- Test: `backend/tests/test_export.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_export.py`:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import io

from main import app

client = TestClient(app)


def _make_mock_instance(events):
    inst = MagicMock()
    inst.events_log = events
    inst.scenario_type = "manufacturing"
    inst.status = "completed"
    return inst


def test_parquet_export_returns_bytes():
    events = [
        {"sim_time": 0.0, "type": "kpi_update", "payload": {}, "kpis": {"throughput": 10.0}},
        {"sim_time": 1.0, "type": "entity_arrive", "payload": {"entityId": "e1"}, "kpis": {"throughput": 11.0}},
    ]
    mock_inst = _make_mock_instance(events)

    with patch("app.routers.results.sim_manager.get_instance", return_value=mock_inst):
        response = client.get("/results/fake-id/export/parquet")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    # Parquet magic bytes: PAR1
    assert response.content[:4] == b"PAR1"


def test_parquet_export_404_when_no_instance():
    with patch("app.routers.results.sim_manager.get_instance", return_value=None):
        response = client.get("/results/nonexistent/export/parquet")
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

```
cd backend && pytest tests/test_export.py -v
```
Expected: FAIL — `404` or import error (endpoint not yet defined).

- [ ] **Step 3: Add pyarrow and pandas to requirements**

Append to `backend/requirements.txt`:
```
pyarrow>=14.0.0
pandas>=2.0.0
```

- [ ] **Step 4: Add the export endpoint to results.py**

Open `backend/app/routers/results.py`. Add at the top imports section:
```python
import io
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi.responses import Response
```

Add this endpoint after the existing `/results/{sim_id}` route:
```python
@router.get("/results/{sim_id}/export/parquet")
async def export_parquet(sim_id: str):
    instance = sim_manager.get_instance(sim_id)
    if instance is None:
        raise HTTPException(status_code=404, detail="Simulation not found")

    events = instance.events_log  # list[dict]
    if not events:
        raise HTTPException(status_code=404, detail="No events recorded")

    rows = []
    for ev in events:
        row = {
            "sim_time": ev.get("sim_time"),
            "type": ev.get("type"),
        }
        row.update({f"kpi_{k}": v for k, v in (ev.get("kpis") or {}).items()})
        row.update({f"payload_{k}": str(v) for k, v in (ev.get("payload") or {}).items()})
        rows.append(row)

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    table = pa.Table.from_pandas(df)
    pq.write_table(table, buf)
    buf.seek(0)

    return Response(
        content=buf.read(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=sim_{sim_id[:8]}.parquet"},
    )
```

- [ ] **Step 5: Install dependencies**

```
cd backend && pip install pyarrow pandas
```

- [ ] **Step 6: Run tests to verify passing**

```
cd backend && pytest tests/test_export.py -v
```
Expected: PASS both tests.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/app/routers/results.py backend/tests/test_export.py
git commit -m "feat: add parquet export endpoint for simulation events"
```

---

## Task 2: Parquet Export — Frontend Button

**Files:**
- Modify: `frontend/src/pages/ArenaPage.tsx`

- [ ] **Step 1: Read the file to find the toolbar area**

Locate the `ArenaPage.tsx` controls section (around the SimControls component or action buttons area).

- [ ] **Step 2: Add the export button**

In `ArenaPage.tsx`, import `Button` and `message` from `antd` (already imported), and add a download handler:

```tsx
const handleExportParquet = async () => {
  if (!simId) return;
  try {
    const res = await fetch(`http://localhost:8002/results/${simId}/export/parquet`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sim_${simId.slice(0, 8)}.parquet`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    message.error('Export failed');
  }
};
```

Add the button near the existing controls (after stop button or in a toolbar):
```tsx
<Button
  icon={<DownloadOutlined />}
  onClick={handleExportParquet}
  disabled={status !== 'completed' && status !== 'stopped'}
  size="small"
>
  Export Parquet
</Button>
```

Import `DownloadOutlined` from `@ant-design/icons`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ArenaPage.tsx
git commit -m "feat: add parquet export download button to ArenaPage"
```

---

## Task 3: Congestion Heatmap — Canvas Rendering

**Files:**
- Modify: `frontend/src/components/ArenaCanvas.tsx`

The heatmap is a color fill overlay on each zone, with intensity derived from the zone's occupancy KPI. The mapping is:

| Zone key | KPI key (manufacturing) | KPI key (call_center) |
|----------|------------------------|-----------------------|
| `stage1` | `utilizationS1`        | `utilization`         |
| `stage2` | `utilizationS2`        | —                     |
| `buffer` | `bufferLevel` (0–bufferSize, normalize to 0–1) | — |
| `arrival`| `queueLength` / `max_queue` | `queueLength` / 10 |
| `exit`   | —                      | —                     |

Since we don't have per-scenario normalization info in the canvas, we use a **simple heuristic**: normalize any value >0 using `Math.min(value / 10, 1.0)` for counts, and use raw value for 0–1 rates.

- [ ] **Step 1: Add heatmap state to ArenaCanvas**

Read `ArenaCanvas.tsx` first. Then add a `showHeatmap` prop to the component interface:

```tsx
interface ArenaCanvasProps {
  showHeatmap?: boolean;
}
```

And update the component signature:
```tsx
export default function ArenaCanvas({ showHeatmap = false }: ArenaCanvasProps) {
```

- [ ] **Step 2: Write the heatmap rendering function**

Add this helper function inside the component, before the main `draw()` function:

```tsx
function getZoneHeat(zoneKey: string, kpis: Record<string, number>): number {
  // Returns 0-1 intensity for the heatmap overlay
  switch (zoneKey) {
    case 'stage1':
      return kpis['utilizationS1'] ?? kpis['utilization'] ?? 0;
    case 'stage2':
      return kpis['utilizationS2'] ?? 0;
    case 'buffer': {
      const level = kpis['bufferLevel'] ?? 0;
      return Math.min(level / 10, 1);
    }
    case 'arrival': {
      const q = kpis['queueLength'] ?? 0;
      return Math.min(q / 10, 1);
    }
    default:
      return 0;
  }
}

function heatColor(intensity: number): string {
  // green (0) → yellow (0.5) → red (1)
  const r = Math.round(intensity < 0.5 ? intensity * 2 * 255 : 255);
  const g = Math.round(intensity < 0.5 ? 255 : (1 - intensity) * 2 * 255);
  return `rgba(${r},${g},0,${0.18 + intensity * 0.22})`;
}
```

- [ ] **Step 3: Insert heatmap rendering into the draw pipeline**

In the main `draw()` function, after drawing zone backgrounds but before drawing entities, add:

```tsx
// Step N: Heatmap overlay
if (showHeatmap) {
  for (const [key, zone] of Object.entries(ZONE_DEFS)) {
    const intensity = getZoneHeat(key, kpis);
    if (intensity <= 0) continue;
    const x = zone.xf * W;
    const y = zone.yf * H;
    const w = zone.wf * W;
    const h = zone.hf * H;
    ctx.fillStyle = heatColor(intensity);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
  }
}
```

`kpis` comes from the Zustand store: `const kpis = useSimStore(s => s.kpis);`

- [ ] **Step 4: Add toggle button in ArenaPage**

In `ArenaPage.tsx`, add state and pass to canvas:

```tsx
const [showHeatmap, setShowHeatmap] = useState(false);
```

Add toggle button in the toolbar:
```tsx
<Button
  icon={<FireOutlined />}
  type={showHeatmap ? 'primary' : 'default'}
  onClick={() => setShowHeatmap(h => !h)}
  size="small"
>
  Heatmap
</Button>
```

Import `FireOutlined` from `@ant-design/icons`.

Pass prop to canvas:
```tsx
<ArenaCanvas showHeatmap={showHeatmap} />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ArenaCanvas.tsx frontend/src/pages/ArenaPage.tsx
git commit -m "feat: add congestion heatmap overlay to ArenaCanvas"
```

---

## Task 4: KPI Alert Rules — Zustand Slice

**Files:**
- Modify: `frontend/src/store/simStore.ts`

- [ ] **Step 1: Read simStore.ts fully to understand current structure**

- [ ] **Step 2: Add alert types and slice**

At the top of `simStore.ts`, add the alert types:

```typescript
export interface AlertRule {
  id: string;
  kpiKey: string;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number;
  label: string;
}

export interface ActiveAlert {
  ruleId: string;
  kpiKey: string;
  value: number;
  triggeredAt: number; // sim_time
}
```

Add to the `SimState` interface:
```typescript
alertRules: AlertRule[];
activeAlerts: ActiveAlert[];
addAlertRule: (rule: AlertRule) => void;
removeAlertRule: (id: string) => void;
clearActiveAlerts: () => void;
```

Add to the `create()` initial state:
```typescript
alertRules: [],
activeAlerts: [],
```

Add to the `create()` actions:
```typescript
addAlertRule: (rule) => set(s => ({ alertRules: [...s.alertRules, rule] })),
removeAlertRule: (id) => set(s => ({ alertRules: s.alertRules.filter(r => r.id !== id) })),
clearActiveAlerts: () => set({ activeAlerts: [] }),
```

- [ ] **Step 3: Evaluate alert rules on every pushEvent**

In the `pushEvent` action, after updating `kpis`, add alert evaluation:

```typescript
// Evaluate alert rules
const newAlerts: ActiveAlert[] = [];
for (const rule of get().alertRules) {
  const val = kpis[rule.kpiKey];
  if (val === undefined) continue;
  const triggered =
    rule.operator === '>'  ? val >  rule.threshold :
    rule.operator === '<'  ? val <  rule.threshold :
    rule.operator === '>=' ? val >= rule.threshold :
    /* <= */                  val <= rule.threshold;
  if (triggered) {
    newAlerts.push({ ruleId: rule.id, kpiKey: rule.kpiKey, value: val, triggeredAt: simTime });
  }
}
if (newAlerts.length > 0) {
  set(s => ({
    activeAlerts: [...s.activeAlerts.slice(-49), ...newAlerts],
  }));
}
```

Do the same evaluation in `pushBatch`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/simStore.ts
git commit -m "feat: add KPI alert rules slice to Zustand store"
```

---

## Task 5: KPI Alerts — UI

**Files:**
- Create: `frontend/src/components/AlertRulesDrawer.tsx`
- Modify: `frontend/src/pages/ArenaPage.tsx`
- Modify: `frontend/src/components/KpiPanel.tsx`

- [ ] **Step 1: Create AlertRulesDrawer component**

Create `frontend/src/components/AlertRulesDrawer.tsx`:

```tsx
import { useState } from 'react';
import { Drawer, Form, Input, Select, InputNumber, Button, List, Tag, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { nanoid } from 'nanoid';
import { useSimStore, AlertRule } from '../store/simStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const OPERATORS = ['>', '<', '>=', '<='] as const;

export default function AlertRulesDrawer({ open, onClose }: Props) {
  const { alertRules, addAlertRule, removeAlertRule } = useSimStore();
  const [form] = Form.useForm();

  const handleAdd = (values: { kpiKey: string; operator: AlertRule['operator']; threshold: number; label: string }) => {
    addAlertRule({ ...values, id: nanoid() });
    form.resetFields();
  };

  return (
    <Drawer title="KPI Alert Rules" open={open} onClose={onClose} width={380}>
      <Form form={form} layout="vertical" onFinish={handleAdd}>
        <Form.Item name="label" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g. High utilization" />
        </Form.Item>
        <Form.Item name="kpiKey" label="KPI Key" rules={[{ required: true }]}>
          <Input placeholder="e.g. utilizationS1" />
        </Form.Item>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Form.Item name="operator" noStyle initialValue=">">
            <Select style={{ width: 80 }}>
              {OPERATORS.map(op => <Select.Option key={op} value={op}>{op}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="threshold" noStyle rules={[{ required: true }]}>
            <InputNumber placeholder="0.8" style={{ width: '100%' }} step={0.01} />
          </Form.Item>
        </Space.Compact>
        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>
          Add Rule
        </Button>
      </Form>

      <List
        style={{ marginTop: 24 }}
        dataSource={alertRules}
        renderItem={rule => (
          <List.Item
            actions={[
              <Button
                key="del"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeAlertRule(rule.id)}
              />
            ]}
          >
            <Tag color="blue">{rule.kpiKey}</Tag>
            <span>{rule.operator} {rule.threshold}</span>
            <span style={{ marginLeft: 8, color: '#666' }}>{rule.label}</span>
          </List.Item>
        )}
      />
    </Drawer>
  );
}
```

Note: `nanoid` is already a transitive dependency in most React projects; if not present, use `crypto.randomUUID()` instead:
```tsx
import { BellOutlined } from '@ant-design/icons';
// replace nanoid: id: crypto.randomUUID()
```

- [ ] **Step 2: Wire AlertRulesDrawer into ArenaPage**

In `ArenaPage.tsx` add:

```tsx
import AlertRulesDrawer from '../components/AlertRulesDrawer';
// ...
const [alertDrawerOpen, setAlertDrawerOpen] = useState(false);
const activeAlerts = useSimStore(s => s.activeAlerts);
```

Add button to toolbar:
```tsx
<Button
  icon={<BellOutlined />}
  onClick={() => setAlertDrawerOpen(true)}
  size="small"
  danger={activeAlerts.length > 0}
>
  Alerts {activeAlerts.length > 0 ? `(${activeAlerts.length})` : ''}
</Button>
```

Add drawer component at the bottom of the JSX:
```tsx
<AlertRulesDrawer
  open={alertDrawerOpen}
  onClose={() => setAlertDrawerOpen(false)}
/>
```

- [ ] **Step 3: Show toast notification when alert fires**

In `ArenaPage.tsx` add a `useEffect` that reacts to `activeAlerts`:

```tsx
import { notification } from 'antd';
// ...
const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());

useEffect(() => {
  for (const alert of activeAlerts) {
    const key = `${alert.ruleId}-${alert.triggeredAt}`;
    if (!notifiedIds.has(key)) {
      notification.warning({
        message: `KPI Alert: ${alert.kpiKey}`,
        description: `Value ${alert.value.toFixed(3)} at t=${alert.triggeredAt.toFixed(1)}`,
        placement: 'topRight',
        duration: 4,
      });
      setNotifiedIds(prev => new Set([...prev, key]));
    }
  }
}, [activeAlerts]);
```

- [ ] **Step 4: Highlight alerted KPI cards in KpiPanel**

In `KpiPanel.tsx`, read active alerts from the store:

```tsx
const activeAlerts = useSimStore(s => s.activeAlerts);
const alertedKeys = new Set(activeAlerts.map(a => a.kpiKey));
```

On each KPI card, add a conditional style:
```tsx
<Card
  size="small"
  style={{
    borderColor: alertedKeys.has(kpiKey) ? '#ff4d4f' : undefined,
    boxShadow: alertedKeys.has(kpiKey) ? '0 0 0 2px rgba(255,77,79,0.2)' : undefined,
    transition: 'border-color 0.3s, box-shadow 0.3s',
  }}
>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlertRulesDrawer.tsx frontend/src/pages/ArenaPage.tsx frontend/src/components/KpiPanel.tsx
git commit -m "feat: add KPI alert rules drawer and toast notifications"
```

---

## Verification

- [ ] Run backend tests: `cd backend && pytest -v`
- [ ] Run frontend build: `cd frontend && npm run build`
- [ ] Manual test: start a Manufacturing simulation, enable heatmap, add alert rule for `utilizationS2 > 0.7`, observe overlay and toast notification, then download Parquet export.
