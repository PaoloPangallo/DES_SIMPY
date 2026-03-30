from app.scenarios.call_center import CallCenterScenario

def test_call_center_arrival_rate(mock_emitter):
    """Verifica che il numero di arrivi sia coerente con il tasso impostato."""
    duration = 1000  # un tempo lungo per ridurre la varianza
    arrival_rate = 2.0
    config = {
        "num_agents": 1,
        "arrival_rate": arrival_rate,
        "arrival_dist": "constant", # Usiamo costante per test deterministico
        "service_rate": 10.0,
        "service_dist": "constant",
        "use_max_queue": False,
        "patience": 100.0
    }
    
    scenario = CallCenterScenario(config, mock_emitter.emit)
    scenario.run(until=duration + 0.0001) # Un piccolo extra per catturare l'evento al limite
    
    # In 1000 minuti con tasso 2.0, dovremmo avere 2000 arrivi
    arrivals = [e for e in mock_emitter.events if e["type"] == "entity_arrive"]
    assert len(arrivals) == int(duration * arrival_rate)

def test_call_center_buffer_rejection(mock_emitter):
    """Verifica che il limite della coda rifiuti correttamente gli ingressi."""
    config = {
        "num_agents": 1,
        "arrival_rate": 10.0, # Molto alto per riempire subito
        "arrival_dist": "constant",
        "service_rate": 0.1,  # Molto lento
        "service_dist": "constant",
        "use_max_queue": True,
        "max_queue": 2, # Solo 2 posti in coda
        "patience": 100.0
    }
    
    scenario = CallCenterScenario(config, mock_emitter.emit)
    scenario.run(until=10) # 10 minuti
    
    kpis = scenario.get_kpis()
    assert kpis["nRejected"] > 0
    assert kpis["rejectionRate"] > 0

def test_call_center_patience_reneging(mock_emitter):
    """Verifica che i clienti abbandonino se la pazienza finisce."""
    config = {
        "num_agents": 1,
        "arrival_rate": 5.0,
        "arrival_dist": "constant",
        "service_rate": 0.5,
        "service_dist": "constant",
        "use_max_queue": False,
        "patience": 2.0 # Solo 2 minuti di pazienza
    }
    
    scenario = CallCenterScenario(config, mock_emitter.emit)
    scenario.run(until=50)
    
    kpis = scenario.get_kpis()
    assert kpis["abandonmentRate"] > 0
    assert kpis["nAbandoned"] > 0
