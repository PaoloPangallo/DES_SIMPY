from typing import Callable

import numpy as np
import simpy

from ..engine.base_scenario import BaseScenario
from ..models.configs import SupplyChainConfig


class SupplyChainScenario(BaseScenario):
    """
    Supply chain semplificata: fornitori → magazzino → domanda clienti.

    Il magazzino riordina quando le scorte scendono sotto `reorder_point`.
    Il lead time dei fornitori è stocastico (normale).
    """

    def __init__(self, config: dict, event_callback: Callable[[dict], None]):
        super().__init__(config, event_callback)
        cfg = SupplyChainConfig(**config)
        self.num_suppliers = cfg.num_suppliers
        self.num_warehouses = cfg.num_warehouses
        self.demand_rate = cfg.demand_rate
        self.lead_time_mean = cfg.lead_time_mean
        self.lead_time_std = cfg.lead_time_std
        self.reorder_point = cfg.reorder_point
        self.order_quantity = cfg.order_quantity
        self.initial_stock = cfg.initial_stock

        self._stock: list[int] = [self.initial_stock] * self.num_warehouses
        self._n_fulfilled = 0
        self._n_stockout = 0
        self._n_orders = 0
        self._fill_rate_mean = 0.0

    def setup(self) -> None:
        self._emit_event("kpi_update", {"info": "Simulazione avviata"})
        for i in range(self.num_warehouses):
            self.env.process(self._demand_process(i))
            self.env.process(self._inventory_check(i))

    def _demand_process(self, warehouse_idx: int):
        while True:
            iat = np.random.exponential(1.0 / self.demand_rate)
            yield self.env.timeout(iat)
            entity_id = self._next_entity_id("order")
            if self._stock[warehouse_idx] > 0:
                self._stock[warehouse_idx] -= 1
                self._n_fulfilled += 1
                self._emit_event("entity_leave", {
                    "entityId": entity_id,
                    "warehouseIdx": warehouse_idx,
                    "stockLevel": self._stock[warehouse_idx],
                    "fulfilled": True,
                })
            else:
                self._n_stockout += 1
                self._emit_event("entity_leave", {
                    "entityId": entity_id,
                    "warehouseIdx": warehouse_idx,
                    "stockLevel": 0,
                    "fulfilled": False,
                    "stockout": True,
                })

    def _inventory_check(self, warehouse_idx: int):
        """Controlla le scorte ogni minuto e riordina se necessario."""
        while True:
            yield self.env.timeout(1.0)
            if self._stock[warehouse_idx] <= self.reorder_point:
                supplier_idx = np.random.randint(0, self.num_suppliers)
                self._n_orders += 1
                self._emit_event("entity_arrive", {
                    "entityId": self._next_entity_id("replenishment"),
                    "warehouseIdx": warehouse_idx,
                    "supplierIdx": supplier_idx,
                    "quantity": self.order_quantity,
                })
                self.env.process(self._replenishment_process(warehouse_idx, supplier_idx))

    def _replenishment_process(self, warehouse_idx: int, supplier_idx: int):
        lead_time = max(1.0, np.random.normal(self.lead_time_mean, self.lead_time_std))
        yield self.env.timeout(lead_time)
        self._stock[warehouse_idx] = min(
            self._stock[warehouse_idx] + self.order_quantity,
            self.initial_stock * 3,
        )
        self._emit_event("entity_move", {
            "from": f"supplier_{supplier_idx}",
            "to": f"warehouse_{warehouse_idx}",
            "quantity": self.order_quantity,
            "leadTime": round(lead_time, 4),
            "newStockLevel": self._stock[warehouse_idx],
        })

    def get_kpis(self) -> dict[str, float]:
        total = self._n_fulfilled + self._n_stockout
        fill_rate = self._n_fulfilled / total if total > 0 else 1.0
        avg_stock = float(np.mean(self._stock))
        return {
            "fillRate": round(fill_rate, 4),
            "nFulfilled": float(self._n_fulfilled),
            "nStockout": float(self._n_stockout),
            "nOrders": float(self._n_orders),
            "avgStockLevel": round(avg_stock, 2),
            "stockLevelW0": float(self._stock[0]),
        }

    def _emit_event(self, event_type: str, payload: dict) -> None:
        event = {
            "type": event_type,
            "sim_time": round(self.env.now, 4),
            "payload": payload,
            "kpis": self.get_kpis(),
        }
        self.emit(event)
