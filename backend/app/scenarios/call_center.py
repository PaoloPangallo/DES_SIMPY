from typing import Callable, Any

import numpy as np
import simpy

from ..engine import BaseScenario
from ..models import CallCenterConfig


class CallCenterScenario(BaseScenario):
    """
    Scenario Call Center: coda M/M/c con pazienza cliente.

    Entità: clienti che arrivano con tasso `arrival_rate`,
    vengono serviti da `num_agents` agenti con tasso `service_rate`.
    Se attendono più di `patience` minuti, abbandonano.
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback, pause_event)
        cfg = CallCenterConfig(**config)
        self.num_agents = cfg.num_agents
        self.arrival_rate = cfg.arrival_rate
        self.arrival_dist = cfg.arrival_dist
        self.service_rate = cfg.service_rate
        self.service_dist = cfg.service_dist
        self.use_max_queue = cfg.use_max_queue
        self.max_queue = cfg.max_queue
        self.patience = cfg.patience

        # KPI incrementali (Welford online algorithm)
        self._n_served = 0
        self._n_abandoned = 0
        self._n_arrived = 0
        self._n_rejected = 0  # Per coda piena
        self._wait_mean = 0.0
        self._wait_m2 = 0.0
        self._service_mean = 0.0
        self._service_m2 = 0.0
        self._busy_time = 0.0
        self._last_busy_check = 0.0
        
        # Skill degli agenti: alcuni sono piu veloci (0.8x tempo), altri piu lenti (1.2x)
        self._agent_efficiencies = np.random.uniform(0.8, 1.3, self.num_agents)

        self._agents: simpy.Resource | None = None

    def _get_dist_time(self, rate: float, dist_type: str) -> float:
        """Helper per calcolare il tempo in base alla distribuzione selezionata."""
        if dist_type == "constant":
            return 1.0 / rate
        if dist_type == "uniform":
            mean = 1.0 / rate
            return np.random.uniform(mean * 0.5, mean * 1.5)
        # default is exponential (Poisson arrivals)
        return np.random.exponential(1.0 / rate)

    # ------------------------------------------------------------------ #
    # Setup
    # ------------------------------------------------------------------ #

    def setup(self) -> None:
        self._agents = simpy.Resource(self.env, capacity=self.num_agents)
        self._emit_event("kpi_update", {"info": "Simulazione avviata"})
        self.env.process(self._arrival_process())

    # ------------------------------------------------------------------ #
    # Processi SimPy
    # ------------------------------------------------------------------ #

    def _arrival_process(self):
        """Genera arrivi in base alla distribuzione selezionata."""
        while True:
            iat = self._get_dist_time(self.arrival_rate, self.arrival_dist)
            yield self.env.timeout(iat)
            
            self._n_arrived += 1
            
            # Controllo limite coda (Balking / Rejection)
            if self.use_max_queue and len(self._agents.queue) >= self.max_queue:
                self._n_rejected += 1
                entity_id = self._next_entity_id("customer_rejected")
                self._emit_event("entity_leave", {
                    "entityId": entity_id,
                    "rejected": True,
                    "reason": "Coda piena",
                })
                continue

            entity_id = self._next_entity_id("customer")
            self.env.process(self._customer_process(entity_id))
            self._emit_event("entity_arrive", {
                "entityId": entity_id,
                "queueLength": len(self._agents.queue),
            })

    def _customer_process(self, entity_id: str):
        """Ciclo di vita di un singolo cliente."""
        arrive_time = self.env.now

        with self._agents.request() as req:
            # Pazienza stocastica: la pazienza media è self.patience
            individual_patience = np.random.exponential(self.patience) if self.patience > 0 else 999999
            
            # aspetta con timeout = pazienza individuale
            result = yield req | self.env.timeout(individual_patience)

            if req in result:
                # servito
                wait = self.env.now - arrive_time
                self._update_welford_wait(wait)
                
                # Identifica l'agente (solo per visualizzazione)
                # In SimPy resource.users è una lista dei request correnti
                agent_idx = 0
                try:
                    agent_idx = self._agents.users.index(req)
                except ValueError:
                    pass

                self._emit_event("entity_move", {
                    "entityId": entity_id,
                    "from": "queue",
                    "to": f"agent_{agent_idx}",
                    "waitTime": round(wait, 4),
                    "agentEfficiency": round(self._agent_efficiencies[agent_idx], 2)
                })
                
                # Il tempo di servizio è scalato dall'efficienza dell'agente
                base_service_time = self._get_dist_time(self.service_rate, self.service_dist)
                service_time = base_service_time * self._agent_efficiencies[agent_idx]
                
                yield self.env.timeout(service_time)
                self._busy_time += service_time
                self._update_welford_service(service_time)
                self._n_served += 1
                self._emit_event("entity_leave", {
                    "entityId": entity_id,
                    "serviceTime": round(service_time, 4),
                    "waitTime": round(wait, 4),
                })
            else:
                # abbandonato (Reneging)
                self._n_abandoned += 1
                self._emit_event("entity_leave", {
                    "entityId": entity_id,
                    "abandoned": True,
                    "waitTime": round(self.patience, 4),
                })

    # ------------------------------------------------------------------ #
    # Welford online updates
    # ------------------------------------------------------------------ #

    def _update_welford_wait(self, value: float) -> None:
        n = self._n_served + 1
        delta = value - self._wait_mean
        self._wait_mean += delta / n
        delta2 = value - self._wait_mean
        self._wait_m2 += delta * delta2

    def _update_welford_service(self, value: float) -> None:
        n = self._n_served + 1
        delta = value - self._service_mean
        self._service_mean += delta / n
        delta2 = value - self._service_mean
        self._service_m2 += delta * delta2

    # ------------------------------------------------------------------ #
    # KPI
    # ------------------------------------------------------------------ #

    def get_kpis(self) -> dict[str, Any]:
        now = max(self.env.now, 1e-9)
        total_capacity = self.num_agents * now
        utilization = min(self._busy_time / total_capacity, 1.0) if total_capacity > 0 else 0.0
        throughput = self._n_served / (now / 60) if now > 0 else 0.0  # per ora
        abandonment_rate = (
            self._n_abandoned / self._n_arrived if self._n_arrived > 0 else 0.0
        )
        rejection_rate = (
            self._n_rejected / self._n_arrived if self._n_arrived > 0 else 0.0
        )

        arrival_rate_actual = self._n_arrived / (now / 60) if now > 0 else 0.0 # per ora
        
        return {
            "queueLength": float(len(self._agents.queue) if self._agents else 0),
            "utilization": round(utilization, 4),
            "throughput": round(throughput, 4),
            "arrivalRate": round(arrival_rate_actual, 2),
            "avgWait": round(self._wait_mean, 4),
            "avgService": round(self._service_mean, 4),
            "nServed": float(self._n_served),
            "nAbandoned": float(self._n_abandoned),
            "nRejected": float(self._n_rejected),
            "abandonmentRate": round(abandonment_rate, 4),
            "rejectionRate": round(rejection_rate, 4),
        }

    # ------------------------------------------------------------------ #
    # Helper emit
    # ------------------------------------------------------------------ #
    time.slee
    def _emit_event(self, event_type: str, payload: dict) -> None:
        if self.pause_event:
            self.pause_event.wait()
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 4),
            "payload": payload,
            "kpis": self.get_kpis(),
        }
        self.emit(event)
