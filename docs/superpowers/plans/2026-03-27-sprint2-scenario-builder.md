# Sprint 2: Interactive Scenario Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing `EditorPage` into a fully interactive visual node-graph builder with a resource palette and config snapshot versioning.

**Architecture:** The backend already supports `GraphConfig` (nodes + edges) and a `generic_graph` scenario. This sprint replaces the existing form-based `EditorPage` with a React Flow canvas editor. Node templates are statically defined in the frontend. Config snapshots persist to `localStorage`. No backend changes are required.

**Tech Stack:** `reactflow` (node-graph canvas), Ant Design (sidebar, modals, drawers), Zustand (optional — snapshots stored in localStorage directly), `@xyflow/react` v12.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/package.json` | Add `@xyflow/react` dependency |
| Modify | `frontend/src/pages/EditorPage.tsx` | Replace form with React Flow canvas |
| Create | `frontend/src/components/editor/NodePalette.tsx` | Sidebar drag-drop resource templates |
| Create | `frontend/src/components/editor/NodeConfigPanel.tsx` | Right panel for selected node properties |
| Create | `frontend/src/components/editor/SnapshotManager.tsx` | Save/restore/compare config snapshots |
| Create | `frontend/src/components/editor/nodeTypes.tsx` | Custom React Flow node renderers |
| Create | `frontend/src/utils/graphSerializer.ts` | Convert React Flow graph → GraphConfig JSON for backend |

---

## Task 1: Install React Flow

**Files:**
- Modify: `frontend/package.json` (via npm install)

- [ ] **Step 1: Install the package**

```
cd frontend && npm install @xyflow/react
```

- [ ] **Step 2: Verify install**

```
cd frontend && npm ls @xyflow/react
```
Expected: `@xyflow/react@12.x.x`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @xyflow/react for scenario node editor"
```

---

## Task 2: Custom Node Types

**Files:**
- Create: `frontend/src/components/editor/nodeTypes.tsx`

- [ ] **Step 1: Create the node types file**

Create `frontend/src/components/editor/nodeTypes.tsx`:

```tsx
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NodeData {
  label: string;
  nodeType: 'source' | 'queue' | 'process' | 'sink';
  params: Record<string, number | string>;
}

const COLOR_MAP: Record<string, string> = {
  source:  '#2563eb',
  queue:   '#d97706',
  process: '#059669',
  sink:    '#7c3aed',
};

function BaseNode({ data, selected }: NodeProps<NodeData>) {
  const color = COLOR_MAP[data.nodeType] ?? '#475569';
  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${selected ? '#1677ff' : color}`,
      borderRadius: 8,
      padding: '8px 14px',
      minWidth: 120,
      boxShadow: selected ? '0 0 0 3px rgba(22,119,255,0.2)' : '0 1px 4px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
        {data.nodeType}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
        {data.label}
      </div>
      {data.nodeType !== 'source' && (
        <Handle type="target" position={Position.Left} style={{ background: color }} />
      )}
      {data.nodeType !== 'sink' && (
        <Handle type="source" position={Position.Right} style={{ background: color }} />
      )}
    </div>
  );
}

