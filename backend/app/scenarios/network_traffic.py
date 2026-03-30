import random
from typing import Callable

import numpy as np

from ..engine.base_scenario import BaseScenario
from ..models.configs import NetworkTrafficConfig


class NetworkTrafficScenario(BaseScenario):
    """
    Traffico di rete: pacchetti instradati su una rete a grafo casuale.

    Ogni link ha una banda e un tasso di guasto.
    I pacchetti seguono il percorso più breve (hop count).
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None]):
        super().__init__(config, event_callback)
        cfg = NetworkTrafficConfig(**config)
        self.num_nodes = cfg.num_nodes
        self.packet_arrival_rate = cfg.packet_arrival_rate
        self.bandwidth = cfg.bandwidth
        self.packet_size_mean = cfg.packet_size_mean
        self.failure_rate = cfg.failure_rate

        self._n_delivered = 0
        self._n_dropped = 0
        self._latency_mean = 0.0
        self._latency_m2 = 0.0
        self._links: dict[tuple[int, int], bool] = {}  # True = attivo
        self._adjacency: dict[int, list[int]] = {}

    def setup(self) -> None:
        self._build_topology()
        self._emit_event("kpi_update", {"info": "Simulazione avviata"})
        self.env.process(self._arrival_process())
        for link in list(self._links.keys()):
            self.env.process(self._link_failure_process(link))

    def _build_topology(self) -> None:
        """Crea una rete random connessa (ring + random extra edges)."""
        n = self.num_nodes
        self._adjacency = {i: [] for i in range(n)}
        # ring base
        for i in range(n):
            j = (i + 1) % n
            self._links[(i, j)] = True
            self._links[(j, i)] = True
            if j not in self._adjacency[i]:
                self._adjacency[i].append(j)
            if i not in self._adjacency[j]:
                self._adjacency[j].append(i)
        # extra random edges
        extra = max(1, n // 2)
        for _ in range(extra):
            i, j = random.sample(range(n), 2)
            if j not in self._adjacency[i]:
                self._links[(i, j)] = True
                self._links[(j, i)] = True
                self._adjacency[i].append(j)
                self._adjacency[j].append(i)

    def _bfs_path(self, src: int, dst: int) -> list[int] | None:
        """BFS su link attivi."""
        visited = {src}
        queue = [[src]]
        while queue:
            path = queue.pop(0)
            node = path[-1]
            if node == dst:
                return path
            for neighbor in self._adjacency.get(node, []):
                if neighbor not in visited and self._links.get((node, neighbor), False):
                    visited.add(neighbor)
                    queue.append(path + [neighbor])
        return None

    def _arrival_process(self):
        while True:
            iat = np.random.exponential(1.0 / self.packet_arrival_rate)
            yield self.env.timeout(iat)
            src, dst = random.sample(range(self.num_nodes), 2)
            pkt_id = self._next_entity_id("pkt")
            self.env.process(self._packet_process(pkt_id, src, dst))

    def _packet_process(self, pkt_id: str, src: int, dst: int):
        path = self._bfs_path(src, dst)
        if path is None:
            self._n_dropped += 1
            self._emit_event("entity_leave", {
                "entityId": pkt_id,
                "dropped": True,
                "reason": "no_path",
            })
            return
        size_mb = np.random.exponential(self.packet_size_mean)
        total_latency = 0.0
        for i in range(len(path) - 1):
            hop_time = (size_mb / self.bandwidth) * 60  # minuti
            yield self.env.timeout(hop_time)
            total_latency += hop_time
        self._n_delivered += 1
        n = self._n_delivered
        delta = total_latency - self._latency_mean
        self._latency_mean += delta / n
        delta2 = total_latency - self._latency_mean
        self._latency_m2 += delta * delta2
        self._emit_event("entity_leave", {
            "entityId": pkt_id,
            "src": src,
            "dst": dst,
            "hops": len(path) - 1,
            "latency": round(total_latency, 6),
        })

    def _link_failure_process(self, link: tuple[int, int]):
        if self.failure_rate <= 0:
            return
        while True:
            ttf = np.random.exponential(1.0 / self.failure_rate)
            yield self.env.timeout(ttf)
            self._links[link] = False
            self._emit_event("resource_breakdown", {"link": list(link)})
            repair = np.random.exponential(5.0)
            yield self.env.timeout(repair)
            self._links[link] = True
            self._emit_event("resource_repaired", {"link": list(link), "repairTime": round(repair, 4)})

    def get_kpis(self) -> dict[str, float]:
        total = self._n_delivered + self._n_dropped
        delivery_rate = self._n_delivered / total if total > 0 else 1.0
        active_links = sum(1 for v in self._links.values() if v)
        total_links = len(self._links)
        return {
            "deliveryRate": round(delivery_rate, 4),
            "nDelivered": float(self._n_delivered),
            "nDropped": float(self._n_dropped),
            "avgLatency": round(self._latency_mean, 6),
            "activeLinks": float(active_links),
            "linkAvailability": round(active_links / total_links, 4) if total_links > 0 else 1.0,
        }

    def _emit_event(self, event_type: str, payload: dict) -> None:
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 4),
            "payload": payload,
            "kpis": self.get_kpis(),
        }
        self.emit(event)
