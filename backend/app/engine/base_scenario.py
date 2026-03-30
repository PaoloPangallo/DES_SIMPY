from abc import ABC, abstractmethod
from typing import Callable, Any
import simpy


class BaseScenario(ABC):
    """Classe base astratta per tutti gli scenari DES."""

    def __init__(self, config: dict, event_callback: Callable[[dict], None], pause_event=None):
        self.config = config
        self.emit = event_callback
        self.pause_event = pause_event
        self.env = simpy.Environment()
        self._entity_counter = 0
        self._should_stop = False

    def stop(self) -> None:
        """Segnala alla simulazione di fermarsi il prima possibile."""
        self._should_stop = True
        if self.pause_event:
            self.pause_event.set() # Sblocca se in pausa per permettere l'uscita

    def _next_entity_id(self, prefix: str = "entity") -> str:
        self._entity_counter += 1
        return f"{prefix}_{self._entity_counter}"

    @abstractmethod
    def setup(self) -> None:
        """Inizializza risorse, code, processi SimPy."""

    @abstractmethod
    def get_kpis(self) -> dict[str, Any]:
        """Ritorna dizionario KPI correnti (valori sempre float, range logico)."""

    def run(self, until: float) -> None:
        """Esegue la simulazione fino a `until` unità di tempo."""
        self.setup()
        self.env.run(until=until)
