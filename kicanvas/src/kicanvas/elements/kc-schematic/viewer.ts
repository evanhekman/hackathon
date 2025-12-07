/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { extractPackageFromFootprint } from "../../../base/paths";
import type { TooltipData } from "../../../kc-ui";
import {
    GlobalLabel,
    HierarchicalLabel,
    NetLabel,
    SchematicSheet,
    SchematicSymbol,
    Wire,
} from "../../../kicad/schematic";
import { SchematicViewer } from "../../../viewers/schematic/viewer";
import { KCViewerElement } from "../common/viewer";

export class KCSchematicViewerElement extends KCViewerElement<SchematicViewer> {
    protected override update_theme(): void {
        this.viewer.theme = this.themeObject.schematic;
    }

    protected override make_viewer(): SchematicViewer {
        return new SchematicViewer(
            this.canvas,
            !this.disableinteraction,
            this.themeObject.schematic,
        );
    }

    protected override getTooltipData(item: unknown): TooltipData | null {
        // Handle SchematicSymbol
        if (item instanceof SchematicSymbol) {
            return this.#getSymbolTooltipData(item);
        }

        // Handle SchematicSheet
        if (item instanceof SchematicSheet) {
            return {
                type: "Sheet",
                sheetName: item.sheetname,
            };
        }

        // Handle Wire
        if (item instanceof Wire) {
            return {
                type: "Wire",
            };
        }

        // Handle NetLabel
        if (item instanceof NetLabel) {
            return {
                type: "Net",
                netName: item.text,
            };
        }

        // Handle GlobalLabel
        if (item instanceof GlobalLabel) {
            return {
                type: "Global Net",
                netName: item.text,
            };
        }

        // Handle HierarchicalLabel
        if (item instanceof HierarchicalLabel) {
            return {
                type: "Hierarchical",
                netName: item.text,
            };
        }

        return null;
    }

    /**
     * Extract rich tooltip data from a schematic symbol
     */
    #getSymbolTooltipData(symbol: SchematicSymbol): TooltipData {
        // Get description from library symbol
        let description: string | undefined;
        try {
            const libSymbol = symbol.lib_symbol;
            if (libSymbol?.description) {
                description = libSymbol.description;
            }
        } catch {
            // Library symbol might not be available
        }

        // Get datasheet URL
        const datasheet = symbol.properties.get("Datasheet")?.text;

        // Try to find manufacturer from various common property names
        const manufacturer =
            symbol.properties.get("Manufacturer")?.text ||
            symbol.properties.get("MANUFACTURER")?.text ||
            symbol.properties.get("MF")?.text ||
            symbol.properties.get("Mfr")?.text;

        // Try to find part number from various common property names
        const partNumber =
            symbol.properties.get("MPN")?.text ||
            symbol.properties.get("MP")?.text ||
            symbol.properties.get("Part Number")?.text ||
            symbol.properties.get("PartNumber")?.text ||
            symbol.properties.get("P/N")?.text;

        // Extract package from footprint (e.g., "Resistor_SMD:R_0603_1608Metric" -> "0603")
        const packageType = extractPackageFromFootprint(symbol.footprint);

        // Collect any extra interesting properties
        const extras: Array<{ key: string; value: string }> = [];

        // Check for tolerance (common on passives)
        const tolerance = symbol.properties.get("Tolerance")?.text;
        if (tolerance) {
            extras.push({ key: "Tolerance", value: tolerance });
        }

        // Check for voltage rating
        const voltage =
            symbol.properties.get("Voltage")?.text ||
            symbol.properties.get("Voltage Rating")?.text;
        if (voltage) {
            extras.push({ key: "Voltage", value: voltage });
        }

        // Check for power rating
        const power =
            symbol.properties.get("Power")?.text ||
            symbol.properties.get("Power Rating")?.text;
        if (power) {
            extras.push({ key: "Power", value: power });
        }

        // Check for price (some BOMs include this)
        const price =
            symbol.properties.get("Price")?.text ||
            symbol.properties.get("PRICE")?.text ||
            symbol.properties.get("Price ($)")?.text;
        if (price) {
            extras.push({ key: "Price", value: price });
        }

        return {
            type: "Symbol",
            reference: symbol.reference,
            value: symbol.value || undefined,
            description: description,
            datasheet: datasheet,
            manufacturer: manufacturer,
            partNumber: partNumber,
            package: packageType,
            pinCount: symbol.unit_pins?.length,
            inBom: symbol.in_bom,
            onBoard: symbol.on_board,
            dnp: symbol.dnp,
            extras: extras.length > 0 ? extras : undefined,
        };
    }
}

window.customElements.define("kc-schematic-viewer", KCSchematicViewerElement);
