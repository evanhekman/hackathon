"""
Example: distill a KiCad schematic into LLM-friendly JSON.
"""

import argparse
import json
from pathlib import Path
from typing import Iterable, List, Optional, Set, Tuple

import kicad_sch_api as ksa
from kicad_sch_api.distill import DistillationConfig, distill_schematic
from kicad_sch_api import load_schematic as parse_schematic


def _collect_schematics_from_dir(directory: Path) -> List[Path]:
    return sorted(p for p in directory.rglob("*.kicad_sch") if p.is_file())


def _detect_root_schematic(schematics: Iterable[Path]) -> Path:
    """
    Determine the root schematic from a collection by analyzing sheet references.
    Root is defined as the schematic that is not referenced as a child by any other.
    """
    parents: Set[Path] = set()
    children: Set[Path] = set()

    # Normalize paths to resolved absolute for consistent comparison
    normalized = [p.resolve() for p in schematics]

    for sch_path in normalized:
        schematic = parse_schematic(str(sch_path))
        data = getattr(schematic, "_data", {}) or {}
        # sheet entries carry filenames relative to parent
        for sheet in data.get("sheet", []) + data.get("sheets", []):
            file_field = sheet.get("filename") or sheet.get("file")
            if not file_field:
                continue
            child_path = (sch_path.parent / file_field).resolve()
            children.add(child_path)
        parents.add(sch_path)

    roots = parents - children
    if not roots:
        raise SystemExit("Could not determine root schematic (no roots found).")

    if len(roots) == 1:
        return next(iter(roots))

    # Heuristic: pick the root with the most outgoing sheet references; if tied, pick lexicographically first.
    sheet_counts: Dict[Path, int] = {}
    for sch_path in roots:
        schematic = parse_schematic(str(sch_path))
        data = getattr(schematic, "_data", {}) or {}
        sheet_counts[sch_path] = len(data.get("sheet", []))

    max_count = max(sheet_counts.values())
    best_roots = [p for p, cnt in sheet_counts.items() if cnt == max_count]
    best_roots_sorted = sorted(best_roots)
    if len(best_roots_sorted) > 1:
        msg = (
            "Multiple candidate roots found; choose one explicitly with --schematic/--files:\n"
            + "\n".join(str(r) for r in best_roots_sorted)
        )
        raise SystemExit(msg)

    return best_roots_sorted[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Distill KiCad schematic for LLM input")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--schematic", help="Path to a .kicad_sch file")
    group.add_argument("--dir", help="Directory containing .kicad_sch files (auto-detect root)")
    group.add_argument(
        "--files",
        nargs="+",
        help="List of .kicad_sch files (auto-detect root among them)",
    )
    parser.add_argument(
        "--radius",
        type=float,
        default=20.0,
        help="Proximity radius in mm for nearby-part scoring (default: 20mm)",
    )
    parser.add_argument(
        "--no-hierarchy",
        action="store_true",
        help="Disable hierarchical connectivity traversal",
    )
    args = parser.parse_args()

    candidate_paths: List[Path] = []
    if args.schematic:
        candidate_paths = [Path(args.schematic)]
    elif args.dir:
        candidate_paths = _collect_schematics_from_dir(Path(args.dir))
    elif args.files:
        candidate_paths = [Path(p) for p in args.files]

    if not candidate_paths:
        raise SystemExit("No schematic files found.")
    for p in candidate_paths:
        if not p.exists():
            raise SystemExit(f"Schematic not found: {p}")

    root_path = _detect_root_schematic(candidate_paths) if len(candidate_paths) > 1 else candidate_paths[0]

    schematic = ksa.load_schematic(str(root_path))
    cfg = DistillationConfig(proximity_radius_mm=args.radius, hierarchical=not args.no_hierarchy)
    distilled = distill_schematic(schematic, cfg)

    print(json.dumps(distilled.to_dict(), indent=2))


if __name__ == "__main__":
    main()

