import asyncio
import threading
import time
import uuid
from typing import Callable, Any

from .event_bus import EventBus


class SimInstance:
    """Rappresenta una simulazione in esecuzione."""

    def __init__(self, sim_id: str, scenario_type: str, duration: float, speed: float = 1.0):
        self.sim_id = sim_id
        self.scenario_type = scenario_type
        self.duration = duration
        self.speed = speed
        self.bus = EventBus(sim_id)
        self.status: str = "pending"  # pending, running, paused, completed, error
        self.sim_time: float = 0.0
        self.kpis: dict[str, float] = {}
        self._thread: threading.Thread | None = None
        self._pause_event = threading.Event()
        self._pause_event.set()  # non in pausa inizialmente
        self.started_at: float = time.time()
        self.events_log: list[dict] = []  # storico per export
        self.scenario: Any = None # Riferimento all'oggetto scenario per stop()


class SimManager:
    """
    Gestisce il ciclo di vita di tutte le istanze di simulazione.
    Thread-safe: le simulazioni girano in thread separati.
    """

    def __init__(self):
        self._instances: dict[str, SimInstance] = {}
        self._lock = threading.Lock()

    def create(self, scenario_type: str, duration: float = 480.0, speed: float = 1.0) -> SimInstance:
        sim_id = str(uuid.uuid4())
        instance = SimInstance(sim_id, scenario_type, duration, speed)
        with self._lock:
            self._instances[sim_id] = instance
        return instance

    def get(self, sim_id: str) -> SimInstance | None:
        with self._lock:
            return self._instances.get(sim_id)

    def list_all(self) -> list[SimInstance]:
        with self._lock:
            return list(self._instances.values())

    async def run_scenario(
        self,
        instance: SimInstance,
        scenario_factory: Callable[..., object],
        config: dict,
    ) -> None:
        """
        Avvia lo scenario SimPy in un executor thread.
        Collega l'EventBus al loop asyncio corrente.
        """
        loop = asyncio.get_event_loop()
        instance.bus.set_loop(loop)
        instance.status = "running"

        def _emit(event: dict) -> None:
            """Callback sincrono chiamato dal thread SimPy per ogni evento o batch."""
            instance.bus.put_sync(event)
            
            # Aggiorna stato locale per polling REST
            is_batch = event.get("type") == "batch"
            
            if is_batch:
                instance.sim_time = event.get("sim_time", instance.sim_time)
                instance.kpis = event.get("kpis", instance.kpis)
            else:
                instance.sim_time = event.get("sim_time", instance.sim_time)
                if "kpis" in event:
                    instance.kpis = event["kpis"]

            # Storico (massimo 10.000 record nel log)
            if len(instance.events_log) < 10_000:
                instance.events_log.append(event)

        def _run_sync() -> None:
            """Eseguito nel thread executor."""
            try:
                scenario = scenario_factory(config, _emit, instance._pause_event)
                instance.scenario = scenario
                instance.status = "running"
                
                # Procede a piccoli passi per permettere l'animazione e il controllo reattivo
                chunk_size = 0.5 
                while instance.sim_time < instance.duration and not scenario._should_stop:
                    if not instance._pause_event.is_set():
                        instance.status = "paused"
                        instance._pause_event.wait()
                        instance.status = "running"

                    next_stop = min(instance.sim_time + chunk_size, instance.duration)
                    scenario.run(until=next_stop)
                    instance.sim_time = scenario.env.now
                    
                    # Rallentiamo artificialmente in base alla velocità impostata
                    # 1.0x -> 50ms di pausa tra i "frame" di simulazione
                    # 0.1x -> 500ms di pausa
                    time.sleep(0.30 / instance.speed)

                if scenario._should_stop:
                    instance.status = "stopped"
                else:
                    instance.status = "completed"

            except Exception as exc:
                import traceback
                with open("c:/Users/paolo/DES_SIMPY/backend/error.txt", "w") as f:
                    traceback.print_exc(file=f)
                traceback.print_exc()
                instance.status = "error"
                err_event = {
                    "type": "sim_error",
                    "payload": {"error": str(exc)},
                    "sim_time": instance.sim_time,
                    "kpis": {},
                }
                instance.bus.put_sync(err_event)
                instance.events_log.append(err_event)
            finally:
                instance.bus.close()

        await asyncio.to_thread(_run_sync)

    def pause(self, sim_id: str) -> bool:
        instance = self.get(sim_id)
        if not instance: return False
        if instance.status == "running":
            instance._pause_event.clear()
            instance.status = "paused"
            return True
        elif instance.status == "paused":
            return True # Già in pausa
        return False

    def resume(self, sim_id: str) -> bool:
        instance = self.get(sim_id)
        if instance and instance.status == "paused":
            instance._pause_event.set()
            instance.status = "running"
            return True
        return False

    def stop(self, sim_id: str) -> bool:
        instance = self.get(sim_id)
        if not instance: return False
        
        # Sblocca il thread se era in pausa
        instance._pause_event.set()
        
        if instance.status in ("running", "paused", "pending"):
            if instance.scenario:
                instance.scenario.stop()
            instance.status = "stopped"
            # Non chiudiamo il bus immediatamente per permettere l'invio dell'ultimo stato
            return True
        return False

    def delete(self, sim_id: str) -> bool:
        with self._lock:
            if sim_id in self._instances:
                del self._instances[sim_id]
                return True
        return False


# Singleton globale
sim_manager = SimManager()
