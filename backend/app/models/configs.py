from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


class CallCenterConfig(BaseModel):
    """Configurazione scenario Call Center (coda M/M/c o M/D/c)."""
    num_agents: int = Field(default=5, ge=1, le=100, title="Numero Operatori", description="Numero di operatori disponibili contemporaneamente")
    arrival_rate: float = Field(default=2.0, gt=0, title="Tasso di Arrivo (λ)", description="Media arrivi al minuto")
    arrival_dist: Literal["exponential", "constant", "uniform"] = Field(
        default="exponential", title="Distribuzione Arrivi", description="Modello stocastico degli arrivi"
    )
    service_rate: float = Field(default=0.5, gt=0, title="Tasso di Servizio (μ)", description="Media servizi al minuto per operatore")
    service_dist: Literal["exponential", "constant", "uniform"] = Field(
        default="exponential", title="Distribuzione Servizio", description="Modello stocastico del servizio"
    )
    use_max_queue: bool = Field(default=False, title="Abilita Limite Coda", description="Se attivo, i clienti vengono rifiutati se la coda è piena")
    max_queue: int = Field(default=50, ge=1, title="Capacità Massima Coda", description="Massimo numero di persone in attesa")
    patience: float = Field(default=10.0, gt=0, title="Pazienza Cliente", description="Tempo massimo di attesa prima dell'abbandono")


class ManufacturingConfig(BaseModel):
    """Configurazione scenario linea di produzione."""
    num_machines: int = Field(default=3, ge=1, le=20, title="Numero Macchinari", description="Numero di stazioni di lavoro in parallelo")
    arrival_rate: float = Field(default=1.0, gt=0, title="Pezzi in Ingresso", description="Frequenza di arrivo pezzi al minuto")
    arrival_dist: Literal["exponential", "constant", "uniform"] = Field(
        default="exponential", title="Distribuzione Arrivi", description="Modello degli arrivi"
    )
    processing_time_mean: float = Field(default=2.5, gt=0, title="Tempo Ciclo Medio", description="Tempo di lavorazione nominale (min)")
    processing_dist: Literal["exponential", "constant", "uniform", "normal"] = Field(
        default="normal", title="Distribuzione Lavorazione", description="Modello del tempo di ciclo"
    )
    processing_time_std: float = Field(default=0.5, ge=0, title="Deviazione Standard", description="Variabilità della lavorazione (solo per Normale)")
    breakdown_rate: float = Field(default=0.01, ge=0, title="Tasso di Guasto", description="Frequenza guasti per macchina (guasti/min)")
    repair_time_mean: float = Field(default=15.0, gt=0, title="Tempo Riparazione", description="Tempo medio per il ripristino (min)")
    use_buffer_limit: bool = Field(default=True, title="Abilita Limite Buffer", description="Se attivo, la produzione si ferma se il buffer è pieno")
    buffer_size: int = Field(default=20, ge=1, title="Capacità Buffer", description="Massimo numero di pezzi nel polmone")


class HospitalERConfig(BaseModel):
    title: str = "Pronto Soccorso (ER)"
    description: str = "Triage con priorità e allocazione multipla di risorse (Medici e Infermieri)."
    num_doctors: int = Field(2, title="Numero Medici", description="Risorsa principale per il trattamento.")
    num_nurses: int = Field(3, title="Numero Infermieri", description="Supportano i medici durante il trattamento.")
    arrival_rate_red: float = Field(0.05, title="Tasso Arrivi - ROSSO", description="Pazienti critici (alta priorità).")
    arrival_rate_yellow: float = Field(0.15, title="Tasso Arrivi - GIALLO", description="Pazienti urgenti (media priorità).")
    arrival_rate_green: float = Field(0.3, title="Tasso Arrivi - VERDE", description="Pazienti non urgenti (bassa priorità).")
    service_time_mean: float = Field(45.0, title="Tempo Trattamento Medi (min)", description="Tempo medio di permanenza con staff.")
    service_dist: Literal["exponential", "constant", "uniform", "normal"] = Field("exponential", title="Distribuzione Servizio")

