from enum import Enum
from typing import Any
import time

from pydantic import BaseModel, Field


class ScenarioType(str, Enum):
    call_center = "call_center"
    manufacturing = "manufacturing"
    hospital_er = "hospital_er"
    data_center = "data_center"
    supply_chain = "supply_chain"
    network_traffic = "network_traffic"
    custom = "custom"


class RunRequest(BaseModel):
    type: ScenarioType
    config: dict[str, Any] = Field(default_factory=dict)
    duration: float = Field(default=480.0, gt=0, description="Durata simulazione in minuti")
    speed: float = Field(default=1.0, gt=0, description="Moltiplicatore velocità (1=realtime)")


class RunResponse(BaseModel):
    sim_id: str
    type: ScenarioType
    status: str = "running"


class SimulationEvent(BaseModel):
    sim_id: str
    sim_time: float
    wall_time: float = Field(default_factory=time.time)
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    kpis: dict[str, Any] = Field(default_factory=dict)


class SimulationStatus(BaseModel):
    sim_id: str
    status: str  # running, paused, completed, error
    sim_time: float
    progress: float  # 0-1
    kpis: dict[str, Any] = Field(default_factory=dict)
