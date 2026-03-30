from typing import Callable

import numpy as np
import simpy

from ..engine.base_scenario import BaseScenario
from ..models import CustomConfig


class CustomScenario(BaseScenario):
    """Scenario generico M/M/c configurabile via JSON."""

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback, pause_event)
        cfg = CustomConfig(**config)
        self.num_resources = cfg.num_resources
        self.arrival_rate = cfg.arrival_rate
        self.service_rate = cfg.service_rate

        self._n_served = 0
        self._wait_mean = 0.0
        self._busy_time = 0.0
        self._resources: simpy.Resource | None = None

    def setup(self) -> None:
        self._resources = simpy.Resource(self.env, capacity=self.num_resources)
        self._emit_event("kpi_update", {"info": "Simulation started"})
        self.env.process(self._arrival_process())

    def _arrival_process(self):
        while True:
            iat = np.random.exponential(1.0 / self.arrival_rate)
            yield self.env.timeout(iat)
            entity_id = self._next_entity_id("entity")
            self.env.process(self._entity_process(entity_id))
            self._emit_event("entity_arrive", {
                "entityId": entity_id,
                "queueLength": len(self._resources.queue),
            })

    def _entity_process(self, entity_id: str):
        arrive_time = self.env.now
        with self._resources.request() as req:
            yield req
            wait = self.env.now - arrive_time
            n = self._n_served + 1
            delta = wait - self._wait_mean
            self._wait_mean += delta / n
            service_time = np.random.exponential(1.0 / self.service_rate)
            yield self.env.timeout(service_time)
            self._busy_time += service_time
            self._n_served += 1
            self._emit_event("entity_leave", {
                "entityId": entity_id,
                "waitTime": round(wait, 4),
                "serviceTime": round(service_time, 4),
            })

    def get_kpis(self) -> dict[str, float]:
        t = max(self.env.now, 1e-9)
        utilization = min(self._busy_time / (self.num_resources * t), 1.0)
        return {
            "utilization": round(utilization, 4),
            "avgWait": round(self._wait_mean, 4),
            "nServed": float(self._n_served),
            "queueLength": float(len(self._resources.queue) if self._resources else 0),
            "throughput": round(self._n_served / (t / 60), 4),
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
