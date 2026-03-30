import { useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/simStore'

// ── Types ──────────────────────────────────────────────────────────────────────

type ZoneKey = 'arrival' | 'stage1' | 'buffer' | 'stage2' | 'exit'

interface Entity {
  id: string
  x: number
  y: number
  color: string
  opacity: number
  zone: ZoneKey
  status: 'waiting' | 'working' | 'done' | 'failed'
  lastUpdate: number
}

interface MachineState {
  id: string
  status: 'IDLE' | 'WORKING' | 'DOWN'
  zone: 'stage1' | 'stage2'
  idx: number
}

// ── Zone definitions (fractions of canvas logical size) ────────────────────────

const ZONE_DEFS: Record<ZoneKey, {
  xf: number; yf: number; wf: number; hf: number
  label: string; icon: string; color: string; bg: string; border: string
}> = {
  arrival: { xf: 0.01, yf: 0.08, wf: 0.11, hf: 0.84, label: 'Arrivi',    icon: '📥', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  stage1:  { xf: 0.15, yf: 0.04, wf: 0.24, hf: 0.92, label: 'S1 · Prep', icon: '⚙️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  buffer:  { xf: 0.43, yf: 0.08, wf: 0.12, hf: 0.84, label: 'Buffer',    icon: '📦', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
  stage2:  { xf: 0.59, yf: 0.04, wf: 0.24, hf: 0.92, label: 'S2 · Assy', icon: '🏭', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7' },
  exit:    { xf: 0.87, yf: 0.08, wf: 0.11, hf: 0.84, label: 'Uscita',    icon: '📤', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
}

const ZONE_ORDER: ZoneKey[] = ['arrival', 'stage1', 'buffer', 'stage2', 'exit']

const ENTITY_SIZE   = 10  // px, logical
const ENTITY_GAP    = 5
const HEADER_H      = 28
const ZONE_PADDING  = 8

// ── Helpers ────────────────────────────────────────────────────────────────────

function getZoneHeat(zoneKey: string, kpis: Record<string, number>): number {
  switch (zoneKey) {
    case 'stage1':
      return kpis['utilizationS1'] ?? kpis['utilization'] ?? 0
    case 'stage2':
      return kpis['utilizationS2'] ?? 0
    case 'buffer': {
      const level = kpis['bufferLevel'] ?? 0
      return Math.min(level / 10, 1)
    }
    case 'arrival': {
      const q = kpis['queueLength'] ?? 0
      return Math.min(q / 10, 1)
    }
    default:
      return 0
  }
}

function heatColor(intensity: number): string {
  const r = Math.round(intensity < 0.5 ? intensity * 2 * 255 : 255)
  const g = Math.round(intensity < 0.5 ? 255 : (1 - intensity) * 2 * 255)
  return `rgba(${r},${g},0,${0.18 + intensity * 0.22})`
}

function zonePx(key: ZoneKey, W: number, H: number) {
  const d = ZONE_DEFS[key]
  return { x: d.xf * W, y: d.yf * H, w: d.wf * W, h: d.hf * H }
}

function gridSlotPos(
  zone: { x: number; y: number; w: number; h: number },
  idx: number,
): [number, number] {
  const innerW = zone.w - ZONE_PADDING * 2
  const cols   = Math.max(1, Math.floor((innerW + ENTITY_GAP) / (ENTITY_SIZE + ENTITY_GAP)))
  const col    = idx % cols
  const row    = Math.floor(idx / cols)
  const cellSz = ENTITY_SIZE + ENTITY_GAP
  const x      = zone.x + ZONE_PADDING + col * cellSz + ENTITY_SIZE / 2
  const y      = zone.y + HEADER_H + ZONE_PADDING + row * cellSz + ENTITY_SIZE / 2
  return [x, y]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOut(dt: number): number {
  // smooth ease-out coefficient per frame
  return 1 - Math.pow(0.2, dt)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ArenaCanvasProps {
  showHeatmap?: boolean
}

export default function ArenaCanvas({ showHeatmap = false }: ArenaCanvasProps) {
  const { events } = useSimStore()
  const kpis = useSimStore(s => s.kpis)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const entitiesRef    = useRef<Map<string, Entity>>(new Map())
  const machinesRef    = useRef<Map<string, MachineState>>(new Map())
  const rafRef         = useRef<number>(0)
  const lastTimeRef    = useRef<number>(performance.now())
  const sizeRef        = useRef({ W: 700, H: 280 })
  const showHeatmapRef = useRef(showHeatmap)
  const kpisRef        = useRef(kpis)

  // Keep refs in sync so the draw loop always has current values
  showHeatmapRef.current = showHeatmap
  kpisRef.current        = kpis

  const [fps, setFps] = useState(0)
  const [counts, setCounts] = useState<Record<ZoneKey, number>>({
    arrival: 0, stage1: 0, buffer: 0, stage2: 0, exit: 0,
  })
  const lastFpsRef = useRef({ count: 0, time: performance.now() })

  // ── Responsive canvas via ResizeObserver ──────────────────────────────────

  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const applySize = (w: number, h: number) => {
      const dpr      = window.devicePixelRatio || 1
      const logicalW = Math.round(w)
      const logicalH = Math.round(h)
      sizeRef.current = { W: logicalW, H: logicalH }
      canvas.width   = logicalW * dpr
      canvas.height  = logicalH * dpr
      canvas.style.width  = `${logicalW}px`
      canvas.style.height = `${logicalH}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) applySize(width, height)
      }
    })
    ro.observe(container)

    const rect = container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) applySize(rect.width, rect.height)

    return () => ro.disconnect()
  }, [])

  // ── Process events → update entity/machine state ──────────────────────────

  useEffect(() => {
    const recent = events.slice(-60)
    const { W, H } = sizeRef.current

    for (const ev of recent) {
      const payload  = ev.payload as Record<string, unknown>
      const entityId = payload?.entityId as string | undefined

      if (!entityId) continue

      if (ev.type === 'entity_arrive') {
        const triage = payload?.triage as string | undefined
        const color  = triage === 'red' ? '#ef4444'
                     : triage === 'yellow' ? '#f59e0b'
                     : triage === 'green'  ? '#10b981'
                     : '#2563eb'
        const z   = zonePx('arrival', W, H)
        const [sx, sy] = gridSlotPos(z, 0)
        entitiesRef.current.set(entityId, {
          id: entityId, x: sx, y: sy,
          color, opacity: 1,
          zone: 'arrival', status: 'waiting', lastUpdate: Date.now(),
        })
      }

      else if (ev.type === 'entity_move') {
        const to      = (payload?.to as string) ?? ''
        const from    = (payload?.from as string) ?? ''
        const existing = entitiesRef.current.get(entityId)

        let zone: ZoneKey = 'buffer'
        let status: Entity['status'] = 'waiting'

        if (to.includes('Stage1') || to.includes('S1')) {
          zone = 'stage1'; status = 'working'
          const mIdx = parseInt(to.split('_M')[1])
          if (!isNaN(mIdx)) {
            machinesRef.current.set(to, { id: to, status: 'WORKING', zone: 'stage1', idx: mIdx })
          }
        } else if (to.includes('Stage2') || to.includes('S2')) {
          zone = 'stage2'; status = 'working'
          const mIdx = parseInt(to.split('_M')[1])
          if (!isNaN(mIdx)) {
            machinesRef.current.set(to, { id: to, status: 'WORKING', zone: 'stage2', idx: mIdx })
          }
        } else if (to === 'buffer') {
          zone = 'buffer'; status = 'waiting'
          if (from) {
            const m = machinesRef.current.get(from)
            if (m) machinesRef.current.set(from, { ...m, status: 'IDLE' })
          }
        } else if (to === 'arrival' || to === 'queue') {
          zone = 'arrival'; status = 'waiting'
        }

        // Limit total entities
        if (entitiesRef.current.size > 150 && !existing) {
          const oldest = [...entitiesRef.current.entries()]
            .sort((a, b) => a[1].lastUpdate - b[1].lastUpdate)[0]
          if (oldest) entitiesRef.current.delete(oldest[0])
        }

        const z    = zonePx(zone, W, H)
        const slot = entitiesRef.current.size % 40
        const [tx, ty] = gridSlotPos(z, slot)

        entitiesRef.current.set(entityId, {
          ...(existing ?? { id: entityId, x: tx, y: ty, color: '#2563eb', opacity: 1 }),
          zone, status, lastUpdate: Date.now(),
        } as Entity)
      }

      else if (ev.type === 'entity_leave') {
        const existing = entitiesRef.current.get(entityId)
        if (existing) {
          const rejected = payload?.abandoned || payload?.rejected
          entitiesRef.current.set(entityId, {
            ...existing,
            zone: 'exit',
            color: rejected ? '#ef4444' : '#7c3aed',
            status: rejected ? 'failed' : 'done',
            opacity: 0.6,
            lastUpdate: Date.now(),
          })
          setTimeout(() => entitiesRef.current.delete(entityId), 1200)
        }
      }

      else if (ev.type === 'resource_breakdown') {
        const key = `${payload.stage}_M${payload.machineIdx}`
        machinesRef.current.set(key, {
          id: key, status: 'DOWN',
          zone: payload.stage === 'S1' ? 'stage1' : 'stage2',
          idx: payload.machineIdx as number,
        })
      }

      else if (ev.type === 'resource_repaired') {
        const key = `${payload.stage}_M${payload.machineIdx}`
        const m   = machinesRef.current.get(key)
        if (m) machinesRef.current.set(key, { ...m, status: 'IDLE' })
      }
    }
  }, [events])

  // ── Render loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = (now: number) => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dt = Math.min((now - lastTimeRef.current) / 16.67, 4)
      lastTimeRef.current = now
      const t  = easeOut(dt)
      const { W, H } = sizeRef.current

      // ── Step 1: compute grid targets per zone ────────────────────────────

      // Group entities by zone, sorted stably by id
      const groups = new Map<ZoneKey, Entity[]>()
      for (const zk of ZONE_ORDER) groups.set(zk, [])
      for (const e of entitiesRef.current.values()) {
        groups.get(e.zone)?.push(e)
      }
      for (const [, g] of groups) g.sort((a, b) => a.id.localeCompare(b.id))

      // Lerp each entity towards its grid slot
      const now2 = Date.now()
      for (const [zk, group] of groups) {
        const zp = zonePx(zk, W, H)
        group.forEach((e, idx) => {
          if (now2 - e.lastUpdate > 30000) {
            entitiesRef.current.delete(e.id)
            return
          }
          const [tx, ty] = gridSlotPos(zp, idx)
          e.x = lerp(e.x, tx, t)
          e.y = lerp(e.y, ty, t)
        })
      }

      // ── Step 2: clear & background pattern ──────────────────────────────
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, 0, W, H)

      // Subtle dot grid
      ctx.fillStyle = '#e2e8f0'
      const dotSpacing = 20
      for (let gx = 0; gx < W; gx += dotSpacing) {
        for (let gy = 0; gy < H; gy += dotSpacing) {
          ctx.beginPath()
          ctx.arc(gx, gy, 0.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // ── Step 3: draw flow arrows ─────────────────────────────────────────

      const arrowPairs: [ZoneKey, ZoneKey][] = [
        ['arrival', 'stage1'], ['stage1', 'buffer'],
        ['buffer', 'stage2'], ['stage2', 'exit'],
      ]

      for (const [fromKey, toKey] of arrowPairs) {
        const zf = zonePx(fromKey, W, H)
        const zt = zonePx(toKey,   W, H)
        const x1 = zf.x + zf.w + 4
        const y1 = zf.y + zf.h / 2
        const x2 = zt.x - 4
        const y2 = zt.y + zt.h / 2
        const cx = (x1 + x2) / 2

        ctx.save()
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth   = 2
        ctx.setLineDash([5, 5])
        ctx.lineDashOffset = -(now / 50) % 10
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2)
        ctx.stroke()

        // Arrowhead (solid)
        const angle = Math.atan2(y2 - y1, x2 - x1)
        ctx.setLineDash([])
        ctx.fillStyle = '#94a3b8'
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - 8 * Math.cos(angle - 0.45), y2 - 8 * Math.sin(angle - 0.45))
        ctx.lineTo(x2 - 8 * Math.cos(angle + 0.45), y2 - 8 * Math.sin(angle + 0.45))
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // ── Step 4: draw zones ───────────────────────────────────────────────

      for (const [zk, def] of Object.entries(ZONE_DEFS) as [ZoneKey, typeof ZONE_DEFS[ZoneKey]][]) {
        // Zones and Glassmorphism Headers
        const zp = zonePx(zk, W, H)

        // Elevation Shadow
        ctx.save()
        ctx.shadowColor   = 'rgba(0,0,0,0.1)'
        ctx.shadowBlur    = 15
        ctx.shadowOffsetY = 4
        
        // Gradient Background
        const grad = ctx.createLinearGradient(zp.x, zp.y, zp.x, zp.y + zp.h)
        grad.addColorStop(0, def.bg)
        grad.addColorStop(1, '#ffffff')
        ctx.fillStyle = grad
        roundRect(ctx, zp.x, zp.y, zp.w, zp.h, 12)
        ctx.fill()
        ctx.restore()

        // Border
        ctx.strokeStyle = def.border
        ctx.lineWidth   = 2
        roundRect(ctx, zp.x, zp.y, zp.w, zp.h, 12)
        ctx.stroke()

        // Header Strip (Glassmorphism look)
        ctx.save()
        ctx.fillStyle = def.color
        ctx.beginPath()
        ctx.roundRect(zp.x, zp.y, zp.w, HEADER_H, [12, 12, 0, 0])
        ctx.fill()
        
        // Header inner light line
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'
        ctx.beginPath()
        ctx.moveTo(zp.x + 10, zp.y + HEADER_H - 1)
        ctx.lineTo(zp.x + zp.w - 10, zp.y + HEADER_H - 1)
        ctx.stroke()
        ctx.restore()

        // Zone label + Icon
        ctx.fillStyle = '#ffffff'
        ctx.font      = `bold ${Math.max(10, Math.round(W * 0.016))}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(`${def.icon} ${def.label}`, zp.x + zp.w / 2, zp.y + 19)

        // Occupancy count badge
        const cnt = groups.get(zk)?.length ?? 0
        if (cnt > 0) {
          const bx = zp.x + zp.w - 6
          const by = zp.y + 6
          const br = 8
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.beginPath()
          ctx.arc(bx, by, br, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font      = `bold 9px Inter, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(String(cnt), bx, by + 3.5)
        }
      }

      // ── Step 4b: heatmap overlay ─────────────────────────────────────────

      if (showHeatmapRef.current) {
        for (const [key, zone] of Object.entries(ZONE_DEFS)) {
          const intensity = getZoneHeat(key, kpisRef.current)
          if (intensity <= 0) continue
          const x = zone.xf * W
          const y = zone.yf * H
          const w = zone.wf * W
          const h = zone.hf * H
          ctx.fillStyle = heatColor(intensity)
          ctx.beginPath()
          ctx.roundRect(x, y, w, h, 6)
          ctx.fill()
        }
      }

      // ── Step 5: draw machines (stage zones) ─────────────────────────────

      for (const m of machinesRef.current.values()) {
        const zp   = zonePx(m.zone, W, H)
        const cols = Math.min(4, Math.ceil(Math.sqrt(machinesRef.current.size / 2 || 1)))
        const mw   = Math.min(18, (zp.w - ZONE_PADDING * 2 - (cols - 1) * 4) / cols)
        const col  = m.idx % cols
        const row  = Math.floor(m.idx / cols)
        const mx   = zp.x + ZONE_PADDING + col * (mw + 4) + mw / 2
        const my   = zp.y + HEADER_H + 8 + row * (mw + 4) + mw / 2

        const fill = m.status === 'DOWN'    ? '#ef4444'
                   : m.status === 'WORKING' ? '#10b981'
                   : '#94a3b8'

        ctx.save()
        // Pulse glow if working
        if (m.status === 'WORKING') {
          const pulse = (Math.sin(now / 200) + 1) / 2
          ctx.shadowColor = '#10b981'
          ctx.shadowBlur  = 4 + pulse * 6
        }
        
        ctx.fillStyle   = fill
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth   = 1.5
        ctx.beginPath()
        ctx.roundRect(mx - mw / 2, my - mw / 2, mw, mw, 4)
        ctx.fill()
        ctx.stroke()

        // Machine highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)'
        ctx.fillRect(mx - mw / 2 + 2, my - mw / 2 + 2, mw / 3, 2)

        // Machine label
        ctx.fillStyle = '#ffffff'
        ctx.font      = `bold 8px JetBrains Mono, monospace`
        ctx.textAlign = 'center'
        ctx.fillText(`M${m.idx}`, mx, my + 3)
        ctx.restore()
      }

      // ── Step 6: draw entities ────────────────────────────────────────────

      for (const e of entitiesRef.current.values()) {
        const half = ENTITY_SIZE / 2

        ctx.save()
        ctx.globalAlpha = e.opacity

        // Shadow and Glow
        ctx.shadowColor = e.status === 'working' ? e.color + '88' : 'rgba(0,0,0,0.2)'
        ctx.shadowBlur  = e.status === 'working' ? 8 : 4
        ctx.shadowOffsetY = 1

        // Body (3D Chip look)
        ctx.fillStyle   = e.color
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'
        ctx.lineWidth   = 0.5
        ctx.beginPath()
        ctx.roundRect(e.x - half, e.y - half, ENTITY_SIZE, ENTITY_SIZE, 3)
        ctx.fill()
        ctx.stroke()
        
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillRect(e.x - half + 1, e.y - half + 1, ENTITY_SIZE - 2, ENTITY_SIZE / 3)

        // Status dot (top-right corner)
        const dotColor = e.status === 'done'    ? '#10b981'
                       : e.status === 'failed'  ? '#ef4444'
                       : e.status === 'working' ? '#f59e0b'
                       : null

        if (dotColor) {
          ctx.shadowBlur  = 0
          ctx.fillStyle   = dotColor
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth   = 1
          ctx.beginPath()
          ctx.arc(e.x + half - 2, e.y - half + 2, 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }

        ctx.restore()
      }

      // ── Step 7: FPS counter ──────────────────────────────────────────────

      const fpsNow = performance.now()
      lastFpsRef.current.count++
      if (fpsNow - lastFpsRef.current.time > 1000) {
        const nextCounts = {} as Record<ZoneKey, number>
        for (const zk of ZONE_ORDER) nextCounts[zk] = groups.get(zk)?.length ?? 0
        setFps(lastFpsRef.current.count)
        setCounts(nextCounts)
        lastFpsRef.current = { count: 0, time: fpsNow }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const totalEntities = Object.values(counts).reduce((s, n) => s + n, 0)

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: '#f8fafc' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {/* Stats overlay */}
      <div style={{
        position: 'absolute', bottom: 8, right: 10,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span style={{
          fontSize: 10, color: '#94a3b8',
          fontFamily: "'JetBrains Mono', monospace",
          background: 'rgba(255,255,255,0.85)',
          padding: '2px 7px', borderRadius: 4, border: '1px solid #e2e8f0',
        }}>
          {fps} fps
        </span>
        {totalEntities > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: '#10b981', background: '#ecfdf5',
            padding: '2px 7px', borderRadius: 4, border: '1px solid #6ee7b7',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {totalEntities} entità
          </span>
        )}
      </div>
    </div>
  )
}
