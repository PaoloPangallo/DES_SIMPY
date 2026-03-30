import numpy as np
import simpy
from typing import Callable, Literal, Any
from ..engine import BaseScenario
from ..models.configs import DataCenterConfig

class DataCenterScenario(BaseScenario):
    """
    Scenario Data Center: Load Balancing e Latenza di Rete.
    Simula l'arrivo di task che vengono distribuiti su N rack di server.
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback, pause_event)
        cfg = DataCenterConfig(**config)
        self.num_racks = cfg.num_racks
        self.servers_per_rack = cfg.servers_per_rack
        self.arrival_rate = cfg.arrival_rate
        self.processing_mean = cfg.processing_time_mean
        self.processing_dist = getattr(cfg, "processing_dist", "exponential")
        self.strategy = cfg.load_balance_strategy
        self.latency = cfg.network_latency

        # KPI
        self._n_arrived = 0
        self._n_processed = 0
        self._latencies = []
        self._rr_index = 0 # per round robin
        
        # Consumo Energetico (in Watts)
        self._idle_watt = 200 * self.num_racks # Base idle per tutto il DC
        self._active_watt_per_server = 150 # Watt addizionali per server attivo
        self._total_energy_kwh = 0.0
        self._last_energy_calc = 0.0
        
        # Stato dei Rack (operativi o in guasto)
        self._rack_online = [True] * self.num_racks
        
        self.racks: list[simpy.Resource] = []

    def _get_dist_time(self, mean: float, dist_type: str) -> float:
        if dist_type == "constant":
            return mean
        if dist_type == "uniform":
            return np.random.uniform(mean * 0.5, mean * 1.5)
        # default exponential
        return np.random.exponential(mean)

    def setup(self) -> None:
        # Inizializza i rack come risorse indipendenti
        for i in range(self.num_racks):
            self.racks.append(simpy.Resource(self.env, capacity=self.servers_per_rack))
        
        self._emit_event("kpi_update", {"info": "Data Center online"})
        self.env.process(self._arrival_process())
        self.env.process(self._failure_process())
        self.env.process(self._energy_tracking())

    def _arrival_process(self):
        while not self._should_stop:
            if self.arrival_rate <= 0: break
            iat = np.random.exponential(1.0 / self.arrival_rate)
            yield self.env.timeout(iat)
            
            self._n_arrived += 1
            entity_id = self._next_entity_id("task")
            
            # Sceglie il rack in base alla strategia (solo quelli ONLINE)
            rack_idx = self._select_rack()
            
            if rack_idx == -1: # Nessun rack disponibile? (Scenario raro ma possibile)
                self._n_arrived -= 1 # non contiamo l'arrivo se viene droppato subito
                continue

            self._emit_event("entity_arrive", {
                "entityId": entity_id,
                "rack": rack_idx,
                "strategy": self.strategy
            })
            
            self.env.process(self._task_process(entity_id, rack_idx))

    def _select_rack(self) -> int:
        online_indices = [i for i, online in enumerate(self._rack_online) if online]
        if not online_indices: return -1

        if self.strategy == "random":
            return np.random.choice(online_indices)
        
        if self.strategy == "round_robin":
            for _ in range(self.num_racks):
                idx = self._rr_index
                self._rr_index = (self._rr_index + 1) % self.num_racks
                if self._rack_online[idx]: return idx
            return -1
        
        if self.strategy == "least_connections":
            return int(min(online_indices, key=lambda i: len(self.racks[i].queue) + self.racks[i].count))
        
        return online_indices[0]

    def _failure_process(self):
        while not self._should_stop:
            yield self.env.timeout(np.random.exponential(120))
            rack_idx = np.random.randint(0, self.num_racks)
            if self._rack_online[rack_idx]:
                self._rack_online[rack_idx] = False
                self._emit_event("resource_breakdown", {"rack": rack_idx, "info": "Rack Down"})
                yield self.env.timeout(np.random.uniform(5, 15))
                self._rack_online[rack_idx] = True
                self._emit_event("resource_repaired", {"rack": rack_idx, "info": "Rack Rebooted"})

    def _energy_tracking(self):
        while not self._should_stop:
            yield self.env.timeout(1.0)
            active_servers = sum(r.count for r in self.racks)
            current_power_w = self._idle_watt + (active_servers * self._active_watt_per_server)
            self._total_energy_kwh += (current_power_w / 1000.0) * (1.0 / 60.0)

    def get_kpis(self) -> dict[str, Any]:
        t = max(self.env.now, 1e-9)
        avg_lat = sum(self._latencies) / len(self._latencies) if self._latencies else 0.0
        utilization = sum(r.count for r in self.racks) / (self.num_racks * self.servers_per_rack) if self.racks else 0
        
        arrival_rate_actual = self._n_arrived / (t / 60) if t > 0 else 0.0
        
        return {
            "avgLatency": round(avg_lat, 4),
            "nProcessed": float(self._n_processed),
            "throughput": round(self._n_processed / (t/60), 2) if t > 0 else 0.0,
            "arrivalRate": round(arrival_rate_actual, 2),
            "utilization": round(utilization, 4),
            "queueLength": float(sum(len(r.queue) for r in self.racks)) if self.racks else 0,
            "energyKWh": round(self._total_energy_kwh, 3),
            "racksOnline": float(sum(self._rack_online))
        }

    def _task_process(self, entity_id: str, rack_idx: int):
        start_time = self.env.now
        rack = self.racks[rack_idx]
        
        # Latenza di rete iniziale
        if self.latency > 0:
            yield self.env.timeout(self.latency)
        
        if self._should_stop: return
            
        with rack.request() as req:
            yield req
            
            wait_time = self.env.now - start_time
            # ...
            self._emit_event("entity_move", {
                "entityId": entity_id,
                "from": "network",
                "to": f"rack_{rack_idx}",
                "waitTime": round(wait_time, 4)
            })
            
            service_time = self._get_dist_time(self.processing_mean, self.processing_dist)
            yield self.env.timeout(service_time)
            
            # Latenza di rete finale (ritorno)
            if self.latency > 0:
                yield self.env.timeout(self.latency)
            
            if self._should_stop: return

            total_latency = self.env.now - start_time
            self._latencies.append(total_latency)
            self._n_processed += 1
            
            self._emit_event("entity_leave", {
                "entityId": entity_id,
                "totalLatency": round(total_latency, 4)
            })

    def get_kpis(self) -> dict[str, Any]:
        t = max(self.env.now, 1e-9)
        avg_lat = sum(self._latencies) / len(self._latencies) if self._latencies else 0.0
        
        # Utilizzo medio dei rack
        utilization = sum(r.count for r in self.racks) / (self.num_racks * self.servers_per_rack) if self.racks else 0
        
        return {
            "avgLatency": round(avg_lat, 4),
            "nProcessed": float(self._n_processed),
            "throughput": round(self._n_processed / t, 2) if t > 0 else 0.0,
            "utilization": round(utilization, 4),
            "queueLength": float(sum(len(r.queue) for r in self.racks)) if self.racks else 0
        }

    def _emit_event(self, event_type: str, payload: dict) -> None:
        if self._should_stop: return
        if self.pause_event:
            self.pause_event.wait()
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 4),
            "payload": payload,
            "kpis": self.get_kpis(),
        }
        self.emit(event)
