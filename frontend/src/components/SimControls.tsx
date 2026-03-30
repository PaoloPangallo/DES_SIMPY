import { Badge } from 'antd'
import { useSimStore } from '../store/simStore'

interface Props {
  onPause:  () => void
  onResume: () => void
  onStop:   () => void
}

const STATUS_CONFIG: Record<string, {
  color: string; bg: string; dot: 'processing' | 'success' | 'warning' | 'error' | 'default'; label: string
}> = {
  running:   { color: '#10B981', bg: '#ECFDF5', dot: 'processing', label: 'In Esecuzione' },
  paused:    { color: '#F59E0B', bg: '#FFFBEB', dot: 'warning',    label: 'In Pausa' },
  completed: { color: '#2563EB', bg: '#EFF6FF', dot: 'success',    label: 'Completata' },
  error:     { color: '#EF4444', bg: '#FEF2F2', dot: 'error',      label: 'Errore' },
  stopped:   { color: '#64748B', bg: '#F1F5F9', dot: 'default',    label: 'Fermata' },
  idle:      { color: '#94A3B8', bg: '#F8FAFC', dot: 'default',    label: 'In Attesa' },
}

const WS_CONFIG: Record<string, { color: string; label: string }> = {
  connecting: { color: '#F59E0B', label: 'Connessione...' },
  open:       { color: '#10B981', label: 'Connesso' },
  closed:     { color: '#94A3B8', label: 'Disconnesso' },
  error:      { color: '#EF4444', label: 'Errore WS' },
}

const BTN_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 14px',
  fontFamily: "'Inter', sans-serif",
  fontSize: 13, fontWeight: 600,
  border: '1.5px solid',
  borderRadius: 6, cursor: 'pointer',
  transition: 'all 0.15s',
}

export default function SimControls({ onPause, onResume, onStop }: Props) {
  const { status, wsStatus } = useSimStore()

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  const wsCfg     = WS_CONFIG[wsStatus] ?? WS_CONFIG.closed

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

      {/* Status badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: statusCfg.bg,
        padding: '5px 12px',
        borderRadius: 20,
        flexShrink: 0,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: statusCfg.color,
          animation: status === 'running' ? 'pulse-green 2s ease-in-out infinite' : undefined,
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: statusCfg.color }}>
          {statusCfg.label}
        </span>
      </div>

      {/* WS indicator */}
      <div title={`WebSocket: ${wsStatus}`} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: wsCfg.color, flexShrink: 0,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: wsCfg.color,
        }} />
        <span style={{ fontWeight: 500 }}>WS</span>
      </div>

      {/* Pause */}
      <button
        disabled={status !== 'running'}
        onClick={onPause}
        style={{
          ...BTN_BASE,
          borderColor: status === 'running' ? '#E2E8F0' : '#F1F5F9',
          background: 'transparent',
          color: status === 'running' ? '#374151' : '#CBD5E1',
          cursor: status === 'running' ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => { if (status === 'running') { e.currentTarget.style.borderColor = '#F59E0B'; e.currentTarget.style.color = '#D97706'; e.currentTarget.style.background = '#FFFBEB' } }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = 'transparent' }}
      >
        ⏸ Pausa
      </button>

      {/* Resume */}
      <button
        disabled={status !== 'paused'}
        onClick={onResume}
        style={{
          ...BTN_BASE,
          borderColor: status === 'paused' ? '#10B981' : '#F1F5F9',
          background: status === 'paused' ? '#ECFDF5' : 'transparent',
          color: status === 'paused' ? '#059669' : '#CBD5E1',
          cursor: status === 'paused' ? 'pointer' : 'not-allowed',
        }}
      >
        ▶ Riprendi
      </button>

      {/* Stop */}
      <button
        disabled={status !== 'running' && status !== 'paused'}
        onClick={onStop}
        style={{
          ...BTN_BASE,
          borderColor: (status === 'running' || status === 'paused') ? '#FEE2E2' : '#F1F5F9',
          background: (status === 'running' || status === 'paused') ? '#FEF2F2' : 'transparent',
          color: (status === 'running' || status === 'paused') ? '#EF4444' : '#CBD5E1',
          cursor: (status === 'running' || status === 'paused') ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => { if (status === 'running' || status === 'paused') { e.currentTarget.style.background = '#EF4444'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#EF4444' } }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#FEE2E2' }}
      >
        ⏹ Ferma
      </button>
    </div>
  )
}
