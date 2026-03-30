import { useEffect, useRef, useCallback } from 'react'
import { useSimStore } from '../store/simStore'

const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8002'

export function useSimWebSocket(simId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const { pushEvent, setWsStatus, setStatus } = useSimStore()
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!simId || !mountedRef.current) return

    setWsStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${simId}`;
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setWsStatus('open')
      setStatus('running')
    }

    ws.onmessage = (e) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'batch') {
          useSimStore.getState().pushBatch(data.events, data.kpis, data.sim_time)
        } else {
          pushEvent(data)
        }
      } catch (err) {
        console.error("WS Parse Error:", err)
      }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setWsStatus('error')
    }

    ws.onclose = (e) => {
      if (!mountedRef.current) return
      setWsStatus('closed')
      // auto-reconnect solo se chiusura inattesa (non 1000=normal o 4004=not found)
      if (e.code !== 1000 && e.code !== 4004) {
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }
    }
  }, [simId, pushEvent, setWsStatus, setStatus])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close(1000)
    }
  }, [connect])

  const sendMessage = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  return { sendMessage }
}
