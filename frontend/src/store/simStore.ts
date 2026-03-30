import { create } from 'zustand'

export interface SimEvent {
  sim_id: string
  sim_time: number
  wall_time: number
  type: string
  payload: Record<string, unknown>
  kpis: Record<string, number>
}

export interface AlertRule {
  id: string
  kpiKey: string
  operator: '>' | '<' | '>=' | '<='
  threshold: number
  label: string
}

export interface ActiveAlert {
  ruleId: string
  kpiKey: string
  value: number
  triggeredAt: number // sim_time
}

export interface SimState {
  simId: string | null
  scenarioType: string | null
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped'
  simTime: number
  duration: number
  kpis: Record<string, number>
  kpiHistory: Array<{ sim_time: number } & Record<string, number>>
  events: SimEvent[]
  wsStatus: 'connecting' | 'open' | 'closed' | 'error'
  alertRules: AlertRule[]
  activeAlerts: ActiveAlert[]

  setSimId: (id: string) => void
  setScenarioType: (type: string) => void
  setStatus: (s: SimState['status']) => void
  setWsStatus: (s: SimState['wsStatus']) => void
  pushEvent: (event: SimEvent) => void
  pushBatch: (events: SimEvent[], kpis: Record<string, number>, simTime: number) => void
  reset: () => void
  addAlertRule: (rule: AlertRule) => void
  removeAlertRule: (id: string) => void
  clearActiveAlerts: () => void
}

const MAX_EVENTS = 500
const MAX_KPI_HISTORY = 300

export const useSimStore = create<SimState>((set) => ({
  simId: null,
  scenarioType: null,
  status: 'idle',
  simTime: 0,
  duration: 480,
  kpis: {},
  kpiHistory: [],
  events: [],
  wsStatus: 'closed',
  alertRules: [],
  activeAlerts: [],

  setSimId: (id) => set({ simId: id }),
  setScenarioType: (type) => set({ scenarioType: type }),
  setStatus: (s) => set({ status: s }),
  setWsStatus: (s) => set({ wsStatus: s }),

  addAlertRule: (rule) => set(state => ({ alertRules: [...state.alertRules, rule] })),
  removeAlertRule: (id) => set(state => ({ alertRules: state.alertRules.filter(r => r.id !== id) })),
  clearActiveAlerts: () => set({ activeAlerts: [] }),

  pushEvent: (event) =>
    set((state) => {
      const newEvents = [...state.events.slice(-MAX_EVENTS + 1), event]
      const newKpiHistory =
        event.kpis && Object.keys(event.kpis).length > 0
          ? [
              ...state.kpiHistory.slice(-MAX_KPI_HISTORY + 1),
              { sim_time: event.sim_time, ...event.kpis },
            ]
          : state.kpiHistory

      let newStatus = state.status
      if (event.type === 'sim_end') newStatus = 'completed'
      if (event.type === 'sim_error') newStatus = 'error'

      // Evaluate alert rules against new KPIs
      const newKpis = event.kpis || state.kpis
      const newAlerts: ActiveAlert[] = []
      for (const rule of state.alertRules) {
        const val = newKpis[rule.kpiKey]
        if (val === undefined) continue
        const triggered =
          rule.operator === '>'  ? val >  rule.threshold :
          rule.operator === '<'  ? val <  rule.threshold :
          rule.operator === '>=' ? val >= rule.threshold :
                                   val <= rule.threshold
        if (triggered && !state.activeAlerts.some(a => a.ruleId === rule.id)) {
          newAlerts.push({ ruleId: rule.id, kpiKey: rule.kpiKey, value: val, triggeredAt: event.sim_time })
        }
      }
      const maxOld = Math.max(0, 50 - newAlerts.length)
      const newActiveAlerts = newAlerts.length > 0
        ? [...state.activeAlerts.slice(-maxOld), ...newAlerts]
        : state.activeAlerts

      return {
        events: newEvents,
        kpis: event.kpis || state.kpis,
        kpiHistory: newKpiHistory,
        simTime: event.sim_time,
        status: newStatus,
        activeAlerts: newActiveAlerts,
      }
    }),

  pushBatch: (batchEvents, batchKpis, batchSimTime) =>
    set((state) => {
      // 1. Aggiungi eventi, mantenendo il limite MAX_EVENTS
      const newEvents = [...state.events, ...batchEvents].slice(-MAX_EVENTS)

      // 2. Aggiorna history KPI se presenti (prendiamo solo l'ultimo stato dei KPI del batch)
      const newKpiHistory = batchKpis && Object.keys(batchKpis).length > 0
        ? [...state.kpiHistory.slice(-MAX_KPI_HISTORY + 1), { sim_time: batchSimTime, ...batchKpis }]
        : state.kpiHistory

      // 3. Controlla stati terminali nel batch
      let newStatus = state.status
      if (batchEvents.some(e => e.type === 'sim_end')) newStatus = 'completed'
      if (batchEvents.some(e => e.type === 'sim_error')) newStatus = 'error'

      // Evaluate alert rules against new KPIs
      const newAlerts: ActiveAlert[] = []
      for (const rule of state.alertRules) {
        const val = batchKpis[rule.kpiKey]
        if (val === undefined) continue
        const triggered =
          rule.operator === '>'  ? val >  rule.threshold :
          rule.operator === '<'  ? val <  rule.threshold :
          rule.operator === '>=' ? val >= rule.threshold :
                                   val <= rule.threshold
        if (triggered && !state.activeAlerts.some(a => a.ruleId === rule.id)) {
          newAlerts.push({ ruleId: rule.id, kpiKey: rule.kpiKey, value: val, triggeredAt: batchSimTime })
        }
      }
      const maxOld = Math.max(0, 50 - newAlerts.length)
      const newActiveAlerts = newAlerts.length > 0
        ? [...state.activeAlerts.slice(-maxOld), ...newAlerts]
        : state.activeAlerts

      return {
        events: newEvents,
        kpis: batchKpis || state.kpis,
        kpiHistory: newKpiHistory,
        simTime: batchSimTime,
        status: newStatus,
        activeAlerts: newActiveAlerts,
      }
    }),

  reset: () =>
    set({
      simId: null,
      scenarioType: null,
      status: 'idle',
      simTime: 0,
      duration: 480,
      kpis: {},
      kpiHistory: [],
      events: [],
      wsStatus: 'closed',
      activeAlerts: [],
    }),
}))
