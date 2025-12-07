/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { first } from "../../base/iterator";
import { BBox, Vec2 } from "../../base/math";
import { is_string } from "../../base/types";
import { Renderer } from "../../graphics";
import { Canvas2DRenderer } from "../../graphics/canvas2d";
import type { SchematicTheme } from "../../kicad";
import {
    KicadSch,
    SchematicSheet,
    SchematicSymbol,
    Wire,
    NetLabel,
    GlobalLabel,
    HierarchicalLabel,
    PinInstance,
} from "../../kicad/schematic";
import type { ProjectPage } from "../../kicanvas/project";
import { DocumentViewer } from "../base/document-viewer";
import { type ZoneConnection } from "../base/events";
import { LayerSet } from "./layers";
import { SchematicPainter } from "./painter";

export class SchematicViewer extends DocumentViewer<
    KicadSch,
    SchematicPainter,
    LayerSet,
    SchematicTheme
> {
    get schematic(): KicadSch {
        return this.document;
    }

    override create_renderer(canvas: HTMLCanvasElement): Renderer {
        const renderer = new Canvas2DRenderer(canvas);
        renderer.state.fill = this.theme.note;
        renderer.state.stroke = this.theme.note;
        renderer.state.stroke_width = 0.1524;
        return renderer;
    }

    override async load(src: KicadSch | ProjectPage) {
        if (src instanceof KicadSch) {
            return await super.load(src);
        }

        this.document = null!;

        const doc = src.document as KicadSch;
        doc.update_hierarchical_data(src.sheet_path);

        return await super.load(doc);
    }

    protected override create_painter() {
        return new SchematicPainter(this.renderer, this.layers, this.theme);
    }

    protected override create_layer_set() {
        return new LayerSet(this.theme);
    }

    public override select(
        item: SchematicSymbol | SchematicSheet | string | BBox | null,
    ): void {
        // If item is a string, find the symbol by uuid or reference.
        if (is_string(item)) {
            item =
                this.schematic.find_symbol(item) ??
                this.schematic.find_sheet(item);
        }

        // If it's a symbol or sheet, find the bounding box for it.
        if (item instanceof SchematicSymbol || item instanceof SchematicSheet) {
            const bboxes = this.layers.query_item_bboxes(item);
            item = first(bboxes) ?? null;
        }

        super.select(item);
    }

    /**
     * Query all schematic items within a zone/bounding box
     */
    protected override query_zone(zone: BBox): unknown[] {
        const items: unknown[] = [];

        if (!this.schematic) {
            return items;
        }

        // Query symbols
        for (const symbol of this.schematic.symbols.values()) {
            const bboxes = this.layers.query_item_bboxes(symbol);
            for (const bbox of bboxes) {
                if (zone.contains(bbox) || this.bbox_intersects(zone, bbox)) {
                    items.push(symbol);
                    break;
                }
            }
        }

        // Query sheets
        for (const sheet of this.schematic.sheets) {
            const bboxes = this.layers.query_item_bboxes(sheet);
            for (const bbox of bboxes) {
                if (zone.contains(bbox) || this.bbox_intersects(zone, bbox)) {
                    items.push(sheet);
                    break;
                }
            }
        }

        // Query wires
        for (const wire of this.schematic.wires) {
            if (this.wire_in_zone(wire, zone)) {
                items.push(wire);
            }
        }

        // Query buses
        for (const bus of this.schematic.buses) {
            if (this.wire_in_zone(bus, zone)) {
                items.push(bus);
            }
        }

        // Query labels
        for (const label of this.schematic.net_labels) {
            if (zone.contains_point(label.at.position)) {
                items.push(label);
            }
        }

        for (const label of this.schematic.global_labels) {
            if (zone.contains_point(label.at.position)) {
                items.push(label);
            }
        }

        for (const label of this.schematic.hierarchical_labels) {
            if (zone.contains_point(label.at.position)) {
                items.push(label);
            }
        }

        // Query junctions
        for (const junction of this.schematic.junctions) {
            if (zone.contains_point(junction.at.position)) {
                items.push(junction);
            }
        }

        return items;
    }

    /**
     * Check if a wire segment is within a zone
     */
    private wire_in_zone(wire: Wire | { pts: Vec2[] }, zone: BBox): boolean {
        for (const pt of wire.pts) {
            if (zone.contains_point(pt)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Analyze connections between symbols in the zone
     */
    protected override analyze_connections(items: unknown[]): ZoneConnection[] {
        const connections: ZoneConnection[] = [];

        if (!this.schematic) {
            return connections;
        }

        // Get all symbols from the items
        const symbols = items.filter(
            (item): item is SchematicSymbol => item instanceof SchematicSymbol,
        );

        // Get all wires from the items
        const wires = items.filter(
            (item): item is Wire => item instanceof Wire,
        );

        // Get all labels from the items
        const labels = [
            ...items.filter(
                (item): item is NetLabel => item instanceof NetLabel,
            ),
            ...items.filter(
                (item): item is GlobalLabel => item instanceof GlobalLabel,
            ),
            ...items.filter(
                (item): item is HierarchicalLabel =>
                    item instanceof HierarchicalLabel,
            ),
        ];

        // Build a map of wire endpoints to find connections
        const wireEndpoints = new Map<string, Wire[]>();
        for (const wire of wires) {
            for (const pt of wire.pts) {
                const key = `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;
                if (!wireEndpoints.has(key)) {
                    wireEndpoints.set(key, []);
                }
                wireEndpoints.get(key)!.push(wire);
            }
        }

        // Build a map of label positions
        const labelsByPosition = new Map<
            string,
            NetLabel | GlobalLabel | HierarchicalLabel
        >();
        for (const label of labels) {
            const key = `${label.at.position.x.toFixed(3)},${label.at.position.y.toFixed(3)}`;
            labelsByPosition.set(key, label);
        }

        // Find connections through pins
        const pinConnections = new Map<
            string,
            { symbol: SchematicSymbol; pin: PinInstance }[]
        >();

        for (const symbol of symbols) {
            for (const pin of symbol.unit_pins) {
                const pinPos = this.get_pin_position(symbol, pin);
                const key = `${pinPos.x.toFixed(3)},${pinPos.y.toFixed(3)}`;

                if (!pinConnections.has(key)) {
                    pinConnections.set(key, []);
                }
                pinConnections.get(key)!.push({ symbol, pin });
            }
        }

        // Find direct pin-to-pin connections
        for (const [posKey, pinsAtPos] of pinConnections) {
            if (pinsAtPos.length >= 2) {
                // Direct connection between pins
                for (let i = 0; i < pinsAtPos.length; i++) {
                    for (let j = i + 1; j < pinsAtPos.length; j++) {
                        const pin1 = pinsAtPos[i]!;
                        const pin2 = pinsAtPos[j]!;

                        // Get net name from label if available
                        const netName = labelsByPosition.get(posKey)?.text;

                        connections.push({
                            from: pin1.symbol.reference,
                            fromPin: pin1.pin.number,
                            to: pin2.symbol.reference,
                            toPin: pin2.pin.number,
                            netName: netName,
                        });
                    }
                }
            }

            // Check for wire connections at this pin position
            if (wireEndpoints.has(posKey) && pinsAtPos.length === 1) {
                const pin = pinsAtPos[0]!;
                const wiresAtPin = wireEndpoints.get(posKey)!;

                // Find other pins connected through these wires
                for (const wire of wiresAtPin) {
                    for (const pt of wire.pts) {
                        const otherKey = `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;
                        if (otherKey === posKey) continue;

                        const otherPins = pinConnections.get(otherKey);
                        if (otherPins) {
                            for (const otherPin of otherPins) {
                                // Avoid duplicate connections
                                const existing = connections.find(
                                    (c) =>
                                        (c.from === pin.symbol.reference &&
                                            c.fromPin === pin.pin.number &&
                                            c.to === otherPin.symbol.reference &&
                                            c.toPin === otherPin.pin.number) ||
                                        (c.to === pin.symbol.reference &&
                                            c.toPin === pin.pin.number &&
                                            c.from ===
                                                otherPin.symbol.reference &&
                                            c.fromPin === otherPin.pin.number),
                                );

                                if (!existing) {
                                    // Try to find net name from labels on the wire
                                    let netName: string | undefined;
                                    for (const wpt of wire.pts) {
                                        const lKey = `${wpt.x.toFixed(3)},${wpt.y.toFixed(3)}`;
                                        const label =
                                            labelsByPosition.get(lKey);
                                        if (label) {
                                            netName = label.text;
                                            break;
                                        }
                                    }

                                    connections.push({
                                        from: pin.symbol.reference,
                                        fromPin: pin.pin.number,
                                        to: otherPin.symbol.reference,
                                        toPin: otherPin.pin.number,
                                        netName: netName,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return connections;
    }

    /**
     * Calculate the position of a pin in world coordinates
     */
    private get_pin_position(symbol: SchematicSymbol, pin: PinInstance): Vec2 {
        const pinDef = pin.definition;
        const pinPos = pinDef.at.position.copy();

        // Apply symbol transformation
        const rotation = (symbol.at.rotation ?? 0) * (Math.PI / 180);
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        let x = pinPos.x;
        let y = pinPos.y;

        // Apply mirror
        if (symbol.mirror === "x") {
            y = -y;
        } else if (symbol.mirror === "y") {
            x = -x;
        }

        // Apply rotation
        const rotatedX = x * cos - y * sin;
        const rotatedY = x * sin + y * cos;

        // Translate to symbol position
        return new Vec2(
            symbol.at.position.x + rotatedX,
            symbol.at.position.y + rotatedY,
        );
    }

    /**
     * Get all symbols in the current schematic
     */
    public get_all_symbols(): SchematicSymbol[] {
        if (!this.schematic) {
            return [];
        }
        return Array.from(this.schematic.symbols.values());
    }

    /**
     * Get bounding boxes for schematic items
     */
    protected override get_bboxes_for_items(items: unknown[]): BBox[] {
        const bboxes: BBox[] = [];
        for (const item of items) {
            // Try to find bbox for any item type using query_item_bboxes
            const itemBboxes = this.layers.query_item_bboxes(item);
            for (const bbox of itemBboxes) {
                bboxes.push(bbox);
                break; // Only take first bbox per item
            }
        }
        return bboxes;
    }

    /**
     * Get symbol data for external use
     */
    public get_symbol_data(
        symbol: SchematicSymbol,
    ): {
        uuid: string;
        reference: string;
        value: string;
        footprint: string;
        libId: string;
        position: { x: number; y: number; rotation: number };
        properties: Map<string, string>;
        pins: { number: string; name: string }[];
    } {
        const properties = new Map<string, string>();
        for (const [name, prop] of symbol.properties) {
            properties.set(name, prop.text);
        }

        const pins = symbol.unit_pins.map((pin) => ({
            number: pin.number,
            name: pin.definition.name.text,
        }));

        return {
            uuid: symbol.uuid,
            reference: symbol.reference,
            value: symbol.value,
            footprint: symbol.footprint,
            libId: symbol.lib_id,
            position: {
                x: symbol.at.position.x,
                y: symbol.at.position.y,
                rotation: symbol.at.rotation ?? 0,
            },
            properties,
            pins,
        };
    }
}
