import csv
import io
import json
import pyarrow as pa
import pyarrow.parquet as pq
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, Response

from ..engine.sim_manager import sim_manager

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/{sim_id}", summary="Risultati completi simulazione")
async def get_results(sim_id: str) -> JSONResponse:
    instance = sim_manager.get(sim_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Simulazione non trovata")
    return JSONResponse({
        "sim_id": sim_id,
        "status": instance.status,
        "sim_time": instance.sim_time,
        "duration": instance.duration,
        "kpis": instance.kpis,
        "events_count": len(instance.events_log),
    })


@router.get("/{sim_id}/events", summary="Log eventi (JSON)")
async def get_events_json(sim_id: str, limit: int = 1000, offset: int = 0) -> JSONResponse:
    instance = sim_manager.get(sim_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Simulazione non trovata")
    events = instance.events_log[offset: offset + limit]
    return JSONResponse({"events": events, "total": len(instance.events_log)})


@router.get("/{sim_id}/export/csv", summary="Esporta eventi in CSV")
async def export_csv(sim_id: str) -> StreamingResponse:
    instance = sim_manager.get(sim_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Simulazione non trovata")

    output = io.StringIO()
    if not instance.events_log:
        output.write("sim_time,type,payload\n")
    else:
        # Ricava tutti i campi KPI dal primo evento con kpis
        kpi_keys: list[str] = []
        for ev in instance.events_log:
            if ev.get("kpis"):
                kpi_keys = list(ev["kpis"].keys())
                break

        fieldnames = ["sim_time", "type"] + kpi_keys
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for ev in instance.events_log:
            row = {"sim_time": ev.get("sim_time", ""), "type": ev.get("type", "")}
            row.update(ev.get("kpis", {}))
            writer.writerow(row)

    output.seek(0)
    safe_id = "".join(c for c in sim_id[:8] if c.isalnum() or c in "-_")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=sim_{safe_id}.csv"},
    )


@router.get("/{sim_id}/export/parquet", summary="Esporta eventi in Parquet")
async def export_parquet(sim_id: str) -> Response:
    instance = sim_manager.get(sim_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Simulazione non trovata")

    events = instance.events_log
    if not events:
        raise HTTPException(status_code=404, detail="Nessun evento registrato")

    rows = []
    for ev in events:
        row = {
            "sim_time": ev.get("sim_time"),
            "type": ev.get("type"),
        }
        row.update({f"kpi_{k}": v for k, v in (ev.get("kpis") or {}).items()})
        row.update({f"payload_{k}": json.dumps(v, default=str) for k, v in (ev.get("payload") or {}).items()})
        rows.append(row)

    df = pd.DataFrame(rows)
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].astype(str)
    df["sim_time"] = pd.to_numeric(df["sim_time"], errors="coerce")

    buf = io.BytesIO()
    table = pa.Table.from_pandas(df, preserve_index=False)
    pq.write_table(table, buf)
    buf.seek(0)

    safe_id = "".join(c for c in sim_id[:8] if c.isalnum() or c in "-_")
    return Response(
        content=buf.read(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=sim_{safe_id}.parquet"},
    )
