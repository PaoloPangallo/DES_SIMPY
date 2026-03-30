import numpy as np
import simpy
from typing import Callable, Literal
from ..engine import BaseScenario
from ..models.configs import HospitalERConfig

class HospitalERScenario(BaseScenario):
    """
    Scenario Ospedaliero: Triage con priorità e risorse multiple.
    Pazienti: Rosso (0), Giallo (1), Verde (2).
    Risorse: Medici e Infermieri (entrambi richiesti per il servizio).
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback, pause_event)
        cfg = HospitalERConfig(**config)
        self.num_doctors = cfg.num_doctors
        self.num_nurses = cfg.num_nurses
        self.rate_red = cfg.arrival_rate_red
        self.rate_yellow = cfg.arrival_rate_yellow
        self.rate_green = cfg.arrival_rate_green
        self.service_mean = cfg.service_time_mean
        self.service_dist = cfg.service_dist

        # KPI
        self._n_arrived = {"red": 0, "yellow": 0, "green": 0}
        self._n_served = {"red": 0, "yellow": 0, "green": 0}
        self._wait_times = {"red": [], "yellow": [], "green": []}
        self._busy_doctors = 0
        self._busy_nurses = 0
        
        self.doctors: simpy.PriorityResource | None = None
        self.nurses: simpy.PriorityResource | None = None

    def _get_dist_time(self, mean: float, dist_type: str) -> float:
        if dist_type == "constant":
            return mean
        if dist_type == "uniform":
            return np.random.uniform(mean * 0.5, mean * 1.5)
        # default exponential
        return np.random.exponential(mean)

    def setup(self) -> None:
        self.doctors = simpy.PriorityResource(self.env, capacity=self.num_doctors)
        self.nurses = simpy.PriorityResource(self.env, capacity=self.num_nurses)
        
        self._emit_event("kpi_update", {"info": "Reparto ER operativo"})
        
        # Tre processi di arrivo separati
        self.env.process(self._arrival_process("red", self.rate_red, 0))
        self.env.process(self._arrival_process("yellow", self.rate_yellow, 1))
        self.env.process(self._arrival_process("green", self.rate_green, 2))

    def _arrival_process(self, triage: str, rate: float, priority: int):
        while True:
            if rate <= 0: break
            iat = np.random.exponential(1.0 / rate)
            yield self.env.timeout(iat)
            
            self._n_arrived[triage] += 1
            entity_id = self._next_entity_id(f"patient_{triage}")
            
            self._emit_event("entity_arrive", {
                "entityId": entity_id,
                "triage": triage,
                "priority": priority,
                "queueLength": len(self.doctors.queue) + len(self.nurses.queue),
            })
            
            self.env.process(self._patient_process(entity_id, triage, priority))

    def _patient_process(self, entity_id: str, triage: str, priority: int):
        arrive_time = self.env.now
        
        # Richiede entrambi: Medico e Infermiere con la stessa priorità
        # Nota: In SimPy combinare due PriorityResource richiede attenzione.
        # Qui usiamo la tecnica di richiedere entrambi in sequenza o con '&'
        with self.doctors.request(priority=priority) as dr_req, \
             self.nurses.request(priority=priority) as ns_req:
            
            yield dr_req & ns_req
            
            wait_time = self.env.now - arrive_time
            self._wait_times[triage].append(wait_time)
            
            self._emit_event("entity_move", {
                "entityId": entity_id,
                "from": "triage",
                "to": "treatment",
                "triage": triage,
                "waitTime": round(wait_time, 4),
            })
            
            service_time = self._get_dist_time(self.service_mean, self.service_dist)
            yield self.env.timeout(service_time)
            
            self._n_served[triage] += 1
            self._emit_event("entity_leave", {
                "entityId": entity_id,
                "triage": triage,
                "serviceTime": round(service_time, 4),
                "waitTime": round(wait_time, 4),
            })

    def get_kpis(self) -> dict[str, float]:
        t = max(self.env.now, 1e-9)
        
        def avg(lst): return sum(lst) / len(lst) if lst else 0.0
        
        # KPI globali e per triage
        total_arrived = sum(self._n_arrived.values())
        total_served = sum(self._n_served.values())
        
        avg_wait_red = avg(self._wait_times["red"])
        avg_wait_yellow = avg(self._wait_times["yellow"])
        avg_wait_green = avg(self._wait_times["green"])
        
        return {
            "queueLength": float(len(self.doctors.queue)),
            "nServedTotal": float(total_served),
            "nRed": float(self._n_served["red"]),
            "nYellow": float(self._n_served["yellow"]),
            "nGreen": float(self._n_served["green"]),
            "avgWaitRed": round(avg_wait_red, 4),
            "avgWaitYellow": round(avg_wait_yellow, 4),
            "avgWaitGreen": round(avg_wait_green, 4),
            "avgWaitTotal": round(avg(self._wait_times["red"] + self._wait_times["yellow"] + self._wait_times["green"]), 4),
            "throughput": round(total_served / (t / 60), 4) if t > 0 else 0.0,
        }

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
