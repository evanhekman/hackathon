from pathlib import Path

import kicad_sch_api as ksa
from kicad_sch_api.distill import DistillationConfig, distill_schematic
from kicad_sch_api.distill.distiller import _compute_proximities
from kicad_sch_api.distill.model import DistilledComponent


def test_distill_basic_connectivity():
    sch_path = (
        Path(__file__).resolve().parent.parent
        / "reference_kicad_projects"
        / "connectivity"
        / "w1_simple_wire"
        / "w1_simple_wire.kicad_sch"
    )
    schematic = ksa.load_schematic(str(sch_path))

    distilled = distill_schematic(schematic, DistillationConfig(proximity_radius_mm=100.0))

    assert distilled.components, "Expected components in distilled output"
    assert isinstance(distilled.nets, dict) and distilled.nets, "Expected nets mapping in distilled output"

    # All pins should carry a net name
    assert any(pin.net for comp in distilled.components for pin in comp.pins)

    # Nets should map refs to lists of pin objects
    first_net = next(iter(distilled.nets.values()))
    assert all(isinstance(pins, list) for pins in first_net.pins.values())
    assert all(isinstance(pin, dict) and "Pin" in pin for pins in first_net.pins.values() for pin in pins)

    # Components should exclude power/net labels
    assert all(not comp.reference.startswith("#") for comp in distilled.components)


def test_proximity_weights():
    comp_ic = DistilledComponent(
        reference="U1",
        lib_id="MCU:STM32",
        value="MCU",
        footprint=None,
        properties={},
        pins=[],
        position=(0.0, 0.0),
        category="ic",
    )
    comp_cap = DistilledComponent(
        reference="C1",
        lib_id="Device:C",
        value="100nF",
        footprint=None,
        properties={},
        pins=[],
        position=(5.0, 0.0),
        category="capacitor",
    )

    proximities = _compute_proximities(
        [comp_ic, comp_cap],
        radius_mm=20.0,
        weight_multipliers={("capacitor", "ic"): 2.0, ("ic", "capacitor"): 2.0},
    )

    assert proximities, "Expected proximity edge between nearby parts"
    edge = proximities[0]
    assert edge.weight == 2.0
    assert edge.score > 0


def test_proximity_filters_power_symbols():
    comp_ic = DistilledComponent(
        reference="U1",
        lib_id="MCU:STM32",
        value="MCU",
        footprint=None,
        properties={},
        pins=[],
        position=(0.0, 0.0),
        category="ic",
    )
    comp_power = DistilledComponent(
        reference="#PWR01",
        lib_id="power:+3.3V",
        value="+3.3V",
        footprint=None,
        properties={},
        pins=[],
        position=(1.0, 0.0),
        category="other",
    )

    proximities = _compute_proximities(
        [comp_ic, comp_power],
        radius_mm=20.0,
        weight_multipliers={("capacitor", "ic"): 2.0, ("ic", "capacitor"): 2.0},
    )

    assert proximities == [], "Power symbols should not appear in proximity graph"


def test_proximity_prefers_u_ic_cap_pairs():
    ic_u = DistilledComponent(
        reference="U1",
        lib_id="Device:U",
        value="IC",
        footprint=None,
        properties={},
        pins=[],
        position=(0.0, 0.0),
        category="ic",
    )
    cap_u = DistilledComponent(
        reference="C1",
        lib_id="Device:C",
        value="C",
        footprint=None,
        properties={},
        pins=[],
        position=(15.0, 0.0),
        category="capacitor",
    )
    ic_other = DistilledComponent(
        reference="Q1",
        lib_id="Device:Q",
        value="FET",
        footprint=None,
        properties={},
        pins=[],
        position=(0.0, 20.0),
        category="ic",
    )
    cap_other = DistilledComponent(
        reference="C2",
        lib_id="Device:C",
        value="C",
        footprint=None,
        properties={},
        pins=[],
        position=(13.0, 20.0),
        category="capacitor",
    )

    proximities = _compute_proximities(
        [ic_u, cap_u, ic_other, cap_other],
        radius_mm=30.0,
        weight_multipliers={("capacitor", "ic"): 2.0, ("ic", "capacitor"): 2.0},
    )

    # Find scores for the two ic-cap pairs
    scores = {(edge.ref_a, edge.ref_b): edge.score for edge in proximities}

    u_pair_score = scores.get(("U1", "C1")) or scores.get(("C1", "U1"))
    other_pair_score = scores.get(("Q1", "C2")) or scores.get(("C2", "Q1"))

    assert u_pair_score and other_pair_score
    assert u_pair_score > other_pair_score, "U?-cap pairs should be weighted higher than other ic-cap pairs"


def test_proximity_ic_cap_extended_radius():
    ic = DistilledComponent(
        reference="U3",
        lib_id="Device:U",
        value="IC",
        footprint=None,
        properties={},
        pins=[],
        position=(0.0, 0.0),
        category="ic",
    )
    near_cap = DistilledComponent(
        reference="C5",
        lib_id="Device:C",
        value="C",
        footprint=None,
        properties={},
        pins=[],
        position=(25.0, 0.0),
        category="capacitor",
    )

    # Base radius 20mm, but ic-cap pairs should allow 1.5x extension (30mm)
    proximities = _compute_proximities(
        [ic, near_cap],
        radius_mm=20.0,
        weight_multipliers={("capacitor", "ic"): 2.0, ("ic", "capacitor"): 2.0},
    )

    assert proximities, "IC-cap pair within extended radius should be included"


def test_distill_hierarchical_multisheet():
    """Ensure distillation traverses hierarchical sheets and preserves net connectivity."""
    sch_path = (
        Path(__file__).resolve().parent.parent
        / "reference_kicad_projects"
        / "connectivity"
        / "ps2_hierarchical_power"
        / "ps2_hierarchical_power.kicad_sch"
    )

    schematic = ksa.load_schematic(str(sch_path))
    distilled = distill_schematic(schematic, DistillationConfig(proximity_radius_mm=50.0, hierarchical=True))
    data = distilled.to_dict()

    # Components include child-sheet parts with sheet_path metadata
    components = data["components"]
    refs = {comp["reference"] for comp in components}
    assert "R2" in refs, "Child-sheet component R2 should be included"

    r2 = next(comp for comp in components if comp["reference"] == "R2")
    assert "sheet_path" in r2 and r2["sheet_path"], "Components should include sheet_path when hierarchical"

    # Nets are fully connected across sheet boundaries
    nets = data["nets"]
    assert "DATA" in nets, "DATA net should be present in distilled nets"
    data_net = nets["DATA"]

    assert "R1" in data_net and any(pin.get("Pin") == "2" for pin in data_net["R1"]), "R1.2 should be on DATA net"
    assert "R2" in data_net and any(pin.get("Pin") == "1" for pin in data_net["R2"]), "R2.1 should be on DATA net"

