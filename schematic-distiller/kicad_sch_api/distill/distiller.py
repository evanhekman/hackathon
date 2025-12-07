from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from ..core.config import config
from ..core.connectivity import ConnectivityAnalyzer, Net, PinConnection
from ..core.pin_utils import list_component_pins
from ..core.types import Point, SchematicSymbol
from ..library.cache import get_symbol_cache
from .model import DistilledComponent, DistilledNet, DistilledPin, DistilledSchematic, ProximityEdge


# Default multipliers that boost common intent (e.g., decoupling caps near ICs)
DEFAULT_WEIGHT_MULTIPLIERS: Dict[Tuple[str, str], float] = {
    ("capacitor", "ic"): 2.0,
    ("ic", "capacitor"): 2.0,
    ("capacitor", "other"): 1.2,
    ("other", "capacitor"): 1.2,
}


@dataclass
class DistillationConfig:
    proximity_radius_mm: float = 20.0
    weight_multipliers: Dict[Tuple[str, str], float] = None
    hierarchical: bool = True

    def __post_init__(self) -> None:
        if self.weight_multipliers is None:
            self.weight_multipliers = DEFAULT_WEIGHT_MULTIPLIERS


def distill_schematic(schematic, distill_config: Optional[DistillationConfig] = None) -> DistilledSchematic:
    """
    Distill a schematic into LLM-friendly structured data.

    - Uses ConnectivityAnalyzer for net/pin mapping.
    - Uses component anchor positions (no graphics) for location + proximity scoring.
    """
    cfg = distill_config or DistillationConfig()

    analyzer = ConnectivityAnalyzer(tolerance=config.tolerance.position_tolerance)
    nets = analyzer.analyze(schematic, hierarchical=cfg.hierarchical)

    # Gather schematics and hierarchy paths (if available)
    if cfg.hierarchical and hasattr(analyzer, "get_schematics"):
        schematic_contexts = analyzer.get_schematics()
    else:
        schematic_contexts = [(schematic, "/")]

    pin_to_net = _build_pin_net_map(nets)

    distilled_components: List[DistilledComponent] = []
    for sch, sheet_path in schematic_contexts:
        real_symbols = [comp for comp in sch.components if _is_real_symbol(comp)]
        for comp in real_symbols:
            distilled_components.append(
                _distill_component(comp, pin_to_net, sheet_path if cfg.hierarchical else None)
            )

    distilled_nets = {net.name or f"Net-{idx+1}": _distill_net(net) for idx, net in enumerate(nets)}

    # Compute proximities per sheet to avoid cross-sheet noise
    proximities: List[ProximityEdge] = []
    comps_by_sheet: Dict[str, List[DistilledComponent]] = {}
    for comp in distilled_components:
        key = comp.sheet_path or "/"
        comps_by_sheet.setdefault(key, []).append(comp)

    for comps in comps_by_sheet.values():
        proximities.extend(_compute_proximities(comps, cfg.proximity_radius_mm, cfg.weight_multipliers))

    return DistilledSchematic(components=distilled_components, nets=distilled_nets, proximities=proximities)


def _build_pin_net_map(nets: Iterable[Net]) -> Dict[Tuple[str, str], str]:
    mapping: Dict[Tuple[str, str], str] = {}

    for idx, net in enumerate(nets):
        name = net.name or f"Net-{idx+1}"
        for pin in net.pins:
            mapping[(pin.reference, pin.pin_number)] = name
    return mapping


def _distill_component(
    component: SchematicSymbol, pin_to_net: Dict[Tuple[str, str], str], sheet_path: Optional[str] = None
) -> DistilledComponent:
    pin_positions = list_component_pins(component)
    pin_name_map = {pin.number: pin.name for pin in component.pins}

    # Fallback to library pin names when the schematic symbol omits them
    symbol_cache = None
    def _resolve_pin_name(pin_number: str) -> Optional[str]:
        name = pin_name_map.get(pin_number)
        if name:
            return name
        nonlocal symbol_cache
        if symbol_cache is None:
            symbol_cache = get_symbol_cache()
        try:
            symbol_def = symbol_cache.get_symbol(component.lib_id)
            if symbol_def:
                lib_pin = symbol_def.get_pin(pin_number)
                if lib_pin and lib_pin.name:
                    return lib_pin.name
        except Exception:
            # If symbol lookup fails, leave name as None
            return None
        return None

    distilled_pins: List[DistilledPin] = []
    for pin_number, position in pin_positions:
        net = pin_to_net.get((component.reference, pin_number))
        pin_name = _resolve_pin_name(pin_number)
        distilled_pins.append(
            DistilledPin(
                number=pin_number,
                name=pin_name,
                net=net,
                position=(position.x, position.y),
            )
        )

    filtered_props = {}
    for key, value in component.properties.items():
        if key.startswith("__sexp_"):
            continue
        # property parser keeps metadata; only retain value field
        if isinstance(value, dict):
            prop_value = value.get("value")
        else:
            prop_value = value
        if prop_value is None:
            continue
        filtered_props[key] = prop_value

    return DistilledComponent(
        reference=component.reference,
        lib_id=component.lib_id,
        value=component.value,
        footprint=component.footprint,
        properties=filtered_props,
        pins=distilled_pins,
        position=(component.position.x, component.position.y),
        category=_classify_component(component),
        sheet_path=sheet_path,
    )


