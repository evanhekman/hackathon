"""
Symbol library definitions parser for KiCAD schematics.

Handles parsing and serialization of Symbol library definitions.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import sexpdata

from ..base import BaseElementParser
from ...library.cache import SymbolDefinition, get_symbol_cache

logger = logging.getLogger(__name__)


class LibraryParser(BaseElementParser):
    """Parser for Symbol library definitions."""

    def __init__(self):
        """Initialize library parser."""
        super().__init__("library")

    def _parse_lib_symbols(self, item: List[Any]) -> Dict[str, Any]:
        """Parse lib_symbols section."""
        if not item or item[0] != sexpdata.Symbol("lib_symbols"):
            return {}

        cache = get_symbol_cache()
        lib_symbols: Dict[str, Any] = {}

        for symbol_item in item[1:]:
            if not (isinstance(symbol_item, list) and symbol_item and symbol_item[0] == sexpdata.Symbol("symbol")):
                continue

            # lib_id is the second element: e.g., "CustomParts:TSC2003IPWR"
            lib_id = str(symbol_item[1]).strip('"')
            lib_symbols[lib_id] = symbol_item

            try:
                library_name, symbol_name = lib_id.split(":", 1)
            except ValueError:
                logger.warning(f"Skipping lib_id without library prefix: {lib_id}")
                continue

            # Gather properties (value/description/datasheet) and their positions if present
            properties: Dict[str, str] = {}
            property_positions: Dict[str, tuple] = {}
            for sub in symbol_item[2:]:
                if isinstance(sub, list) and sub and sub[0] == sexpdata.Symbol("property") and len(sub) >= 3:
                    prop_name = str(sub[1]).strip('"')
                    prop_value = str(sub[2]).strip('"')
                    properties[prop_name] = prop_value

                    pos = cache._extract_property_position(sub)  # type: ignore[attr-defined]
                    if pos:
                        property_positions[prop_name] = pos

            # Extract pins and unit count from the inline symbol definition
            pins = cache._extract_pins_from_symbol(symbol_item)  # type: ignore[attr-defined]
            unit_count = cache._count_symbol_units(symbol_item)  # type: ignore[attr-defined]
            reference_prefix = cache._guess_reference_prefix(symbol_name)  # type: ignore[attr-defined]

            symbol_def = SymbolDefinition(
                lib_id=lib_id,
                name=symbol_name,
                library=library_name,
                reference_prefix=reference_prefix,
                description=properties.get("Description", ""),
                datasheet=properties.get("Datasheet", properties.get("datasheet", "")),
                pins=pins,
                units=unit_count,
                property_positions=property_positions,
                raw_kicad_data=symbol_item,
            )

            # Register the inline symbol with the global cache so downstream pin lookups work
            cache._symbols[lib_id] = symbol_def  # type: ignore[attr-defined]
            cache._symbol_index[symbol_name] = lib_id  # type: ignore[attr-defined]
            if library_name not in cache._library_index:  # type: ignore[attr-defined]
                inline_path = Path(f"<inline:{library_name}>")
                cache._library_index[library_name] = inline_path  # type: ignore[attr-defined]
                cache._library_paths.add(inline_path)  # type: ignore[attr-defined]

        return lib_symbols

    # Conversion methods from internal format to S-expression

    def _lib_symbols_to_sexp(self, lib_symbols: Dict[str, Any]) -> List[Any]:
        """Convert lib_symbols to S-expression."""
        sexp = [sexpdata.Symbol("lib_symbols")]

        # Add each symbol definition
        for symbol_name, symbol_def in lib_symbols.items():
            if isinstance(symbol_def, list):
                # Raw S-expression data from parsed library file - use directly
                sexp.append(symbol_def)
            elif isinstance(symbol_def, dict):
                # Dictionary format - convert to S-expression
                symbol_sexp = self._create_basic_symbol_definition(symbol_name)
                sexp.append(symbol_sexp)

        return sexp

    def _create_basic_symbol_definition(self, lib_id: str) -> List[Any]:
        """Create a basic symbol definition for KiCAD compatibility."""
        symbol_sexp = [sexpdata.Symbol("symbol"), lib_id]

        # Add basic symbol properties
        symbol_sexp.extend(
            [
                [sexpdata.Symbol("pin_numbers"), [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")]],
                [sexpdata.Symbol("pin_names"), [sexpdata.Symbol("offset"), 0]],
                [sexpdata.Symbol("exclude_from_sim"), sexpdata.Symbol("no")],
                [sexpdata.Symbol("in_bom"), sexpdata.Symbol("yes")],
                [sexpdata.Symbol("on_board"), sexpdata.Symbol("yes")],
            ]
        )

        # Add basic properties for the symbol
        if "R" in lib_id:  # Resistor
            symbol_sexp.extend(
                [
                    [
                        sexpdata.Symbol("property"),
                        "Reference",
                        "R",
                        [sexpdata.Symbol("at"), 2.032, 0, 90],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Value",
                        "R",
                        [sexpdata.Symbol("at"), 0, 0, 90],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Footprint",
                        "",
                        [sexpdata.Symbol("at"), -1.778, 0, 90],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                            [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Datasheet",
                        "~",
                        [sexpdata.Symbol("at"), 0, 0, 0],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                            [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")],
                        ],
                    ],
                ]
            )

        elif "C" in lib_id:  # Capacitor
            symbol_sexp.extend(
                [
                    [
                        sexpdata.Symbol("property"),
                        "Reference",
                        "C",
                        [sexpdata.Symbol("at"), 0.635, 2.54, 0],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Value",
                        "C",
                        [sexpdata.Symbol("at"), 0.635, -2.54, 0],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Footprint",
                        "",
                        [sexpdata.Symbol("at"), 0, -1.27, 0],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                            [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")],
                        ],
                    ],
                    [
                        sexpdata.Symbol("property"),
                        "Datasheet",
                        "~",
                        [sexpdata.Symbol("at"), 0, 0, 0],
                        [
                            sexpdata.Symbol("effects"),
                            [sexpdata.Symbol("font"), [sexpdata.Symbol("size"), 1.27, 1.27]],
                            [sexpdata.Symbol("hide"), sexpdata.Symbol("yes")],
                        ],
                    ],
                ]
            )

        # Add basic graphics and pins (minimal for now)
        symbol_sexp.append([sexpdata.Symbol("embedded_fonts"), sexpdata.Symbol("no")])

        return symbol_sexp
