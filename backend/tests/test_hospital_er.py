from app.scenarios.hospital_er import HospitalERScenario

def test_hospital_er_priority(mock_emitter):
    """Verifica che i codici rossi scavalchino i verdi."""
    config = {
        "num_doctors": 1,
        "num_nurses": 1,
        "arrival_rate_red": 0.0,    # Arriverà manualmente
        "arrival_rate_yellow": 0.0,
        "arrival_rate_green": 0.0,
        "service_time_mean": 10.0,
        "service_dist": "constant"
    }
    
    scenario = HospitalERScenario(config, mock_emitter.emit)
    
    # Inseriamo un Verde al tempo 0
    scenario.env.process(scenario._patient_process("patient_green_1", "green", 2))
    # Il Verde occuperà le risorse fino al tempo 10
    
    # Inseriamo un altro Verde al tempo 1
    scenario.env.process(scenario._patient_process("patient_green_2", "green", 2))
    
    # Inseriamo un Rosso al tempo 2
    scenario.env.process(scenario._patient_process("patient_red_1", "red", 0))
    
    # Eseguiamo
    scenario.run(until=30)
    
    # Eventi:
    # t=0: green_1 inizia
    # t=2: red_1 arriva e va in coda
    # t=10: green_1 finisce. red_1 deve passare avanti a green_2
    
    moves = [e for e in mock_emitter.events if e["type"] == "entity_move"]
    # Secondo move (t=10) deve essere il Rosso
    assert moves[1]["payload"]["entityId"] == "patient_red_1"
    assert moves[2]["payload"]["entityId"] == "patient_green_2"

def test_hospital_er_multi_resource(mock_emitter):
    """Verifica che servano sia medico che infermiere."""
    config = {
        "num_doctors": 1,
        "num_nurses": 1, 
        "arrival_rate_red": 0.0,
        "arrival_rate_yellow": 0.0,
        "arrival_rate_green": 0.0,
        "service_time_mean": 10.0,
        "service_dist": "constant"
    }
    
    scenario = HospitalERScenario(config, mock_emitter.emit)
    
    # Processo per bloccare l'infermiere al tempo 0
    def block_nurse(env, nurses):
        with nurses.request(priority=-1) as req: # Priorità massima
            yield req
            yield env.timeout(100)
    
    # Dobbiamo assicurarci che setup() venga chiamato prima di accedere a scenario.nurses
    # In BaseScenario.run(), setup() viene chiamato.
    # Possiamo sovrascrivere run o semplicemente chiamare setup() noi se necessario, 
    # ma run() lo fa.
    
    # Problema: non possiamo aggiungere processi prima di run() se dipendono da setup().
    # Chiamiamo setup() manualmente per il test.
    scenario.setup()
    scenario.env.process(block_nurse(scenario.env, scenario.nurses))
    scenario.env.process(scenario._patient_process("patient_1", "red", 0))
    
    # Eseguiamo (run non chiamerà setup() di nuovo se già fatto? 
    # In base_scenario.py, run chiama setup(). Devo controllare se distrugge tutto).
    scenario.env.run(until=50) 
    
    moves = [e for e in mock_emitter.events if e["type"] == "entity_move"]
    # Nessun move deve essere accaduto perché l'infermiere è bloccato
    assert len(moves) == 0
