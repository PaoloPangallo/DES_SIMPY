import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Any

from ..engine.sim_manager import sim_manager
from ..models import RunResponse, RunRequest, SimulationStatus
from ..scenarios import SCENARIO_REGISTRY
from ..utils import storage

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

@router.get("/library", summary="Lista scenari salvati")
async def get_library():
    return storage.load_library()

@router.post("/library", summary="Salva uno scenario nella libreria")
async def save_to_library(data: dict):
    name = data.get("name")
    config = data.get("config")
    type_key = data.get("type", "custom")
    if not name or not config:
        raise HTTPException(status_code=400, detail="Nome e configurazione richiesti")
    storage.save_scenario(name, config, type_key)
    return {"status": "saved", "name": name}

@router.delete("/library/{name}", summary="Elimina uno scenario")
async def delete_from_library(name: str):
    success = storage.delete_scenario(name)
    if not success:
        raise HTTPException(status_code=404, detail="Scenario non trovato")
    return {"status": "deleted"}

@router.get("/", summary="Lista scenari disponibili")
async def list_scenarios() -> list[dict]:
    """Restituisce la lista degli scenari con schema JSON della config."""
    result = []
    for key, meta in SCENARIO_REGISTRY.items():
        config_schema = meta["config_model"].model_json_schema()
        result.append({
            "type": key,
            "label": meta["label"],
            "description": meta["description"],
            "icon": meta["icon"],
            "configSchema": config_schema,
        })
    return result

@router.post("/run", response_model=RunResponse, summary="Avvia una simulazione")
async def run_scenario(req: RunRequest, background_tasks: BackgroundTasks) -> RunResponse:
    scenario_key = req.type.value if hasattr(req.type, 'value') else req.type
    if scenario_key not in SCENARIO_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_key}' non trovato")

    meta = SCENARIO_REGISTRY[scenario_key]
    
    # Validazione Immediata (Sprint 5 Hardening)
    try:
        # Instanziamo temporaneamente solo per validare il grafo e i parametri
        # Usiamo una callback vuota e config di input
        meta["cls"](req.config, lambda x: None)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore validazione: {str(e)}")

    instance = sim_manager.create(scenario_key, duration=req.duration, speed=req.speed)

    async def _launch():
        await sim_manager.run_scenario(
            instance=instance,
            scenario_factory=meta["cls"],
            config=req.config,
        )

    background_tasks.add_task(_launch)
    return RunResponse(sim_id=instance.sim_id, type=req.type, status="running")

@router.get("/{sim_id}/status", response_model=SimulationStatus)
async def get_status(sim_id: str) -> SimulationStatus:
    instance = sim_manager.get(sim_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Simulazione non trovata")
    return SimulationStatus(
        sim_id=sim_id,
        status=instance.status,
        sim_time=instance.sim_time,
        progress=min(instance.sim_time / (instance.duration or 1), 1.0),
        kpis=instance.kpis,
    )
