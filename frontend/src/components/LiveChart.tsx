import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useSimStore } from '../store/simStore'

const LINE_COLORS = [
  '#2563EB',  // blue
  '#10B981',  // green
  '#F59E0B',  // amber
  '#EF4444',  // red
  '#8B5CF6',  // purple
  '#06B6D4',  // cyan
  '#EC4899',  // pink
  '#F97316',  // orange
]

const KPI_KEYS_PRIORITY = [
  'utilization', 'queueLength', 'throughput', 'avgWait',
  'fillRate', 'deliveryRate', 'bufferLevel', 'abandonmentRate',
]

interface Props {
  keys?: string[]
  title?: string
}

export default function LiveChart({ keys, title = 'Andamento KPI' }: Props) {
  const { kpiHistory } = useSimStore()

  const activeKeys = useMemo(() => {
    if (kpiHistory.length === 0) return []
    const firstEntry = kpiHistory[0]
    
    // Filtriamo solo chiavi con valori numerici
    const allNumericKeys = Object.keys(firstEntry).filter((k) => 
      k !== 'sim_time' && typeof firstEntry[k] === 'number'
    )

    if (keys) return keys.filter((k) => allNumericKeys.includes(k))
    
    const sorted = [...KPI_KEYS_PRIORITY.filter((k) => allNumericKeys.includes(k))]
    for (const k of allNumericKeys) {
      if (!sorted.includes(k)) sorted.push(k)
    }
    return sorted.slice(0, 4)
  }, [keys, kpiHistory])

  const data = useMemo(() => {
    if (kpiHistory.length <= 200) return kpiHistory
    const step = Math.floor(kpiHistory.length / 200)
    return kpiHistory.filter((_, i) => i % step === 0)
  }, [kpiHistory])

  if (data.length === 0) {
    return (
      <div style={{
        height: '100%', minHeight: 180,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#94A3B8', fontSize: 13,
      }}>
        In attesa di dati…
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis
          dataKey="sim_time"
          tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
          tickFormatter={(v) => `${(v as number).toFixed(0)}m`}
          axisLine={{ stroke: '#E2E8F0' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#94A3B8', fontSize: 11 }}
          width={44}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            color: '#0F172A',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
          labelFormatter={(v) => `t = ${(v as number).toFixed(1)} min`}
          itemStyle={{ fontWeight: 600 }}
        />
        <Legend
          wrapperStyle={{
            fontSize: 12, color: '#64748B',
            fontFamily: 'Inter, sans-serif',
            paddingTop: 8,
          }}
        />
        {activeKeys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
