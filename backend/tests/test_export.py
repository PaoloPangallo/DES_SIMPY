import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import io

from main import app

client = TestClient(app)


def _make_mock_instance(events):
    inst = MagicMock()
    inst.events_log = events
    inst.scenario_type = "manufacturing"
    inst.status = "completed"
    return inst


def test_parquet_export_returns_bytes():
    events = [
        {"sim_time": 0.0, "type": "kpi_update", "payload": {}, "kpis": {"throughput": 10.0}},
        {"sim_time": 1.0, "type": "entity_arrive", "payload": {"entityId": "e1"}, "kpis": {"throughput": 11.0}},
    ]
    mock_inst = _make_mock_instance(events)

    with patch("app.routers.results.sim_manager.get", return_value=mock_inst):
        response = client.get("/results/fake-id/export/parquet")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    # Parquet magic bytes: PAR1
    assert response.content[:4] == b"PAR1"


def test_parquet_export_404_when_no_instance():
    with patch("app.routers.results.sim_manager.get", return_value=None):
        response = client.get("/results/nonexistent/export/parquet")
    assert response.status_code == 404


def test_parquet_export_404_when_empty_events():
    inst = _make_mock_instance([])  # empty events_log
    with patch("app.routers.results.sim_manager.get", return_value=inst):
        response = client.get("/results/fake-id/export/parquet")
    assert response.status_code == 404
