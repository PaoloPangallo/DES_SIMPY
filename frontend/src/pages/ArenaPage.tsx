import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, notification } from 'antd'
import { useSimStore } from '../store/simStore'
import { useSimWebSocket } from '../hooks/useSimWebSocket'
import KpiPanel from '../components/KpiPanel'
import LiveChart from '../components/LiveChart'
import SimControls from '../components/SimControls'
import ArenaCanvas from '../components/ArenaCanvas'
import AlertRulesDrawer from '../components/AlertRulesDrawer'
import { ArrowLeftOutlined, BellOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons'

type TabId = 'canvas' | 'charts' | 'log'

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  entity_arrive:      { bg: '#eff6ff', text: '#2563eb' },
  entity_move:        { bg: '#ecfdf5', text: '#10b981' },
  entity_leave:       { bg: '#fffbeb', text: '#d97706' },
  resource_busy:      { bg: '#fffbeb', text: '#f59e0b' },
  resource_free:      { bg: '#ecfdf5', text: '#10b981' },
  resource_breakdown: { bg: '#fef2f2', text: '#ef4444' },
  resource_repaired:  { bg: '#ecfdf5', text: '#10b981' },
  kpi_update:         { bg: '#f5f3ff', text: '#8b5cf6' },
  sim_end:            { bg: '#ecfeff', text: '#06b6d4' },
  sim_error:          { bg: '#fef2f2', text: '#ef4444' },
}

const SCENARIO_LABELS: Record<string, string> = {
  call_center:     'Call Center',
  manufacturing:   'Manifattura',
  supply_chain:    'Supply Chain',
  network_traffic: 'Traffico di rete',
  hospital_er:     'Pronto Soccorso',
  data_center:     'Data Center',
  custom:          'Scenario custom',
}

const ACCENT: Record<TabId, string> = {
  canvas: '#2563eb',
  charts: '#10b981',
  log:    '#f59e0b',
}

