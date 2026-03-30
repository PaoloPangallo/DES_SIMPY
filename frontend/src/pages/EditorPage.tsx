import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  Panel,
  Handle,
  Position,
  NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Card, 
  Button, 
  Typography, 
  Space, 
  Input, 
  Drawer, 
  Form, 
  InputNumber, 
  Select, 
  App,
  Divider,
  Badge,
  Tooltip,
  Modal
} from 'antd';
import { 
  SaveOutlined, 
  PlayCircleOutlined, 
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  DisconnectOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

const { Title, Text } = Typography;

const NODE_TYPES_META = [
  { 
    type: 'source', 
    label: 'Sorgente (Arrivo)', 
    color: '#52c41a', 
    description: 'Punto di ingresso. Genera nuove entità (es. clienti, pezzi) secondo un tasso di arrivo definito.' 
  },
  { 
    type: 'queue', 
    label: 'Coda (Buffer)', 
    color: '#1890ff', 
    description: 'Punto di attesa. Gestisce le code (FIFO) e i limiti di capacità dei polmoni.' 
  },
  { 
    type: 'process', 
    label: 'Processo (Servizio)', 
    color: '#faad14', 
    description: 'Stazione di lavoro. Richiede tempo e risorse (es. operatori, macchine) per completare l\'attività.' 
  },
  { 
    type: 'sink', 
    label: 'Uscita (Sink)', 
    color: '#f5222d', 
    description: 'Punto di uscita. Termina il ciclo di vita delle entità e calcola le statistiche finali.' 
  },
];

const TEMPLATES: Record<string, any> = {
  hospital_er: {
    nodes: [
      { id: 'start', type: 'source', name: 'Arrivo Pazienti', arrival_rate: 1.0, position: { x: 50, y: 150 } },
      { id: 'wait', type: 'queue', name: 'Sala d\'Attesa', max_size: 100, position: { x: 250, y: 150 } },
      { id: 'triage', type: 'process', name: 'Triage/Visita', capacity: 2, service_time: 15.0, position: { x: 450, y: 150 } },
      { id: 'exit', type: 'sink', name: 'Dimissione', position: { x: 650, y: 150 } }
    ],
    edges: [
      { source: 'start', target: 'wait' },
      { source: 'wait', target: 'triage' },
      { source: 'triage', target: 'exit' }
    ]
  },
  call_center: {
    nodes: [
      { id: 'calls', type: 'source', name: 'Chiamate in Entrata', arrival_rate: 2.0, position: { x: 50, y: 150 } },
      { id: 'hold', type: 'queue', name: 'Coda d\'Attesa', max_size: 50, position: { x: 250, y: 150 } },
      { id: 'operators', type: 'process', name: 'Operatori', capacity: 5, service_time: 4.0, position: { x: 450, y: 150 } },
      { id: 'end', type: 'sink', name: 'Chiamata Conclusa', position: { x: 650, y: 150 } }
    ],
    edges: [
      { source: 'calls', target: 'hold' },
      { source: 'hold', target: 'operators' },
      { source: 'operators', target: 'end' }
    ]
  },
  manufacturing: {
    nodes: [
      { id: 'parts', type: 'source', name: 'Arrivo Pezzi', arrival_rate: 1.0, position: { x: 50, y: 150 } },
      { id: 'buffer', type: 'queue', name: 'WIP Buffer', max_size: 20, position: { x: 250, y: 150 } },
      { id: 'machining', type: 'process', name: 'Macchinari', capacity: 3, service_time: 2.5, position: { x: 450, y: 150 } },
      { id: 'done', type: 'sink', name: 'Prodotto Finito', position: { x: 650, y: 150 } }
    ],
    edges: [
      { source: 'parts', target: 'buffer' },
      { source: 'buffer', target: 'machining' },
      { source: 'machining', target: 'done' }
    ]
  },
  data_center: {
    nodes: [
      { id: 'reqs', type: 'source', name: 'Richieste Web', arrival_rate: 10.0, position: { x: 50, y: 150 } },
      { id: 'bridge', type: 'queue', name: 'Load Balancer', max_size: 1000, position: { x: 250, y: 150 } },
      { id: 'compute', type: 'process', name: 'Rack Server', capacity: 20, service_time: 0.1, position: { x: 450, y: 150 } },
      { id: 'exit', type: 'sink', name: 'Completate', position: { x: 650, y: 150 } }
    ],
    edges: [
      { source: 'reqs', target: 'bridge' },
      { source: 'bridge', target: 'compute' },
      { source: 'compute', target: 'exit' }
    ]
  },
  supply_chain: {
    nodes: [
      { id: 'orders', type: 'source', name: 'Ordini Clienti', arrival_rate: 0.5, position: { x: 50, y: 150 } },
      { id: 'warehouse', type: 'queue', name: 'Magazzino Centro', max_size: 500, position: { x: 300, y: 150 } },
      { id: 'shipping', type: 'process', name: 'Spedizione', capacity: 2, service_time: 120.0, position: { x: 550, y: 150 } },
      { id: 'delivered', type: 'sink', name: 'Consegnato', position: { x: 800, y: 150 } }
    ],
    edges: [
      { source: 'orders', target: 'warehouse' },
      { source: 'warehouse', target: 'shipping' },
      { source: 'shipping', target: 'delivered' }
    ]
  },
  network_traffic: {
    nodes: [
      { id: 'gen', type: 'source', name: 'Traffico IP', arrival_rate: 100.0, position: { x: 50, y: 150 } },
      { id: 'router', type: 'process', name: 'Router Core', capacity: 10, service_time: 0.001, position: { x: 300, y: 150 } },
      { id: 'dest', type: 'sink', name: 'Destinazione', position: { x: 550, y: 150 } }
    ],
    edges: [
      { source: 'gen', target: 'router' },
      { source: 'router', target: 'dest' }
    ]
  }
};
// ── Custom Node Components ──────────────────────────────────────────────────

const CustomNode: React.FC<NodeProps> = ({ data, selected }) => {
  const meta = NODE_TYPES_META.find(m => m.type === data.config.type);
  const config = data.config;
  
  const renderDistributionIcon = () => {
    if (config.type === 'source' || config.type === 'process') {
      const dist = config.dist || 'exponential';
      return (
        <div style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
            {dist === 'exponential' ? (
              <path d="M2 2C2 2 4 12 22 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            ) : dist === 'constant' ? (
              <path d="M2 7H22" stroke="white" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M2 12C6 12 8 2 12 2C16 2 18 12 22 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700 }}>
            {config.type === 'source' ? `λ=${config.arrival_rate}` : `μ=${config.service_time}`}
          </span>
        </div>
      );
    }
    if (config.type === 'queue') {
      return (
        <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, padding: '4px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4 }}>
          Cap: {config.max_size || '∞'}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ 
      background: meta?.color || '#fff', 
      color: '#fff', 
      borderRadius: '10px', 
      padding: '12px', 
      width: 160, 
      boxShadow: selected ? `0 0 0 3px ${meta?.color}66, 0 8px 16px rgba(0,0,0,0.2)` : '0 4px 10px rgba(0,0,0,0.15)',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      border: '1px solid rgba(255,255,255,0.2)',
      position: 'relative'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#fff' }} />
      
      <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {meta?.label.split(' ')[0]}
      </div>
      <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
        {config.name || meta?.label}
      </div>
      
      {renderDistributionIcon()}
      
      <Handle type="source" position={Position.Right} style={{ background: '#fff' }} />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};


const EditorPage: React.FC = () => {
  const { scenarioType } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const { message, modal } = App.useApp();
  const [saveForm] = Form.useForm();
  const [simSpeed, setSimSpeed] = useState(1.0);
  const [simDuration, setSimDuration] = useState(480);
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // Health Check Backend
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        setBackendOnline(res.ok);
      } catch {
        setBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Caricamento Scenario e Gestione Bozza
  useEffect(() => {
    const savedDraft = localStorage.getItem('arena_editor_draft');
    
    const loadConfig = (cfg: any) => {
      if (cfg.nodes) {
        setNodes(cfg.nodes.map((n: any) => ({
          id: n.id,
          type: 'custom',
          position: n.position || { x: Math.random() * 200, y: Math.random() * 200 },
          data: { label: (n.name || n.type).toUpperCase(), config: { ...n } },
        })));
      }
      if (cfg.edges) {
        setEdges(cfg.edges.map((e: any, i: number) => ({
          id: `e-${i}-${Date.now()}`,
          source: e.source,
          target: e.target
        })));
      }
    };

    if (location.state?.config) {
      loadConfig(location.state.config);
      message.info(`Caricato: ${location.state.name || 'Scenario Custom'}`);
    } else if (scenarioType && TEMPLATES[scenarioType]) {
      loadConfig(TEMPLATES[scenarioType]);
      message.info(`Inizializzato template: ${scenarioType}`);
    } else if (savedDraft) {
      modal.confirm({
        title: 'Bozza trovata',
        content: 'Abbiamo trovato una bozza non salvata. Vuoi ripristinarla?',
        okText: 'Ripristina',
        cancelText: 'Pulisci',
        onOk: () => loadConfig(JSON.parse(savedDraft)),
        onCancel: () => localStorage.removeItem('arena_editor_draft')
      });
    }
  }, [scenarioType, location.state]);

  // Auto-Save
  useEffect(() => {
    if (nodes.length > 0) {
      const config = {
        nodes: nodes.map(n => ({ ...n.data.config, id: n.id, position: n.position })),
        edges: edges.map(e => ({ source: e.source, target: e.target }))
      };
      localStorage.setItem('arena_editor_draft', JSON.stringify(config));
    }
  }, [nodes, edges]);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!reactFlowWrapper.current || !reactFlowInstance) return;
      
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: 'custom',
        position,
        data: { 
          label: nodeType.toUpperCase(),
          config: {
            id: `node_${Date.now()}`,
            name: `${nodeType}_${nodes.length}`,
            type: nodeType,
            ...(nodeType === 'source' && { arrival_rate: 1.0, dist: 'exponential' }),
            ...(nodeType === 'process' && { capacity: 1, service_time: 1.0, dist: 'exponential' }),
            ...(nodeType === 'queue' && { max_size: 100 }),
          }
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, nodes.length, setNodes]
  );

  const getFullConfig = () => ({
    nodes: nodes.map(n => ({ ...n.data.config, id: n.id, position: n.position })),
    edges: edges.map(e => ({ source: e.source, target: e.target }))
  });

  const handleSaveSubmit = async (values: { name: string, description?: string }) => {
    try {
      const response = await fetch('/scenarios/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: values.name, 
          type: scenarioType || 'custom', 
          config: getFullConfig() 
        })
      });
      if (!response.ok) throw new Error((await response.json()).detail);
      message.success('Scenario salvato correttamente!');
      setIsSaveModalVisible(false);
      localStorage.removeItem('arena_editor_draft');
    } catch (err: any) { message.error(err.message); }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(getFullConfig(), null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `scenario_${scenarioType || 'custom'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleStartSim = async () => {
    if (!nodes.some(n => n.data.config.type === 'source')) return message.error('Manca un nodo Sorgente (Arrivo)');
    if (!nodes.some(n => n.data.config.type === 'sink')) return message.error('Manca un nodo Uscita (Sink)');
    
    try {
      const response = await fetch('/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'custom', 
          config: getFullConfig(), 
          duration: simDuration, 
          speed: simSpeed 
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Errore nella validazione del grafo');
      }
      const { sim_id } = await response.json();
      message.success('Simulazione avviata!');
      navigate(`/arena/${sim_id}`);
    } catch (err: any) { message.error(err.message); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Card style={{ borderRadius: 0, padding: '8px 24px' }} styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size="large">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Title level={4} style={{ margin: 0 }}>Editor: {scenarioType || 'Personalizzato'}</Title>
              <Space>
                {backendOnline === true ? (
                  <Badge status="success" text={<Text type="secondary" style={{ fontSize: 11 }}>Backend Pronto</Text>} />
                ) : backendOnline === false ? (
                  <Badge status="error" text={<Text type="danger" style={{ fontSize: 11 }}>Backend Offline</Text>} />
                ) : (
                  <Badge status="processing" text={<Text type="secondary" style={{ fontSize: 11 }}>Connessione...</Text>} />
                )}
              </Space>
            </div>
          </Space>
          <Space>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Durata (min):</Text>
              <InputNumber value={simDuration} style={{ width: 80 }} min={1} onChange={v => setSimDuration(v || 480)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Velocità:</Text>
              <Select defaultValue={1.0} style={{ width: 80 }} onChange={v => setSimSpeed(v)} options={[
                { value: 0.1, label: '0.1x' },
                { value: 0.5, label: '0.5x' },
                { value: 1.0, label: '1.0x' },
                { value: 2.0, label: '2.0x' },
                { value: 5.0, label: '5.0x' },
              ]} />
            </div>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>Esporta</Button>
            <Button icon={<SaveOutlined />} onClick={() => setIsSaveModalVisible(true)}>Salva</Button>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartSim} disabled={backendOnline === false}>
              Simula
            </Button>
          </Space>
        </div>
      </Card>

      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ width: 300, background: '#fff', borderRight: '1px solid #f0f0f0', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
          <Title level={5} style={{ marginBottom: 4 }}>Componenti</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
            Modella il flusso trascinando i blocchi nel grafo.
          </Text>
          
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 20 }} size="middle">
              {NODE_TYPES_META.map(n => (
                <Card 
                  key={n.type} 
                  size="small" 
                  hoverable 
                  draggable 
                  style={{ cursor: 'grab', borderRadius: 8, border: `1px solid #f0f0f0`, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                  styles={{ body: { padding: '12px 10px' } }}
                  onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', n.type); }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.color, marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 2 }}>{n.label}</Text>
                      <Text type="secondary" style={{ fontSize: 11, lineHeight: '1.4', display: 'block' }}>{n.description}</Text>
                    </div>
                  </div>
                </Card>
              ))}
            </Space>

            <Divider style={{ margin: '16px 0' }}>Suggerimenti</Divider>
            
            <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, border: '1px dashed #d9d9d9' }}>
              <Space direction="vertical" size="small">
                <Text style={{ fontSize: 12 }} strong>💡 Modellazione:</Text>
                <ul style={{ paddingLeft: 16, margin: 0, fontSize: 11, color: '#666' }}>
                  <li>Ogni grafo deve iniziare con una <b>Sorgente</b> e terminare con un <b>Uscita</b>.</li>
                  <li>Usa le <b>Code</b> prima di un <b>Processo</b> per evitare che il sistema si blocchi se la risorsa è occupata.</li>
                  <li>Configura il <b>Buffer</b> massimo per simulare sistemi a capacità limitata.</li>
                </ul>
              </Space>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} ref={reactFlowWrapper}>
          <ReactFlow 
            nodes={nodes} 
            edges={edges} 
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} 
            onEdgesChange={onEdgesChange} 
            onConnect={onConnect} 
            onInit={setReactFlowInstance} 
            onDrop={onDrop} 
            onDragOver={onDragOver}
            onNodeClick={(_, n) => setSelectedNodeId(n.id)} 
            fitView
          >
            <Background /><Controls /><MiniMap />
          </ReactFlow>
        </div>
      </div>

      <Drawer title={`Proprietà: ${selectedNode?.data?.config?.name}`} open={!!selectedNodeId} onClose={() => setSelectedNodeId(null)} width={350}>
        {selectedNode && (
          <Form 
            key={selectedNode.id}
            layout="vertical" 
            initialValues={selectedNode.data.config} 
            onValuesChange={(_, all) => {
              setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...all } } } : n));
            }}>
            <Form.Item label="Nome" name="name"><Input /></Form.Item>
            {selectedNode.data.config.type === 'source' && (
              <><Form.Item label="Tasso Arrivo (minuti)" name="arrival_rate"><InputNumber style={{width:'100%'}} /></Form.Item>
                <Form.Item label="Distribuzione" name="dist"><Select>
                  <Select.Option value="exponential">Esponenziale</Select.Option>
                  <Select.Option value="constant">Costante</Select.Option>
                </Select></Form.Item></>
            )}
            {selectedNode.data.config.type === 'process' && (
              <><Form.Item label="Tempo Servizio Medio" name="service_time"><InputNumber style={{width:'100%'}} /></Form.Item>
                <Form.Item label="Capacità (Risorse)" name="capacity"><InputNumber min={1} style={{width:'100%'}} /></Form.Item></>
            )}
            {selectedNode.data.config.type === 'queue' && (
              <Form.Item label="Max Buffer" name="max_size"><InputNumber style={{width:'100%'}} /></Form.Item>
            )}
            <Divider />
            <Button danger block icon={<DeleteOutlined />} onClick={() => {
              setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
              setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
              setSelectedNodeId(null);
            }}>Elimina Componente</Button>
          </Form>
        )}
      </Drawer>

      <Modal 
        title="Salva Scenario" 
        open={isSaveModalVisible} 
        onCancel={() => setIsSaveModalVisible(false)}
        onOk={() => saveForm.submit()}
        okText="Salva nella Libreria"
      >
        <Form form={saveForm} layout="vertical" onFinish={handleSaveSubmit} initialValues={{ name: location.state?.name || `${scenarioType || 'custom'}_${Date.now()}` }}>
          <Form.Item label="Nome Scenario" name="name" rules={[{ required: true, message: 'Inserisci un nome' }]}>
            <Input placeholder="Es: Pronto Soccorso High Load" />
          </Form.Item>
          <Form.Item label="Descrizione (opzionale)" name="description">
            <Input.TextArea placeholder="Modello con 5 dottori e alto afflusso..." rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default () => (<App><ReactFlowProvider><EditorPage /></ReactFlowProvider></App>);
