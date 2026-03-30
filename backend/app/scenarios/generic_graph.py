import numpy as np
import simpy
from typing import Callable, Any
from ..engine import BaseScenario
from ..models.configs import GraphConfig, GraphNode

class GenericGraphScenario(BaseScenario):
    """
    Scenario Generico basato su Grafo.
    Supporta Source, Queue, Process, Sink.
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        super().__init__(config, event_callback)
        self.pause_event = pause_event
        self.batch_size = 50
        self.batch_buffer = []
        self.last_flush_sim_time = 0.0
        self._should_stop = False
        if not config.get("nodes"):
            self.graph_cfg = GraphConfig(nodes=[], edges=[])
        else:
            self.graph_cfg = GraphConfig(**config)
            
        self.nodes_map: dict[str, GraphNode] = {n.id: n for n in self.graph_cfg.nodes}
        self.adj: dict[str, list[str]] = {}
        for edge in self.graph_cfg.edges:
            if edge.source not in self.adj: self.adj[edge.source] = []
            self.adj[edge.source].append(edge.target)
            
        # Validazione Topologica (Hardening Sprint 5)
        self._validate_graph()

        self.resources: dict[str, simpy.Resource] = {}
        self._n_arrived = 0
        self._n_finished = 0
        self._wait_times = []

    def _validate_graph(self):
        """Verifica che il grafo sia valido (no cicli infantili, sorgenti collegate)."""
        if not self.graph_cfg.nodes: return

        # 1. Controllo Cicli (Iterativo con Stack)
        visited = set()
        for node_id in self.nodes_map:
            if node_id in visited: continue
            
            stack = [(node_id, iter(self.adj.get(node_id, [])))]
            path = {node_id}
            visited.add(node_id)
            
            while stack:
                parent, children = stack[-1]
                try:
                    child = next(children)
                    if child in path:
                        raise ValueError(f"Ciclo infinito rilevato in {child}")
                    if child not in visited:
                        visited.add(child)
                        path.add(child)
                        stack.append((child, iter(self.adj.get(child, []))))
                except StopIteration:
                    path.remove(parent)
                    stack.pop()

        # 2. Controllo Sorgenti -> Sink
        sinks = [n.id for n in self.graph_cfg.nodes if n.type == 'sink']
        if not sinks and any(n.type == 'source' for n in self.graph_cfg.nodes):
            raise ValueError("Il grafo deve contenere almeno un nodo 'Sink' (Uscita)")

        for node in self.graph_cfg.nodes:
            if node.type == 'source':
                # Verifica raggiungibilità di un sink
                if not self._can_reach_sink(node.id, sinks):
                    raise ValueError(f"La sorgente {node.id} non è collegata a nessuna uscita")

    def _can_reach_sink(self, start_id: str, sinks: list[str]) -> bool:
        q = [start_id]
        seen = {start_id}
        while q:
            u = q.pop(0)
            if u in sinks: return True
            for v in self.adj.get(u, []):
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        return False

    def setup(self) -> None:
        # Inizializza risorse
        for node in self.graph_cfg.nodes:
            if node.type == 'process':
                cap = node.capacity if node.capacity else 1
                self.resources[node.id] = simpy.Resource(self.env, capacity=cap)

        # Avvia sorgenti
        for node in self.graph_cfg.nodes:
            if node.type == 'source':
                self.env.process(self._source_loop(node))
        
        # Pulse per garantire aggiornamenti costanti (Sprint 8 Hardening)
        self.env.process(self._pulse_loop())

        self._emit_event("sim_start", {"info": "Grafo generico inizializzato"})

    def _get_dist_time(self, mean: float, dist_type: str) -> float:
        if dist_type == "constant": return mean
        if dist_type == "normal": return max(0.001, np.random.normal(mean, mean*0.2))
        return np.random.exponential(mean)

    def _check_pause(self):
        """Blocca il thread se l'evento di pausa è stato resettato (set nel SimManager)."""
        if self.pause_event:
            self.pause_event.wait()

    def _pulse_loop(self):
        """Emette un evento periodico per forzare il flush e l'avanzamento visivo."""
        while not self._should_stop:
            self._check_pause()
            yield self.env.timeout(1.0)
            self._emit_event("sim_pulse", {})

    def stop(self):
        self._should_stop = True

    def _source_loop(self, node: GraphNode):
        while not self._should_stop:
            rate = node.arrival_rate if node.arrival_rate else 1.0
            iat = self._get_dist_time(1.0 / rate, node.dist)
            yield self.env.timeout(iat)
            
            self._n_arrived += 1
            entity_id = self._next_entity_id("ent")
            self._emit_event("entity_arrive", {"entityId": entity_id, "nodeId": node.id})
            
            targets = self.adj.get(node.id, [])
            if targets:
                # Eseguiamo il ciclo vitale in un processo separato ma iterativo
                self.env.process(self._entity_lifecycle_iterative(entity_id, targets[0]))
            else:
                self._n_finished += 1
                self._emit_event("entity_leave", {"entityId": entity_id})

    def _entity_lifecycle_iterative(self, entity_id, start_node_id):
        curr_id = start_node_id
        while curr_id and not self._should_stop:
            self._check_pause()
            node = self.nodes_map.get(curr_id)
            if not node: break

            entry_time = self.env.now
            if node.type == 'process':
                res = self.resources.get(node.id)
                if res:
                    with res.request() as req:
                        yield req
                        wait_time = self.env.now - entry_time
                        self._wait_times.append(wait_time)
                        self._emit_event("entity_move", {
                            "entityId": entity_id, "nodeId": node.id, "waitTime": round(wait_time, 2)
                        })
                        service_time = self._get_dist_time(node.service_time or 1.0, node.dist)
                        yield self.env.timeout(service_time)
            elif node.type == 'queue':
                self._emit_event("entity_move", {"entityId": entity_id, "nodeId": node.id})
                yield self.env.timeout(0.01)

            elif node.type == 'sink':
                self._n_finished += 1
                self._emit_event("entity_leave", {"entityId": entity_id, "nodeId": node.id})
                return

            targets = self.adj.get(node.id, [])
            if not targets:
                self._n_finished += 1
                self._emit_event("entity_leave", {"entityId": entity_id})
                break
            curr_id = np.random.choice(targets)

    def get_kpis(self) -> dict[str, Any]:
        t = max(self.env.now, 1e-9)
        avg_wait = sum(self._wait_times) / len(self._wait_times) if self._wait_times else 0.0
        
        hist_data = []
        if self._wait_times:
            max_w = max(self._wait_times) if self._wait_times else 1.0
            if max_w == 0: max_w = 0.1
            counts, bins = np.histogram(self._wait_times, bins=10, range=(0, max_w))
            for i in range(len(counts)):
                hist_data.append({
                    "bin": f"{bins[i]:.1f}-{bins[i+1]:.1f}", 
                    "count": int(counts[i])
                })

        return {
            "avgWait": round(avg_wait, 2),
            "throughput": round(self._n_finished / t, 2),
            "wip": float(self._n_arrived - self._n_finished),
            "wait_histogram": hist_data
        }

    def _emit_event(self, event_type: str, payload: dict) -> None:
        self._check_pause()
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 2),
            "payload": payload,
            "kpis": None # Calcoliamo i KPI solo durante il flush per performance
        }
        self.batch_buffer.append(event)
        
        # Flush se il buffer è pieno O è passato abbastanza tempo di simulazione (es. 1.0 min)
        now = self.env.now
        if len(self.batch_buffer) >= self.batch_size or (now - self.last_flush_sim_time) >= 1.0:
            self._flush_events()

    def _flush_events(self):
        if not self.batch_buffer: return
        
        # Calcoliamo i KPI aggiornati per l'ultimo pacchetto del batch
        kpis = self.get_kpis()
        last_event_time = self.batch_buffer[-1]["sim_time"] if self.batch_buffer else self.env.now
        
        batch_msg = {
            "type": "batch",
            "events": self.batch_buffer,
            "kpis": kpis,
            "sim_time": round(last_event_time, 2)
        }
        self.emit(batch_msg)
        self.batch_buffer = []
        self.last_flush_sim_time = self.env.now

    def finalize(self):
        # Invia gli ultimi eventi rimasti
        self._flush_events()
        super().finalize()