def _distill_net(net: Net) -> DistilledNet:
    distilled = DistilledNet(name=net.name or "unnamed")
    for pin in net.pins:
        distilled.add_pin(pin.reference, pin.pin_number)
    return distilled


def _classify_component(component: SchematicSymbol) -> str:
    ref = component.reference.upper()
    lib = component.lib_id.lower()

    if ref.startswith("C") or "cap" in lib:
        return "capacitor"
    if ref.startswith("U") or "mcu" in lib or "ic" in lib:
        return "ic"
    if ref.startswith("R") or "res" in lib:
        return "resistor"
    if ref.startswith("L") or "ind" in lib:
        return "inductor"
    if ref.startswith("Q") or "transistor" in lib:
        return "transistor"
    return "other"


def _compute_proximities(
    components: List[DistilledComponent],
    radius_mm: float,
    weight_multipliers: Dict[Tuple[str, str], float],
) -> List[ProximityEdge]:
    proximities: List[ProximityEdge] = []
    for i, comp_a in enumerate(components):
        for comp_b in components[i + 1 :]:
            if not (_is_real_component(comp_a) and _is_real_component(comp_b)):
                continue
            dist = _distance(comp_a.position, comp_b.position)
            effective_radius = radius_mm * 1.5 if _is_ic_cap_pair(comp_a, comp_b) else radius_mm
            if dist > effective_radius:
                continue

            weight = _pair_weight(comp_a, comp_b, weight_multipliers)
            base = max(0.0, (radius_mm - dist) / radius_mm)
            score = base * weight
            proximities.append(
                ProximityEdge(
                    ref_a=comp_a.reference,
                    ref_b=comp_b.reference,
                    distance_mm=dist,
                    score=score,
                    category_a=comp_a.category,
                    category_b=comp_b.category,
                    weight=weight,
                )
            )
    return proximities


def _distance(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def _pair_weight(
    comp_a: DistilledComponent, comp_b: DistilledComponent, weight_multipliers: Dict[Tuple[str, str], float]
) -> float:
    """Derive proximity weight, boosting U? + capacitor relationships."""
    weight = weight_multipliers.get((comp_a.category, comp_b.category), 1.0)
    weight = weight_multipliers.get((comp_b.category, comp_a.category), weight)

    if _is_ic_cap_pair(comp_a, comp_b) and (_is_u_ref(comp_a.reference) or _is_u_ref(comp_b.reference)):
        weight *= 3.0

    return weight


def _is_ic_cap_pair(comp_a: DistilledComponent, comp_b: DistilledComponent) -> bool:
    cats = {comp_a.category, comp_b.category}
    return cats == {"ic", "capacitor"}


def _is_u_ref(reference: str) -> bool:
    return reference.upper().startswith("U")


def _is_real_component(component: DistilledComponent) -> bool:
    """Filter out power/net label symbols from proximity graph."""
    ref = component.reference.upper()
    if ref.startswith("#"):
        return False
    if ref.startswith("NET-"):
        return False
    lib = component.lib_id.lower()
    if lib.startswith("power:"):
        return False
    if lib.startswith("net:"):
        return False
    return True


def _is_real_symbol(component: SchematicSymbol) -> bool:
    """Filter out power/net label symbols before distillation."""
    ref = component.reference.upper()
    if ref.startswith("#"):
        return False
    if ref.startswith("NET-"):
        return False
    lib = component.lib_id.lower()
    if lib.startswith("power:"):
        return False
    if lib.startswith("net:"):
        return False
    return True