export default function ArenaPage() {
  const { simId } = useParams<{ simId: string }>()
  const navigate  = useNavigate()
  const { scenarioType, events, simTime, duration, setSimId, wsStatus, status } = useSimStore()
  const [activeTab, setActiveTab] = useState<TabId>('canvas')
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false)
  const notifiedIdsRef = useRef<Set<string>>(new Set())
  const activeAlerts = useSimStore(s => s.activeAlerts)

  useEffect(() => {
    if (simId) setSimId(simId)
  }, [simId, setSimId])

  useEffect(() => {
    for (const alert of activeAlerts) {
      const key = `${alert.ruleId}-${alert.triggeredAt}`
      if (!notifiedIdsRef.current.has(key)) {
        notification.warning({
          message: `KPI Alert: ${alert.kpiKey}`,
          description: `Value ${alert.value.toFixed(3)} at t=${alert.triggeredAt.toFixed(1)}`,
          placement: 'topRight',
          duration: 4,
        })
        notifiedIdsRef.current = new Set([...notifiedIdsRef.current, key])
      }
    }
  }, [activeAlerts])

  useSimWebSocket(simId ?? null)

  const handlePause     = () => fetch(`/sim/${simId}/pause`,  { method: 'POST' })
  const handleResume    = () => fetch(`/sim/${simId}/resume`, { method: 'POST' })
  const handleStop      = () => fetch(`/sim/${simId}/stop`,   { method: 'POST' })
  const handleExportCsv = () => window.open(`/results/${simId}/export/csv`, '_blank')
  const handleExportParquet = async () => {
    if (!simId) return
    try {
      const res = await fetch(`/results/${simId}/export/parquet`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sim_${simId.slice(0, 8)}.parquet`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silently fail — no message API needed
    }
  }

  const recentEvents = events.slice(-100).reverse()
  const progress = Math.min(((simTime / (duration || 480)) * 100), 100)

  const formatEventMessage = (ev: any) => {
    const p = ev.payload as any
    switch (ev.type) {
      case 'entity_arrive': return `Entità ${p.entityId} arrivata`
      case 'entity_move':   return `Sposta ${p.entityId} → ${p.to}`
      case 'entity_leave':  return `${p.entityId} uscita (${p.produced ? 'OK' : 'KO: ' + p.reason})`
      case 'resource_breakdown': return `GUASTO: Macchina ${p.machineIdx}`
      case 'resource_repaired':  return `RIPARATA: Macchina ${p.machineIdx}`
      default: return ev.type
    }
  }

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'canvas', label: 'Canvas' },
    { id: 'charts', label: 'Grafici' },
    { id: 'log',    label: 'Log', badge: events.length },
  ]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>

      {wsStatus !== 'open' && wsStatus !== 'closed' && (
        <Alert
          message={wsStatus === 'connecting' ? 'Connessione in corso...' : 'Errore di connessione. Riconnessione...'}
          type={wsStatus === 'connecting' ? 'info' : 'error'}
          showIcon banner style={{ zIndex: 100 }}
        />
      )}

      {/* ── Header ── */}
      <header style={{
        height: 52, flexShrink: 0,
        background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, background: '#2563eb',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ThunderboltOutlined style={{ color: '#fff', fontSize: 13 }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', letterSpacing: '-0.02em' }}>DES Arena</span>
        </div>

        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

        {/* Back */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#64748b', fontSize: 12, fontWeight: 600,
            padding: '3px 8px', borderRadius: 5, flexShrink: 0, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#64748b' }}
        >
          <ArrowLeftOutlined /> Scenari
        </button>

        {scenarioType && (
          <>
            <span style={{ color: '#cbd5e1', fontSize: 12 }}>/</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', flexShrink: 0 }}>
              {SCENARIO_LABELS[scenarioType] ?? scenarioType}
            </span>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Progresso</span>
          <div style={{ width: 160, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`,
              background: progress > 80 ? '#10b981' : '#2563eb',
              borderRadius: 3, transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 700, color: '#2563eb',
            minWidth: 60,
          }}>
            {simTime.toFixed(1)}m
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

        <SimControls onPause={handlePause} onResume={handleResume} onStop={handleStop} />

        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />

        <button
          onClick={handleExportCsv}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: '1.5px solid #e2e8f0',
            color: '#64748b', padding: '5px 12px',
            fontSize: 12, fontWeight: 600, borderRadius: 6,
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b' }}
        >
          <DownloadOutlined /> CSV
        </button>

        <button
          onClick={handleExportParquet}
          disabled={status !== 'completed' && status !== 'stopped'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: '1.5px solid #e2e8f0',
            color: '#64748b', padding: '5px 12px',
            fontSize: 12, fontWeight: 600, borderRadius: 6,
            cursor: status !== 'completed' && status !== 'stopped' ? 'not-allowed' : 'pointer',
            opacity: status !== 'completed' && status !== 'stopped' ? 0.5 : 1,
            flexShrink: 0, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (status === 'completed' || status === 'stopped') {
              e.currentTarget.style.borderColor = '#2563eb'
              e.currentTarget.style.color = '#2563eb'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0'
            e.currentTarget.style.color = '#64748b'
          }}
        >
          <DownloadOutlined /> Parquet
        </button>

        <button
          onClick={() => setShowHeatmap(h => !h)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: showHeatmap ? '#eff6ff' : 'none',
            border: `1.5px solid ${showHeatmap ? '#2563eb' : '#e2e8f0'}`,
            color: showHeatmap ? '#2563eb' : '#64748b',
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            borderRadius: 6, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
          }}
        >
          🌡 Heatmap
        </button>

        <button
          onClick={() => setAlertDrawerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: activeAlerts.length > 0 ? '#fff7e6' : 'none',
            border: `1.5px solid ${activeAlerts.length > 0 ? '#d97706' : '#e2e8f0'}`,
            color: activeAlerts.length > 0 ? '#d97706' : '#64748b',
            padding: '5px 12px', fontSize: 12, fontWeight: 600,
            borderRadius: 6, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
          }}
        >
          <BellOutlined />
          {activeAlerts.length > 0 ? ` Alerts (${activeAlerts.length})` : ' Alerts'}
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 10, padding: 10,
        minHeight: 0, overflow: 'hidden',
      }}>

        {/* ── Left: tab panel ── */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0',
          borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'stretch',
            borderBottom: '1px solid #e2e8f0', flexShrink: 0, padding: '0 16px',
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  fontSize: 12, fontWeight: 600,
                  color: activeTab === tab.id ? ACCENT[tab.id] : '#64748b',
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${activeTab === tab.id ? ACCENT[tab.id] : 'transparent'}`,
                  marginBottom: -1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'color 0.15s, border-color 0.15s',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
                onMouseEnter={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = '#0f172a' }}
                onMouseLeave={(e) => { if (activeTab !== tab.id) e.currentTarget.style.color = '#64748b' }}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: activeTab === tab.id ? ACCENT[tab.id] : '#f1f5f9',
                    color: activeTab === tab.id ? '#fff' : '#64748b',
                    padding: '1px 6px', borderRadius: 20, minWidth: 20, textAlign: 'center',
                  }}>
                    {tab.badge > 999 ? '999+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 14 }}>

            {activeTab === 'canvas' && (
              <div style={{ width: '100%', height: '100%' }}>
                <ArenaCanvas showHeatmap={showHeatmap} />
              </div>
            )}

            {activeTab === 'charts' && (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Telemetria Prestazioni
                  </div>
                  <LiveChart />
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Traffico e Code
                  </div>
                  <LiveChart keys={['throughput', 'queueLength', 'nServed', 'bufferLevel']} title="" />
                </div>
              </div>
            )}

            {activeTab === 'log' && (
              <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
                {recentEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>
                    In attesa degli eventi...
                  </div>
                ) : (
                  recentEvents.map((ev, i) => {
                    const colors = EVENT_COLORS[ev.type] ?? { bg: '#f8fafc', text: '#64748b' }
                    const entityId = (ev.payload as Record<string, unknown>)?.entityId as string | undefined
                    return (
                      <div key={i} className="event-row" style={{ marginBottom: 2 }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 10, color: '#94a3b8', width: 46, flexShrink: 0,
                        }}>
                          {ev.sim_time.toFixed(1)}m
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: colors.text, background: colors.bg,
                          padding: '1px 7px', borderRadius: 20, flexShrink: 0,
                          maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {formatEventMessage(ev)}
                        </span>
                        {entityId && (
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            color: (ev.payload as any)?.triage === 'red'    ? '#ef4444'
                                 : (ev.payload as any)?.triage === 'yellow' ? '#f59e0b'
                                 : (ev.payload as any)?.triage === 'green'  ? '#10b981'
                                 : '#94a3b8',
                            marginLeft: 'auto', flexShrink: 0,
                            fontWeight: (ev.payload as any)?.triage ? 700 : 400,
                          }}>
                            #{String(entityId).split('_').pop()}
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

          </div>
        </div>

        {/* ── Right: KPI sidebar ── */}
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0',
          borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflowY: 'auto', minHeight: 0, padding: 14,
        }}>
          <KpiPanel />
        </div>

      </div>

      <AlertRulesDrawer
        open={alertDrawerOpen}
        onClose={() => setAlertDrawerOpen(false)}
      />
    </div>
  )
}
