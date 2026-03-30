from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import scenarios, simulation, results

app = FastAPI(
    title="DES Arena",
    description="General-purpose Discrete Event Simulator — Backend API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scenarios.router)
app.include_router(simulation.router)
app.include_router(results.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "des-arena"}