export const nodeTypes = {
  source:  BaseNode,
  queue:   BaseNode,
  process: BaseNode,
  sink:    BaseNode,
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/nodeTypes.tsx
git commit -m "feat: add custom React Flow node types for scenario editor"
```

---

## Task 3: Graph Serializer

**Files:**
- Create: `frontend/src/utils/graphSerializer.ts`

This utility converts React Flow nodes/edges to the `GraphConfig` format the backend expects.

- [ ] **Step 1: Create the serializer**

Create `frontend/src/utils/graphSerializer.ts`:

```typescript
import type { Node, Edge } from '@xyflow/react';

export interface BackendNode {
  id: string;
  type: 'source' | 'queue' | 'process' | 'sink';
  label: string;
  params: Record<string, number | string>;
}

export interface BackendEdge {
  from: string;
  to: string;
  weight?: number;
}

export interface GraphConfig {
  nodes: BackendNode[];
  edges: BackendEdge[];
}

export function serializeGraph(nodes: Node[], edges: Edge[]): GraphConfig {
  const backendNodes: BackendNode[] = nodes.map(n => ({
    id: n.id,
    type: (n.data as { nodeType: string }).nodeType as BackendNode['type'],
    label: (n.data as { label: string }).label,
    params: (n.data as { params: Record<string, number | string> }).params ?? {},
  }));

  const backendEdges: BackendEdge[] = edges.map(e => ({
    from: e.source,
    to: e.target,
    weight: (e.data as { weight?: number } | undefined)?.weight,
  }));

  return { nodes: backendNodes, edges: backendEdges };
}

export function validateGraph(config: GraphConfig): string[] {
  const errors: string[] = [];
  const ids = new Set(config.nodes.map(n => n.id));
  const sources = config.nodes.filter(n => n.type === 'source');
  const sinks = config.nodes.filter(n => n.type === 'sink');

  if (sources.length === 0) errors.push('Graph must have at least one source node.');
  if (sinks.length === 0) errors.push('Graph must have at least one sink node.');

  for (const edge of config.edges) {
    if (!ids.has(edge.from)) errors.push(`Edge references unknown node: ${edge.from}`);
    if (!ids.has(edge.to)) errors.push(`Edge references unknown node: ${edge.to}`);
  }

  return errors;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/graphSerializer.ts
git commit -m "feat: add graph serializer utility for React Flow → GraphConfig conversion"
```

---

## Task 4: Node Palette Sidebar

**Files:**
- Create: `frontend/src/components/editor/NodePalette.tsx`

- [ ] **Step 1: Create the palette**

Create `frontend/src/components/editor/NodePalette.tsx`:

```tsx
import { Card, Typography } from 'antd';

const { Text } = Typography;

export interface NodeTemplate {
  nodeType: 'source' | 'queue' | 'process' | 'sink';
  label: string;
  defaultParams: Record<string, number | string>;
  description: string;
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  {
    nodeType: 'source',
    label: 'Arrival',
    defaultParams: { arrival_rate: 1.0 },
    description: 'Generates entities at arrival_rate/min',
  },
  {
    nodeType: 'queue',
    label: 'Queue',
    defaultParams: { capacity: 10 },
    description: 'Buffers entities with finite capacity',
  },
  {
    nodeType: 'process',
    label: 'Service',
    defaultParams: { num_servers: 1, service_time_mean: 1.0 },
    description: 'Serves entities with N parallel servers',
  },
  {
    nodeType: 'process',
    label: 'Machine',
    defaultParams: { num_servers: 1, service_time_mean: 2.0, breakdown_rate: 0.01 },
    description: 'Machine with optional breakdown rate',
  },
  {
    nodeType: 'sink',
    label: 'Exit',
    defaultParams: {},
    description: 'Collects completed entities',
  },
];

const COLOR_MAP: Record<string, string> = {
  source: '#2563eb', queue: '#d97706', process: '#059669', sink: '#7c3aed',
};

interface Props {
  onDragStart: (template: NodeTemplate) => void;
}

export default function NodePalette({ onDragStart }: Props) {
  return (
    <div style={{ width: 200, padding: 12, borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
      <Text strong style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
        Node Library
      </Text>
      {NODE_TEMPLATES.map((tpl, i) => (
        <Card
          key={i}
          size="small"
          draggable
          onDragStart={() => onDragStart(tpl)}
          style={{
            marginTop: 8,
            cursor: 'grab',
            borderLeft: `3px solid ${COLOR_MAP[tpl.nodeType]}`,
          }}
          bodyStyle={{ padding: '6px 10px' }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{tpl.label}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{tpl.description}</div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/NodePalette.tsx
git commit -m "feat: add node palette sidebar with drag-and-drop templates"
```

---

## Task 5: Node Config Panel

**Files:**
- Create: `frontend/src/components/editor/NodeConfigPanel.tsx`

- [ ] **Step 1: Create the panel**

Create `frontend/src/components/editor/NodeConfigPanel.tsx`:

```tsx
import { useEffect } from 'react';
import { Drawer, Form, Input, InputNumber, Button } from 'antd';
import type { Node } from '@xyflow/react';

interface Props {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

export default function NodeConfigPanel({ node, onClose, onUpdate }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (node) {
      form.setFieldsValue({
        label: (node.data as { label: string }).label,
        ...(node.data as { params: Record<string, number | string> }).params,
      });
    }
  }, [node, form]);

  if (!node) return null;

  const params = (node.data as { params: Record<string, number | string> }).params ?? {};

  const handleSave = (values: Record<string, unknown>) => {
    const { label, ...rest } = values;
    onUpdate(node.id, {
      ...(node.data as object),
      label: label as string,
      params: rest,
    });
    onClose();
  };

  return (
    <Drawer title="Node Properties" open={!!node} onClose={onClose} width={300} mask={false}>
      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item name="label" label="Label" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        {Object.entries(params).map(([key, val]) => (
          <Form.Item key={key} name={key} label={key.replace(/_/g, ' ')}>
            {typeof val === 'number'
              ? <InputNumber style={{ width: '100%' }} step={0.1} />
              : <Input />}
          </Form.Item>
        ))}
        <Button type="primary" htmlType="submit" block>Save</Button>
      </Form>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/NodeConfigPanel.tsx
git commit -m "feat: add node config properties panel drawer"
```

---

## Task 6: Snapshot Manager

**Files:**
- Create: `frontend/src/components/editor/SnapshotManager.tsx`

- [ ] **Step 1: Create the snapshot manager**

Create `frontend/src/components/editor/SnapshotManager.tsx`:

```tsx
import { useState } from 'react';
import { Button, Modal, List, Input, Space, Popconfirm, Typography, message } from 'antd';
import { SaveOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import type { GraphConfig } from '../../utils/graphSerializer';

const { Text } = Typography;
const STORAGE_KEY = 'des_arena_graph_snapshots';

interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  config: GraphConfig;
}

function loadSnapshots(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveSnapshots(snaps: Snapshot[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
}

interface Props {
  currentConfig: GraphConfig;
  onRestore: (config: GraphConfig) => void;
}

export default function SnapshotManager({ currentConfig, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(loadSnapshots);
  const [name, setName] = useState('');

  const handleSave = () => {
    if (!name.trim()) { message.warning('Enter a snapshot name'); return; }
    const snap: Snapshot = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toLocaleString(),
      config: currentConfig,
    };
    const updated = [snap, ...snapshots];
    setSnapshots(updated);
    saveSnapshots(updated);
    setName('');
    message.success('Snapshot saved');
  };

  const handleDelete = (id: string) => {
    const updated = snapshots.filter(s => s.id !== id);
    setSnapshots(updated);
    saveSnapshots(updated);
  };

  return (
    <>
      <Button icon={<SaveOutlined />} size="small" onClick={() => setOpen(true)}>
        Snapshots
      </Button>
      <Modal
        title="Config Snapshots"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={500}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="Snapshot name"
            value={name}
            onChange={e => setName(e.target.value)}
            onPressEnter={handleSave}
          />
          <Button type="primary" onClick={handleSave}>Save Current</Button>
        </Space.Compact>
        <List
          dataSource={snapshots}
          locale={{ emptyText: 'No snapshots yet' }}
          renderItem={snap => (
            <List.Item
              actions={[
                <Button
                  key="restore"
                  size="small"
                  icon={<FolderOpenOutlined />}
                  onClick={() => { onRestore(snap.config); setOpen(false); message.success('Snapshot restored'); }}
                >
                  Restore
                </Button>,
                <Popconfirm key="del" title="Delete snapshot?" onConfirm={() => handleDelete(snap.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={snap.name}
                description={<Text type="secondary" style={{ fontSize: 11 }}>{snap.createdAt}</Text>}
              />
            </List.Item>
          )}
        />
      </Modal>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/SnapshotManager.tsx
git commit -m "feat: add localStorage-based config snapshot manager"
```

---

## Task 7: Refactor EditorPage with React Flow

**Files:**
- Modify: `frontend/src/pages/EditorPage.tsx`

- [ ] **Step 1: Read current EditorPage.tsx**

Read the full file to understand existing structure before replacing it.

- [ ] **Step 2: Rewrite EditorPage with React Flow canvas**

Replace the contents of `frontend/src/pages/EditorPage.tsx` with:

```tsx
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, type Connection, type Node, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Space, message, Alert } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

import NodePalette, { NODE_TEMPLATES, type NodeTemplate } from '../components/editor/NodePalette';
import NodeConfigPanel from '../components/editor/NodeConfigPanel';
import SnapshotManager from '../components/editor/SnapshotManager';
import { nodeTypes } from '../components/editor/nodeTypes';
import { serializeGraph, validateGraph, type GraphConfig } from '../utils/graphSerializer';
import { useSimStore } from '../store/simStore';

let nodeIdCounter = 1;

const INITIAL_NODES: Node[] = [
  { id: 'n1', type: 'source', position: { x: 60, y: 160 }, data: { label: 'Arrival', nodeType: 'source', params: { arrival_rate: 1.0 } } },
  { id: 'n2', type: 'process', position: { x: 280, y: 100 }, data: { label: 'Service', nodeType: 'process', params: { num_servers: 2, service_time_mean: 1.5 } } },
  { id: 'n3', type: 'sink', position: { x: 500, y: 160 }, data: { label: 'Exit', nodeType: 'sink', params: {} } },
];
const INITIAL_EDGES = [
  { id: 'e1-2', source: 'n1', target: 'n2' },
  { id: 'e2-3', source: 'n2', target: 'n3' },
];

export default function EditorPage() {
  const navigate = useNavigate();
  const { setSimId, setScenarioType } = useSimStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const dragTemplateRef = useRef<NodeTemplate | null>(null);

  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const tpl = dragTemplateRef.current;
    if (!tpl || !rfInstanceRef.current) return;
    const pos = rfInstanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = `n${++nodeIdCounter}`;
    setNodes(nds => [...nds, {
      id,
      type: tpl.nodeType,
      position: pos,
      data: { label: tpl.label, nodeType: tpl.nodeType, params: { ...tpl.defaultParams } },
    }]);
  }, [setNodes]);

  const onNodeUpdate = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: newData } : n));
  }, [setNodes]);

  const handleRestore = useCallback((config: GraphConfig) => {
    const rfNodes: Node[] = config.nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: { x: 80 + i * 220, y: 160 },
      data: { label: n.label, nodeType: n.type, params: n.params },
    }));
    const rfEdges = config.edges.map((e, i) => ({ id: `re${i}`, source: e.from, target: e.to }));
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [setNodes, setEdges]);

  const handleRun = async () => {
    const config = serializeGraph(nodes, edges);
    const errs = validateGraph(config);
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);

    try {
      const res = await fetch('http://localhost:8002/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_type: 'generic_graph', config, duration: 60, speed: 1 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { sim_id } = await res.json();
      setSimId(sim_id);
      setScenarioType('generic_graph');
      navigate(`/arena/${sim_id}`);
    } catch (err) {
      message.error(`Failed to start: ${err}`);
    }
  };

  const currentConfig = serializeGraph(nodes, edges);

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, background: '#fff' }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Scenario Editor</span>
        <Space>
          <SnapshotManager currentConfig={currentConfig} onRestore={handleRestore} />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRun}>
            Run Simulation
          </Button>
        </Space>
      </div>

      {errors.length > 0 && (
        <Alert
          type="error"
          message={errors.map((e, i) => <div key={i}>{e}</div>)}
          closable
          onClose={() => setErrors([])}
          style={{ margin: '8px 16px' }}
        />
      )}

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <NodePalette onDragStart={tpl => { dragTemplateRef.current = tpl; }} />

        <div style={{ flex: 1 }} onDrop={onDrop} onDragOver={e => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            onInit={inst => { rfInstanceRef.current = inst; }}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <NodeConfigPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdate={onNodeUpdate}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the frontend build to catch type errors**

```
cd frontend && npm run build 2>&1 | head -50
```
Expected: builds successfully or shows only minor warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EditorPage.tsx
git commit -m "feat: replace EditorPage form with interactive React Flow node-graph editor"
```

---

## Verification

- [ ] Run frontend dev server: `cd frontend && npm run dev -- --port 5174`
- [ ] Navigate to `/editor`
- [ ] Drag a `Service` node from the palette onto the canvas
- [ ] Click on a node, verify the config drawer opens and edits save
- [ ] Save a snapshot, reload the page, restore the snapshot
- [ ] Click "Run Simulation", verify it navigates to ArenaPage with a running sim
