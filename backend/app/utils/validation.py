import math

def erlang_c(c: int, rho: float) -> float:
    """
    Calcola la probabilità di attesa Erlang-C.
    c: numero di server
    rho: intensità di traffico (lambda / (c * mu))
    """
    if rho >= 1.0:
        return 1.0
    
    a = c * rho
    term_c = (a**c / math.factorial(c)) * (1 / (1 - rho))
    
    sum_terms = 0
    for k in range(c):
        sum_terms += (a**k / math.factorial(k))
        
    return term_c / (sum_terms + term_c)

def expected_wait_time(c: int, mu: float, rho: float) -> float:
    """Calcola il tempo medio di attesa in coda (Wq)."""
    if rho >= 1.0:
        return float('inf')
    pc = erlang_c(c, rho)
    return pc / (c * mu * (1 - rho))

def erlang_b(c: int, a: float) -> float:
    """
    Calcola la probabilità di blocco Erlang-B (per code M/M/c/c).
    a: offerto (lambda / mu)
    """
    inv_b = 1.0
    for i in range(1, c + 1):
        inv_b = 1.0 + (i / a) * inv_b
    return 1.0 / inv_b
