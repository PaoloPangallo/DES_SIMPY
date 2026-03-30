from app.scenarios.call_center import CallCenterScenario
from app.utils.validation import expected_wait_time

def test_call_center_math_validation(mock_emitter):
    """
    Valida la simulazione confrontandola con il modello Erlang-C.
    Testiamo un sistema M/M/c stabile.
    """
    c = 5
    arrival_rate = 8.0 # lambda
    service_rate = 2.0 # mu
    # rho = lambda / (c * mu) = 8 / (5 * 2) = 0.8
    rho = arrival_rate / (c * service_rate)
    
    config = {
        "num_agents": c,
        "arrival_rate": arrival_rate,
        "arrival_dist": "exponential",
        "service_rate": service_rate,
        "service_dist": "exponential",
        "use_max_queue": False,
        "patience": 1000.0 # pazienza infinita per Erlang-C standard
    }
    
    duration = 5000 # simulazione lunga per convergenza
    scenario = CallCenterScenario(config, mock_emitter.emit)
    scenario.run(until=duration)
    
    kpis = scenario.get_kpis()
    sim_wait = kpis["avgWait"]
    
    # Valore teorico
    theoretical_wait = expected_wait_time(c, service_rate, rho)
    
    print(f"Simulato: {sim_wait}, Teorico: {theoretical_wait}")
    
    # Tolleranza del 20% (la simulazione stocastica ha varianza)
    assert abs(sim_wait - theoretical_wait) / theoretical_wait < 0.20
