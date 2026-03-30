import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from ..engine.sim_manager import sim_manager

router = APIRouter(tags=["simulation"])


@router.websocket("/ws/{sim_id}")
async def websocket_endpoint(websocket: WebSocket, sim_id: str):
    """
    Stream WebSocket degli eventi di simulazione.
    Invia ogni evento come JSON text frame.
    Gestisce back-pressure: se il client è lento, gli eventi vengono bufferizzati
    nell'EventBus (max 500) e quelli in eccesso vengono scartati.
    """
    await websocket.accept()
    instance = sim_manager.get(sim_id)
    if not instance:
        await websocket.close(code=4004, reason="sim_id not found")
        return
    try:
        async for event in instance.bus.subscribe():
            await websocket.send_text(json.dumps(event))
        # Invia evento finale di completamento
        await websocket.send_text(json.dumps({
            "sim_id": sim_id,
            "type": "sim_end",
            "sim_time": instance.sim_time,
            "payload": {"status": instance.status},
            "kpis": instance.kpis,
        }))
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.post("/sim/{sim_id}/pause", summary="Metti in pausa la simulazione")
async def pause_simulation(sim_id: str) -> dict:
    if not sim_manager.pause(sim_id):
        raise HTTPException(status_code=400, detail="Impossibile mettere in pausa")
    return {"sim_id": sim_id, "status": "paused"}


@router.post("/sim/{sim_id}/resume", summary="Riprendi la simulazione")
async def resume_simulation(sim_id: str) -> dict:
    if not sim_manager.resume(sim_id):
        raise HTTPException(status_code=400, detail="Impossibile riprendere")
    return {"sim_id": sim_id, "status": "running"}


@router.post("/sim/{sim_id}/stop", summary="Ferma la simulazione")
async def stop_simulation(sim_id: str) -> dict:
    if not sim_manager.stop(sim_id):
        raise HTTPException(status_code=400, detail="Simulazione non attiva")
    return {"sim_id": sim_id, "status": "stopped"}


@router.delete("/sim/{sim_id}", summary="Elimina istanza simulazione")
async def delete_simulation(sim_id: str) -> dict:
    if not sim_manager.delete(sim_id):
        raise HTTPException(status_code=404, detail="Simulazione non trovata")
    return {"sim_id": sim_id, "deleted": True}
