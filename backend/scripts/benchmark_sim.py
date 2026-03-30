import sys
import os
import time
import json
import tracemalloc

# Aggiungi la root del backend al path per importare 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.scenarios.generic_graph import GenericGraphScenario

def generate_large_linear_graph(n_nodes=1000):
    """Genera un grafo lineare Sorgente -> Coda1 -> Processo 1 -> ... -> Sink"""
    nodes = [
        {"id": "source", "type": "source", "data": {"rate": 100.0}}
    ]
    edges = []
    
    last_id = "source"
    for i in range(1, n_nodes + 1):
        curr_id = f"node_{i}"
        # Alterna Coda e Processo per massimizzare il numero di eventi
        node_type = "queue" if i % 2 == 0 else "process"
        nodes.append({
            "id": curr_id,
            "type": node_type,
            "data": {"capacity": 10, "serviceTime": 0.01} if node_type == "process" else {"capacity": 100}
        })
        edges.append({
            "id": f"e_{i}",
            "source": last_id,
            "target": curr_id
        })
        last_id = curr_id
        
    nodes.append({"id": "sink", "type": "sink", "data": {}})
    edges.append({"id": "e_final", "source": last_id, "target": "sink"})
    
    return nodes, edges

def benchmark_run(n_nodes=1000, sim_time=50):
    print(f"--- Benchmarking with {n_nodes} nodes ---")
    nodes, edges = generate_large_linear_graph(n_nodes)
    
    config = {
        "nodes": nodes,
        "edges": edges
    }
    
    event_count = 0
    def mock_callback(event):
        nonlocal event_count
        event_count += 1

    tracemalloc.start()
    start_time = time.time()
    
    try:
        scenario = GenericGraphScenario(config, mock_callback)
        scenario.run(until=sim_time)
    except Exception as e:
        print(f"Error during simulation: {e}")
        return
        
    end_time = time.time()
    curr, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    elapsed = end_time - start_time
    print(f"Elapsed Time: {elapsed:.4f}s")
    print(f"Total Events: {event_count}")
    print(f"Events per second: {event_count/elapsed:.2f}")
    print(f"Peak Memory: {peak / 10**6:.2f} MB")
    print("---------------------------------------")

if __name__ == "__main__":
    benchmark_run(n_nodes=100, sim_time=20)   # Piccolo test rapido
    benchmark_run(n_nodes=500, sim_time=20)   # Test medio
    benchmark_run(n_nodes=1000, sim_time=20)  # Test pesante
