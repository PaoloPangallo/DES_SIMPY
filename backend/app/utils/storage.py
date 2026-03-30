import json
import os
from pathlib import Path
from typing import Any

# Percorso della libreria scenari
BASE_DIR = Path(__file__).resolve().parent.parent.parent
LIBRARY_PATH = BASE_DIR / "data" / "library.json"

def ensure_data_dir():
    """Assicura che la cartella data esista."""
    os.makedirs(LIBRARY_PATH.parent, exist_ok=True)
    if not os.path.exists(LIBRARY_PATH):
        with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
            json.dump([], f)

def load_library() -> list[dict[str, Any]]:
    """Carica la lista degli scenari salvati."""
    ensure_data_dir()
    try:
        with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_scenario(name: str, config: dict, type_key: str = "custom") -> bool:
    """Salva o aggiorna uno scenario nella libreria."""
    library = load_library()
    
    # Rimuovi eventuale duplicato con lo stesso nome
    library = [s for s in library if s["name"] != name]
    
    new_entry = {
        "name": name,
        "type": type_key,
        "config": config,
        "created_at": str(os.path.getmtime(LIBRARY_PATH)) if os.path.exists(LIBRARY_PATH) else "just now"
    }
    
    library.append(new_entry)
    
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(library, f, indent=2, ensure_ascii=False)
    return True

def delete_scenario(name: str) -> bool:
    """Elimina uno scenario dalla libreria."""
    library = load_library()
    new_library = [s for s in library if s["name"] != name]
    
    if len(new_library) == len(library):
        return False
        
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(new_library, f, indent=2, ensure_ascii=False)
    return True
