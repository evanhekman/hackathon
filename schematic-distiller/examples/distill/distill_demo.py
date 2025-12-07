"""
Example: distill a KiCad schematic into LLM-friendly JSON.
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import kicad_sch_api as ksa
from kicad_sch_api.distill import DistillationConfig, distill_schematic
from kicad_sch_api import load_schematic as parse_schematic


def _collect_schematics_from_dir(directory: Path) -> List[Path]:
    return sorted(p for p in directory.rglob("*.kicad_sch") if p.is_file())


def _find_root_from_project_file(directory: Path, schematics: List[Path]) -> Optional[Path]:
    """
    Look for a .kicad_pro file and use its name to identify the root schematic.
    KiCad projects have a .kicad_pro file that shares the same base name as the root schematic.
    """
    project_files = list(directory.glob("*.kicad_pro"))
    if not project_files:
        return None
    
    # Use the first project file found (there's typically only one)
    project_file = project_files[0]
    project_name = project_file.stem  # e.g., "uBMS-2" from "uBMS-2.kicad_pro"
    
    # Look for a schematic with the matching name
    for sch_path in schematics:
        if sch_path.stem == project_name:
            return sch_path.resolve()
    
    return None


def _detect_root_schematic(schematics: Iterable[Path], directory: Optional[Path] = None) -> Path:
    """
    Determine the root schematic from a collection.
    
    Strategy:
    1. First, look for a .kicad_pro project file - its name matches the root schematic
    2. Fall back to analyzing sheet references (root = schematic not referenced as child)
    3. If multiple candidates, use heuristics (most sheet references, then alphabetically first)
    """
    normalized = [p.resolve() for p in schematics]
    
    if not normalized:
        raise SystemExit("No schematic files provided.")
    
    # Strategy 1: Try to find root from .kicad_pro project file
    if directory:
        root = _find_root_from_project_file(directory, normalized)
        if root:
            return root
    else:
        # If no directory specified, try the parent of the first schematic
        first_parent = normalized[0].parent
        root = _find_root_from_project_file(first_parent, normalized)
        if root:
            return root
    
    # Strategy 2: Analyze sheet references
    parents: Set[Path] = set()
    children: Set[Path] = set()

    for sch_path in normalized:
        schematic = parse_schematic(str(sch_path))
        data = getattr(schematic, "_data", {}) or {}
        
        # Check for sheets in the schematic - could be under different keys
        sheets_data = data.get("sheet", []) + data.get("sheets", [])
        
        # Also check if sheets is a list of sheet items in the schematic
        if hasattr(schematic, 'sheets'):
            for sheet in schematic.sheets:
                if hasattr(sheet, 'filename'):
                    child_path = (sch_path.parent / sheet.filename).resolve()
                    children.add(child_path)
        
        # Process data-based sheets
        for sheet in sheets_data:
            file_field = sheet.get("filename") or sheet.get("file")
            if not file_field:
                continue
            child_path = (sch_path.parent / file_field).resolve()
            children.add(child_path)
        
        parents.add(sch_path)

    roots = parents - children
    if not roots:
        # If sheet analysis failed completely, just return the first file alphabetically
        return sorted(normalized)[0]

    if len(roots) == 1:
        return next(iter(roots))

    # Strategy 3: Heuristics - pick the root with the most outgoing sheet references
    sheet_counts: Dict[Path, int] = {}
    for sch_path in roots:
        schematic = parse_schematic(str(sch_path))
        data = getattr(schematic, "_data", {}) or {}
        count = len(data.get("sheet", []))
        if hasattr(schematic, 'sheets'):
            count = max(count, len(schematic.sheets))
        sheet_counts[sch_path] = count

    max_count = max(sheet_counts.values())
    best_roots = [p for p, cnt in sheet_counts.items() if cnt == max_count]
    best_roots_sorted = sorted(best_roots)
    
    # If still multiple candidates, just pick the first one alphabetically
    # This is better than failing completely
    if len(best_roots_sorted) > 1:
        # Log a warning but proceed with the first candidate
        import sys
        print(
            f"Warning: Multiple candidate roots found, using {best_roots_sorted[0].name}",
            file=sys.stderr
        )

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
    directory: Optional[Path] = None
    
    if args.schematic:
        candidate_paths = [Path(args.schematic)]
    elif args.dir:
        directory = Path(args.dir)
        candidate_paths = _collect_schematics_from_dir(directory)
    elif args.files:
        candidate_paths = [Path(p) for p in args.files]

    if not candidate_paths:
        raise SystemExit("No schematic files found.")
    for p in candidate_paths:
        if not p.exists():
            raise SystemExit(f"Schematic not found: {p}")

    root_path = _detect_root_schematic(candidate_paths, directory) if len(candidate_paths) > 1 else candidate_paths[0]

    schematic = ksa.load_schematic(str(root_path))
    cfg = DistillationConfig(proximity_radius_mm=args.radius, hierarchical=not args.no_hierarchy)
    distilled = distill_schematic(schematic, cfg)

    print(json.dumps(distilled.to_dict(), indent=2))


if __name__ == "__main__":
    main()