class DataCenterConfig(BaseModel):
    title: str = "Cloud Data Center"
    description: str = "Simulazione di load balancing tra rack di server con latenza di rete."
    num_racks: int = Field(3, title="Numero Rack", description="Numero di gruppi di server (linee di elaborazione).")
    servers_per_rack: int = Field(10, title="Server per Rack", description="Capacità di calcolo per ogni rack.")
    arrival_rate: float = Field(20.0, title="Tasso Arrivo (req/sec)", description="Frequenza delle richieste in arrivo.")
    processing_time_mean: float = Field(0.5, title="Tempo Elaborazione (sec)", description="Durata media di un task.")
    processing_dist: Literal["exponential", "constant", "uniform", "normal"] = Field("exponential", title="Distribuzione Elaborazione")
    load_balance_strategy: Literal["round_robin", "least_connections", "random"] = Field("round_robin", title="Strategia Load Balance")
    network_latency: float = Field(0.01, title="Latenza Rete (sec)", description="Ritardo aggiuntivo fisso per rack.")

class SupplyChainConfig(BaseModel):
    """Configurazione scenario supply chain."""
    num_suppliers: int = Field(default=3, ge=1, le=10, title="Numero Fornitori", description="Numero di sorgenti di approvvigionamento")
    num_warehouses: int = Field(default=2, ge=1, le=10, title="Numero Magazzini", description="Punti di stoccaggio e distribuzione")
    demand_rate: float = Field(default=5.0, gt=0, title="Tasso di Domanda", description="Unità richieste dai clienti al minuto")
    lead_time_mean: float = Field(default=30.0, gt=0, title="Lead Time Medio", description="Tempo medio di consegna fornitore (min)")
    lead_time_std: float = Field(default=5.0, ge=0, title="Deviazione Lead Time", description="Variabilità della consegna (min)")
    reorder_point: int = Field(default=20, ge=0, title="Punto di Riordino (ROP)", description="Livello scorte che attiva un nuovo ordine")
    order_quantity: int = Field(default=50, ge=1, title="Quantità Ordine (EOQ)", description="Dimensione del lotto di riacquisto")
    initial_stock: int = Field(default=100, ge=0, title="Stock Iniziale", description="Scorte di partenza per magazzino")


class NetworkTrafficConfig(BaseModel):
    """Configurazione scenario traffico di rete."""
    nodes: int = Field(5, ge=2, le=20, title="Numero Nodi", description="Nodi nella topologia di rete")
    avg_latency: float = Field(20.0, gt=0, title="Latenza Media (ms)", description="Latenza media per hop (ms)")
    packet_arrival_rate: float = Field(10.0, gt=0, title="Tasso Arrivo Pacchetti", description="Pacchetti generati al minuto")
    bandwidth: float = Field(100.0, gt=0, title="Banda (Mbps)", description="Larghezza di banda per link")
    packet_size_mean: float = Field(1.5, gt=0, title="Dimensione Media Pacchetto (KB)", description="Dimensione media pacchetto in KB")
    failure_rate: float = Field(0.005, ge=0, title="Tasso Guasto Link", description="Frequenza guasti per link (guasti/min)")

class GraphNode(BaseModel):
    id: str
    type: str # 'source', 'queue', 'process', 'sink'
    name: str | None = None
    
    # Parametri specifici (opzionali a seconda del tipo)
    arrival_rate: float | None = None
    capacity: int | None = None
    service_time: float | None = None
    max_size: float | None = None # Per le code
    dist: str = "exponential" # 'exponential', 'constant', 'normal'
    
    position: dict[str, float] | None = None

    @field_validator('arrival_rate', 'service_time')
    @classmethod
    def must_be_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError('Deve essere un valore positivo (> 0)')
        return v

    @field_validator('capacity')
    @classmethod
    def capacity_must_be_positive(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError('La capacità deve essere almeno 1')
        return v

class GraphEdge(BaseModel):
    source: str
    target: str

class GraphConfig(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

class CustomConfig(BaseModel):
    """Scenario generico configurabile via JSON."""
    num_resources: int = Field(default=3, ge=1, le=50, description="Numero risorse")
    arrival_rate: float = Field(default=1.0, gt=0, description="Tasso arrivo entità (per minuto)")
    service_rate: float = Field(default=0.5, gt=0, description="Tasso servizio per risorsa (per minuto)")
    extra: dict[str, Any] = Field(default_factory=dict, description="Parametri extra")
