from typing import Callable, Any

import numpy as np
import simpy

from ..engine.base_scenario import BaseScenario
from ..models import ManufacturingConfig


class ManufacturingScenario(BaseScenario):
    """
    Simulazione avanzata di una Linea di Produzione Multi-Stadio.
    
    Flusso: Arrivo -> Stadio 1 (Prep) -> Buffer Intermedio -> Stadio 2 (Assembly) -> Uscita.
    Ogni stadio ha un numero di macchine configurabile.
    Monitoring di: stati macchine, colli di bottiglia, costi energetici e scarti.
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback, pause_event)
        cfg = ManufacturingConfig(**config)
        
        # Split machines between Stage 1 and Stage 2 (min 1 per stage)
        self.num_s1 = max(1, cfg.num_machines // 2)
        self.num_s2 = max(1, cfg.num_machines - self.num_s1)
        
        self.arrival_rate = cfg.arrival_rate
        self.arrival_dist = cfg.arrival_dist
        self.proc_mean = cfg.processing_time_mean
        self.proc_std = cfg.processing_time_std
        self.proc_dist = cfg.processing_dist
        self.breakdown_rate = cfg.breakdown_rate
        self.repair_mean = cfg.repair_time_mean
        self.buffer_size = cfg.buffer_size
        
        # KPI e Statistiche
        self._n_arrived = 0
        self._n_produced = 0
        self._n_rejected = 0
        self._total_energy_kwh = 0.0
        self._total_labor_cost = 0.0
        self._total_breakdowns = 0
        
        # Stato macchine: 'IDLE', 'WORKING', 'BLOCKED', 'DOWN'
        self._m_states_s1 = ['IDLE'] * self.num_s1
        self._m_states_s2 = ['IDLE'] * self.num_s2
        
        self._s1_machines: simpy.Resource | None = None
        self._s2_machines: simpy.Resource | None = None
        self._intermediate_buffer: simpy.Store | None = None

        # Costi (fissi per ora)
        self.ENERGY_COST_RATE = 0.15  # unit/kWh
        self.LABOR_COST_RATE = 25.0   # unit/perc_hour

    def _get_dist_time(self, mean: float, dist_type: str, std: float = 0.0) -> float:
        if dist_type == "constant": return mean
        if dist_type == "uniform":  return np.random.uniform(mean * 0.8, mean * 1.2)
        if dist_type == "normal":   return max(0.1, np.random.normal(mean, std))
        return np.random.exponential(mean)

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #

    def setup(self) -> None:
        self._s1_machines = simpy.Resource(self.env, capacity=self.num_s1)
        self._s2_machines = simpy.Resource(self.env, capacity=self.num_s2)
        self._intermediate_buffer = simpy.Store(self.env, capacity=self.buffer_size)
        
        self._emit_event("kpi_update", {"info": "Manufacturing Line Online - Multi-Stage Mode"})
        
        self.env.process(self._arrival_process())
        
        # Processi guasti per ogni macchina
        for i in range(self.num_s1):
            self.env.process(self._breakdown_process("S1", i))
        for i in range(self.num_s2):
            self.env.process(self._breakdown_process("S2", i))

    # ------------------------------------------------------------------ #
    # Processi SimPy
    # ------------------------------------------------------------------ #

    def _arrival_process(self):
        while not self._should_stop:
            iat = self._get_dist_time(1.0 / self.arrival_rate, self.arrival_dist)
            yield self.env.timeout(iat)
            self._n_arrived += 1
            
            # Controllo congestione ingresso
            if len(self._s1_machines.queue) >= self.buffer_size:
                self._n_rejected += 1
                self._emit_event("entity_leave", {
                    "entityId": self._next_entity_id("part_rejected"),
                    "rejected": True, "reason": "Ingresso saturato", "triage": "red"
                })
                continue

            entity_id = self._next_entity_id("part")
            self.env.process(self._part_flow(entity_id))
            self._emit_event("entity_arrive", {
                "entityId": entity_id, "queueS1": len(self._s1_machines.queue)
            })

    def _part_flow(self, entity_id: str):
        """Gestisce il flusso del pezzo attraverso i vari stadi."""
        
        # --- STADIO 1: PREPARAZIONE ---
        with self._s1_machines.request() as req:
            yield req
            m_idx = self._find_free_machine(self._m_states_s1)
            self._update_m_state("S1", m_idx, "WORKING")
            
            self._emit_event("entity_move", {
                "entityId": entity_id, "from": "input", "to": f"Stage1_M{m_idx}"
            })
            
            p_time = self._get_dist_time(self.proc_mean * 0.4, self.proc_dist, self.proc_std * 0.4)
            yield self.env.timeout(p_time)
            
            # Costi
            self._total_energy_kwh += p_time * 2.5 # 2.5 kW consumo
            
            # Fine S1, tentativo di entrare nel buffer
            if self._should_stop: return
            
            self._update_m_state("S1", m_idx, "BLOCKED")
            yield self._intermediate_buffer.put(entity_id)
            self._update_m_state("S1", m_idx, "IDLE")
            
            self._emit_event("entity_move", {
                "entityId": entity_id, "from": f"Stage1_M{m_idx}", "to": "buffer"
            })

        # --- STADIO 2: ASSEMBLAGGIO ---
        # Il pezzo aspetta nel buffer finché S2 non è libero
        part_id = yield self._intermediate_buffer.get()
        
        with self._s2_machines.request() as req:
            yield req
            m_idx = self._find_free_machine(self._m_states_s2)
            self._update_m_state("S2", m_idx, "WORKING")
            
            self._emit_event("entity_move", {
                "entityId": entity_id, "from": "buffer", "to": f"Stage2_M{m_idx}"
            })
            
            p_time = self._get_dist_time(self.proc_mean * 0.6, self.proc_dist, self.proc_std * 0.6)
            yield self.env.timeout(p_time)
            
            self._total_energy_kwh += p_time * 4.0 # 4 kW consumo
            self._n_produced += 1
            
            self._update_m_state("S2", m_idx, "IDLE")
            self._emit_event("entity_leave", {
                "entityId": entity_id, "produced": True, "triage": "green"
            })

    def _breakdown_process(self, stage: str, idx: int):
        if self.breakdown_rate <= 0: return
        while not self._should_stop:
            ttf = np.random.exponential(1.0 / self.breakdown_rate)
            yield self.env.timeout(ttf)
            
            old_state = self._m_states_s1[idx] if stage == "S1" else self._m_states_s2[idx]
            self._update_m_state(stage, idx, "DOWN")
            self._total_breakdowns += 1
            self._emit_event("resource_breakdown", {"stage": stage, "machineIdx": idx})
            
            # Il guasto blocca la macchina specifica
            # In SimPy Resource non è banale bloccare una specifica unità, 
            # ma lo simuliamo aumentando il tempo di occupazione
            repair_time = np.random.exponential(self.repair_mean)
            yield self.env.timeout(repair_time)
            
            self._update_m_state(stage, idx, old_state if old_state != "DOWN" else "IDLE")
            self._emit_event("resource_repaired", {"stage": stage, "machineIdx": idx})

    # ------------------------------------------------------------------ #
    # Helper e KPI
    # ------------------------------------------------------------------ #

    def _find_free_machine(self, states: list[str]) -> int:
        try: return states.index("IDLE")
        except: return 0

    def _update_m_state(self, stage: str, idx: int, state: str):
        if stage == "S1": self._m_states_s1[idx] = state
        else: self._m_states_s2[idx] = state

    def get_kpis(self) -> dict[str, Any]:
        t = max(self.env.now, 1e-9)
        
        # Bottleneck detection
        util_s1 = self._s1_machines.count / self.num_s1 if self._s1_machines else 0
        util_s2 = self._s2_machines.count / self.num_s2 if self._s2_machines else 0
        bottleneck = 1.0 if util_s1 > util_s2 else 2.0
        
        cost = self._total_energy_kwh * self.ENERGY_COST_RATE + (t/60) * self.LABOR_COST_RATE

        return {
            "throughput": round(self._n_produced / (t / 60), 2) if t > 0 else 0.0,
            "rejectionRate": round(self._n_rejected / max(self._n_arrived, 1), 4),
            "bufferLevel": float(len(self._intermediate_buffer.items) if self._intermediate_buffer else 0),
            "utilizationS1": round(util_s1, 4),
            "utilizationS2": round(util_s2, 4),
            "bottleneck": bottleneck,
            "totalCost": round(cost, 2),
            "energyKWh": round(self._total_energy_kwh, 2),
            "breakdowns": float(self._total_breakdowns)
        }

    def _emit_event(self, event_type: str, payload: dict) -> None:
        if self._should_stop: return
        if self.pause_event: self.pause_event.wait()
        
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 4),
            "payload": payload,
            "kpis": self.get_kpis(),
        }
        self.emit(event)
