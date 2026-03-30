import { Progress, Divider } from 'antd'
import {
  UserOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  LineChartOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import { useSimStore } from '../store/simStore'
import {
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis as ReYAxis
} from 'recharts'

const KPI_META: Record<string, {
  label: string
  icon: React.ReactNode
  format: (v: number) => string
  color: string
  bg: string
  suffix?: string
  thresholds?: { levels: { min: number, max: number, status: string, color: string }[] }
}> = {
  utilization:     { 
    label: 'Utilizzo Risorse (ρ)',   
    icon: <ThunderboltOutlined />, 
    format: (v) => `${(v * 100).toFixed(1)}%`,     
    color: '#2563EB', bg: '#EFF6FF',
    thresholds: {
      levels: [
        { min: 0, max: 0.2, status: 'Basso', color: '#94A3B8' },
        { min: 0.2, max: 0.8, status: 'Ottimale', color: '#10B981' },
        { min: 0.8, max: 1.1, status: 'Critico', color: '#EF4444' }
      ]
    }
  },
  throughput:      { label: 'Produttività (u/ora)',  icon: <RiseOutlined />,        format: (v) => v.toFixed(2),                    color: '#10B981', bg: '#ECFDF5' },
  avgWait:         { 
    label: 'Attesa Media (W)',      
    icon: <ClockCircleOutlined />, 
    format: (v) => `${v.toFixed(2)} min`,           
    color: '#F59E0B', bg: '#FFFBEB',
    thresholds: {
      levels: [
        { min: 0, max: 5, status: 'Veloce', color: '#10B981' },
        { min: 5, max: 15, status: 'In Attesa', color: '#F59E0B' },
        { min: 15, max: 999, status: 'Lento', color: '#EF4444' }
      ]
    }
  },
  queueLength:     { label: 'Lunghezza Coda (Lq)',   icon: <UserOutlined />,        format: (v) => v.toFixed(0),                    color: '#8B5CF6', bg: '#F5F3FF' },
  nServed:         { label: 'Serviti Totali',        icon: <CheckCircleOutlined />, format: (v) => v.toFixed(0),                    color: '#10B981', bg: '#ECFDF5' },
  nAbandoned:      { label: 'Abbandoni (Reneging)',icon: <WarningOutlined />,     format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  abandonmentRate: { label: 'Tasso Abbandono',      icon: <WarningOutlined />,     format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#EF4444', bg: '#FEF2F2' },
  nRejected:       { label: 'Rifiutati (Balking)',   icon: <WarningOutlined />,     format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  rejectionRate:   { label: 'Tasso Rifiuto (Pb)',    icon: <WarningOutlined />,     format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#EF4444', bg: '#FEF2F2' },
  fillRate:        { label: 'Livello Servizio',      icon: <CheckCircleOutlined />, format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#10B981', bg: '#ECFDF5' },
  nProduced:       { label: 'Prodotti Finiti',       icon: <LineChartOutlined />,   format: (v) => v.toFixed(0),                    color: '#2563EB', bg: '#EFF6FF' },
  bufferLevel:     { label: 'Livello Buffer',        icon: <TeamOutlined />,        format: (v) => v.toFixed(0),                    color: '#06B6D4', bg: '#ECFEFF' },
  totalBreakdowns: { label: 'Guasti Totali',         icon: <WarningOutlined />,     format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  deliveryRate:    { label: 'Tasso Consegna',        icon: <CheckCircleOutlined />, format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#10B981', bg: '#ECFDF5' },
  avgLatency:      { label: 'Latenza (RTT)',         icon: <ClockCircleOutlined />, format: (v) => `${(v * 1000).toFixed(2)} ms`, color: '#8B5CF6', bg: '#F5F3FF' },
  nFulfilled:      { label: 'Ordini Evasi',          icon: <CheckCircleOutlined />, format: (v) => v.toFixed(0),                    color: '#10B981', bg: '#ECFDF5' },
  nStockout:       { label: 'Stockout Totali',       icon: <WarningOutlined />,     format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  avgStockLevel:   { label: 'Giacenza Media',        icon: <TeamOutlined />,        format: (v) => v.toFixed(1),                    color: '#06B6D4', bg: '#ECFEFF' },
  nDelivered:      { label: 'Pacchetti Inviati',     icon: <CheckCircleOutlined />, format: (v) => v.toFixed(0),                    color: '#10B981', bg: '#ECFDF5' },
  nDropped:        { label: 'Pacchetti Persi',       icon: <WarningOutlined />,     format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  activeLinks:     { label: 'Link Attivi',           icon: <LineChartOutlined />,   format: (v) => v.toFixed(0),                    color: '#2563EB', bg: '#EFF6FF' },
  // ER Specific
  avgWaitRed:      { label: 'Attesa Media - ROSSO',  icon: <ClockCircleOutlined />, format: (v) => `${v.toFixed(2)} min`,           color: '#EF4444', bg: '#FEF2F2' },
  avgWaitYellow:   { label: 'Attesa Media - GIALLO', icon: <ClockCircleOutlined />, format: (v) => `${v.toFixed(2)} min`,           color: '#F59E0B', bg: '#FFFBEB' },
  avgWaitGreen:    { label: 'Attesa Media - VERDE',  icon: <ClockCircleOutlined />, format: (v) => `${v.toFixed(2)} min`,           color: '#10B981', bg: '#ECFDF5' },
  nRed:            { label: 'Pazienti ROSSI',        icon: <UserOutlined />,        format: (v) => v.toFixed(0),                    color: '#EF4444', bg: '#FEF2F2' },
  nYellow:         { label: 'Pazienti GIALLI',       icon: <UserOutlined />,        format: (v) => v.toFixed(0),                    color: '#F59E0B', bg: '#FFFBEB' },
  nGreen:          { label: 'Pazienti VERDI',        icon: <UserOutlined />,        format: (v) => v.toFixed(0),                    color: '#10B981', bg: '#ECFDF5' },
  nServedTotal:    { label: 'Pazienti Totali',       icon: <CheckCircleOutlined />, format: (v) => v.toFixed(0),                    color: '#2563EB', bg: '#EFF6FF' },
  arrivalRate:     { label: 'Tasso Arrivo (λ)',       icon: <RiseOutlined />,        format: (v) => `${v.toFixed(2)} u/min`,         color: '#06B6D4', bg: '#ECFEFF' },
  totalCost:       { label: 'Costo Totale (Opex)',   icon: <ThunderboltOutlined />, format: (v) => `€ ${v.toFixed(2)}`,             color: '#EF4444', bg: '#FEF2F2' },
  energyKWh:       { label: 'Consumo Energia',       icon: <ThunderboltOutlined />, format: (v) => `${v.toFixed(1)} kWh`,           color: '#F59E0B', bg: '#FFFBEB' },
  utilizationS1:   { label: 'Utilizzo S1 (Prep)',    icon: <ThunderboltOutlined />, format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#2563EB', bg: '#EFF6FF' },
  utilizationS2:   { label: 'Utilizzo S2 (Assy)',    icon: <ThunderboltOutlined />, format: (v) => `${(v * 100).toFixed(1)}%`,     color: '#10B981', bg: '#ECFDF5' },
  bottleneck:      { label: 'Collo di Bottiglia',    icon: <WarningOutlined />,     format: (v) => String(v),                       color: '#EF4444', bg: '#FEF2F2' },
}

export default function KpiPanel() {
  const { kpis, simTime, duration, events, activeAlerts } = useSimStore()
  const alertedKeys = new Set(activeAlerts.map((a) => a.kpiKey))
  const progress = Math.min((simTime / (duration || 480)) * 100, 100)

  const kpiEntries = Object.entries(kpis).sort(([k1], [k2]) => {
    const priority = ['avgWait', 'avgService', 'nAbandoned', 'arrivalRate', 'utilization']
    const i1 = priority.indexOf(k1)
    const i2 = priority.indexOf(k2)
    if (i1 === -1 && i2 === -1) return 0
    if (i1 === -1) return 1
    if (i2 === -1) return -1
    return i1 - i2
  })

  return (
    <div>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-accent" />
        <span className="panel-title">KPI in diretta</span>
      </div>

      {/* Sim time progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginBottom: 6, fontSize: 12,
        }}>
          <span style={{ color: '#64748B', fontWeight: 500 }}>Tempo simulazione</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, fontWeight: 600, color: '#2563EB',
          }}>
            {simTime.toFixed(1)} / {duration} min
          </span>
        </div>
        <Progress
          percent={progress}
          showInfo={false}
          strokeColor={{ '0%': '#2563EB', '100%': '#06B6D4' }}
          trailColor="#E2E8F0"
          size="small"
          style={{ margin: 0 }}
        />
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {kpiEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94A3B8', fontSize: 13 }}>
            In attesa dei dati...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {kpiEntries.map(([k, v]) => {
              const meta = KPI_META[k]
              if (typeof v !== 'number' && !meta?.format) return null
              
              // Get history for sparkline
              const history = events
                .filter((ev: any) => ev.type === 'kpi_update' || ev.payload?.[k] !== undefined)
                .map((ev: any) => ({ value: (ev.kpis as any)?.[k] ?? (ev.payload as any)?.[k] }))
                .filter((d: any) => typeof d.value === 'number')
                .slice(-15) // Last 15 points

              const label   = meta?.label ?? k
              const value   = meta?.format ? meta.format(v) : v.toString()
              const color   = meta?.color ?? '#2563EB'
              const bg      = meta?.bg ?? '#EFF6FF'
              const icon    = meta?.icon ?? <LineChartOutlined />

              // Status badge logic
              const currentStatus = meta?.thresholds?.levels.find(l => v >= l.min && v < l.max)

              return (
                <div key={k} className="kpi-metric-premium" style={{
                  borderLeftColor: color,
                  borderRadius: 10,
                  background: '#FFF',
                  borderColor: alertedKeys.has(k) ? '#f59e0b' : undefined,
                  boxShadow: alertedKeys.has(k) ? '0 0 0 2px rgba(245,158,11,0.15)' : undefined,
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span className="title">{label}</span>
                       <div className="value">{value}</div>
                    </div>
                    <div style={{ width: 28, height: 28, background: bg, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, fontSize: 13 }}>
                      {icon}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 24 }}>
                    <div style={{ flex: 1, height: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={history}>
                           <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                           <ReYAxis hide domain={['auto', 'auto']} />
                         </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {currentStatus && (
                      <span style={{ 
                        fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                        background: currentStatus.color + '10', color: currentStatus.color,
                        textTransform: 'uppercase', border: `1px solid ${currentStatus.color}20`
                      }}>
                        {currentStatus.status}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
