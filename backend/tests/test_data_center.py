from app.scenarios.data_center import DataCenterScenario

def test_data_center_least_connections(mock_emitter):
    """Verifica la strategia Least Connections."""
    config = {
        "num_racks": 2,
        "servers_per_rack": 1,
        "arrival_rate": 0.0,
        "processing_time_mean": 10.0,
        "processing_dist": "constant",
        "load_balance_strategy": "least_connections",
        "network_latency": 0.0
    }
    
    scenario = DataCenterScenario(config, mock_emitter.emit)
    scenario.setup()
    
    # Task 0 occupa Rack 0 al tempo 0
    scenario.env.process(scenario._task_process("task_0", 0))
    
    # Al tempo 0.1, arrivo di task_1. Deve scegliere Rack 1
    def arrive_task_1():
        yield scenario.env.timeout(0.1)
        # Al tempo 0.1, Rack 0 ha count=1, Rack 1 ha count=0
        rack_idx = scenario._select_rack()
        assert rack_idx == 1
        scenario.env.process(scenario._task_process("task_1", rack_idx))
        
    scenario.env.process(arrive_task_1())
    scenario.env.run(until=5)
    
    moves = [e for e in mock_emitter.events if e["type"] == "entity_move"]
    # task_1 deve essere andato al rack_1
    task_1_move = next((m for m in moves if m["payload"]["entityId"] == "task_1"), None)
    assert task_1_move is not None
    assert task_1_move["payload"]["to"] == "rack_1"

def test_data_center_latency(mock_emitter):
    """Verifica l'impatto della latenza di rete con distribuzione costante."""
    config = {
        "num_racks": 1,
        "servers_per_rack": 1,
        "arrival_rate": 0.0,
        "processing_time_mean": 10.0,
        "processing_dist": "constant",
        "load_balance_strategy": "round_robin",
        "network_latency": 5.0 
    }
    
    scenario = DataCenterScenario(config, mock_emitter.emit)
    scenario.setup()
    
    scenario.env.process(scenario._task_process("task_1", 0))
    scenario.env.run(until=25)
    
    moves = [e for e in mock_emitter.events if e["type"] == "entity_move"]
    assert moves[0]["sim_time"] == 5.0
    
    leaves = [e for e in mock_emitter.events if e["type"] == "entity_leave"]
    # 5 (lat) + 10 (proc) + 5 (lat back) = 20
    assert leaves[0]["sim_time"] == 20.0
