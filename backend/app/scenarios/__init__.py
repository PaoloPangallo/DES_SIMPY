from .call_center import CallCenterScenario
from .manufacturing import ManufacturingScenario
from .hospital_er import HospitalERScenario
from .data_center import DataCenterScenario
from .supply_chain import SupplyChainScenario
from .network_traffic import NetworkTrafficScenario
from .generic_graph import GenericGraphScenario
from .custom import CustomScenario
from ..models.configs import (
    CallCenterConfig,
    ManufacturingConfig,
    HospitalERConfig,
    DataCenterConfig,
    SupplyChainConfig,
    NetworkTrafficConfig,
    GraphConfig,
    GraphNode,
    CustomConfig,
)

# Registry: name → (ScenarioClass, ConfigModel, display metadata)
SCENARIO_REGISTRY: dict[str, dict] = {
    "call_center": {
        "cls": CallCenterScenario,
        "config_model": CallCenterConfig,
        "label": "Call Center",
        "description": "Coda M/M/c con pazienza cliente. Modella un call center con N agenti.",
        "icon": "PhoneOutlined",
    },
    "manufacturing": {
        "cls": ManufacturingScenario,
        "config_model": ManufacturingConfig,
        "label": "Linea di Produzione",
        "description": "Linea manifatturiera con N macchine parallele, guasti e riparazioni.",
        "icon": "ToolOutlined",
    },
    "hospital_er": {
        "cls": HospitalERScenario,
        "config_model": HospitalERConfig,
        "label": "Pronto Soccorso",
        "description": "Modello di un pronto soccorso con pazienti che arrivano e vengono trattati.",
        "icon": "MedicineBoxOutlined",
    },
    "data_center": {
        "cls": DataCenterScenario,
        "config_model": DataCenterConfig,
        "label": "Cloud Data Center",
        "description": "Load balancing tra rack di server con latenza di rete e diverse strategie di scheduling.",
        "icon": "DatabaseOutlined",
    },
    "supply_chain": {
        "cls": SupplyChainScenario,
        "config_model": SupplyChainConfig,
        "label": "Supply Chain",
        "description": "Rete di fornitori e magazzini con riordino automatico delle scorte.",
        "icon": "ShoppingCartOutlined",
    },
    "network_traffic": {
        "cls": NetworkTrafficScenario,
        "config_model": NetworkTrafficConfig,
        "label": "Traffico di Rete",
        "description": "Pacchetti instradati su grafo di rete con guasti sui link.",
        "icon": "ClusterOutlined",
    },
    "custom": {
        "cls": GenericGraphScenario,
        "config_model": GraphConfig,
        "label": "Scenario Personalizzato",
        "description": "Costruisci il tuo modello trascinando componenti nell'editor.",
        "icon": "BuildOutlined",
    },
}

__all__ = ["SCENARIO_REGISTRY"]
