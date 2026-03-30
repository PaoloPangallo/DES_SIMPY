import asyncio
import time
from typing import AsyncIterator


class EventBus:
    """
    Bridge tra SimPy (sincrono) e FastAPI (asincrono).

    Il thread SimPy chiama `put_sync()` per pubblicare eventi.
    Il task asyncio legge da `subscribe()` e li inoltra al WebSocket.

    Gestisce back-pressure: se la coda supera `max_size`, i messaggi
    in eccesso vengono scartati (sampling) per non bloccare SimPy.
    """

    def __init__(self, sim_id: str, max_size: int = 500):
        self.sim_id = sim_id
        self._queue: asyncio.Queue[dict | None] = asyncio.Queue(maxsize=max_size)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._dropped = 0

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Deve essere chiamato dal thread asyncio prima dell'avvio SimPy."""
        self._loop = loop

    def put_sync(self, event: dict) -> None:
        """
        Chiamato dal thread sincrono SimPy.
        Non blocca mai: se la coda è piena, scarta l'evento.
        """
        if self._loop is None:
            return
        event.setdefault("sim_id", self.sim_id)
        event.setdefault("wall_time", time.time())
        try:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, event)
        except asyncio.QueueFull:
            self._dropped += 1

    def close(self) -> None:
        """Segnala la fine dello stream."""
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, None)

    async def subscribe(self) -> AsyncIterator[dict]:
        """Genera eventi asincroni fino alla chiusura del bus."""
        while True:
            item = await self._queue.get()
            if item is None:
                break
            yield item
