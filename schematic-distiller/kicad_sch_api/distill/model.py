from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class DistilledPin:
    number: str
    net: Optional[str]
    position: Tuple[float, float]
    name: Optional[str] = None

    def to_dict(self) -> Dict:
        # Pins are serialized without positions; only logical connectivity is needed in output.
        return {
            "number": self.number,
            "name": self.name,
            "net": self.net,
        }


@dataclass
class DistilledComponent:
    reference: str
    lib_id: str
    value: str
    position: Tuple[float, float]
    footprint: Optional[str] = None
    properties: Dict[str, str] = field(default_factory=dict)
    pins: List[DistilledPin] = field(default_factory=list)
    category: str = "other"

    def to_dict(self) -> Dict:
        return {
            "reference": self.reference,
            "lib_id": self.lib_id,
            "value": self.value,
            "position": {"x": self.position[0], "y": self.position[1]},
            "footprint": self.footprint,
            "properties": self.properties,
            "category": self.category,
            "pins": [pin.to_dict() for pin in self.pins],
        }


@dataclass
class DistilledNet:
    name: str
    pins: Dict[str, List[Dict[str, str]]] = field(default_factory=dict)

    def add_pin(self, reference: str, pin_number: str) -> None:
        self.pins.setdefault(reference, []).append({"Pin": pin_number})

    def to_dict(self) -> Dict:
        return self.pins


@dataclass
class ProximityEdge:
    ref_a: str
    ref_b: str
    distance_mm: float
    score: float
    category_a: str
    category_b: str
    weight: float

    def to_dict(self) -> Dict:
        return {
            "ref_a": self.ref_a,
            "ref_b": self.ref_b,
            "distance_mm": self.distance_mm,
            "score": self.score,
            "category_a": self.category_a,
            "category_b": self.category_b,
            "weight": self.weight,
        }


@dataclass
class DistilledSchematic:
    components: List[DistilledComponent]
    nets: Dict[str, DistilledNet]
    proximities: List[ProximityEdge]

    def to_dict(self) -> Dict:
        return {
            "components": [c.to_dict() for c in self.components],
            "nets": {name: net.to_dict() for name, net in self.nets.items()},
            "proximities": [p.to_dict() for p in self.proximities],
        }

