from app.scenarios.manufacturing import ManufacturingScenario

def test_manufacturing_throughout(mock_emitter):
    """Verifica che la produttività (throughput) sia corretta."""
    config = {
        "num_machines": 2,
        "arrival_rate": 1.0,
        "arrival_dist": "constant",
        "processing_time_mean": 1.0, # Ogni pezzo richiede 1 min
        "processing_dist": "constant",
        "processing_time_std": 0.0,
        "breakdown_rate": 0.0, # Nessun guasto per ora
        "repair_time_mean": 1.0,
        "use_buffer_limit": False,
        "buffer_size": 10
    }
    
    scenario = ManufacturingScenario(config, mock_emitter.emit)
    scenario.run(until=100.0001)
    
    kpis = scenario.get_kpis()
    # In 100 minuti con arrivo costante a 1.0, dovremmo avere 100 pezzi prodotti (circa)
    # Se le macchine sono 2, possono gestire il carico facilmente.
    assert abs(kpis["nProduced"] - 100) <= 1

def test_manufacturing_buffer_full(mock_emitter):
    """Verifica che il buffer limitato causi rifiuti quando pieno."""
    config = {
        "num_machines": 1,
        "arrival_rate": 5.0, # Arrivano 5 pezzi al min
        "arrival_dist": "constant",
        "processing_time_mean": 2.0, # Una macchina ci mette 2 min
        "processing_dist": "constant",
        "processing_time_std": 0.0,
        "breakdown_rate": 0.0,
        "repair_time_mean": 1.0,
        "use_buffer_limit": True,
        "buffer_size": 5
    }
    
    scenario = ManufacturingScenario(config, mock_emitter.emit)
    scenario.run(until=10)
    
    kpis = scenario.get_kpis()
    assert kpis["nRejected"] > 0
    assert kpis["rejectionRate"] > 0
