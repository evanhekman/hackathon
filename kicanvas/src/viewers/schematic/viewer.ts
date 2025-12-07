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

        // Selected symbols/sheets (zone contents) and all symbols/sheets
        const selectedSymbols = items.filter(
            (item): item is SchematicSymbol => item instanceof SchematicSymbol,
        );
        const selectedSheets = items.filter(
            (item): item is SchematicSheet => item instanceof SchematicSheet,
        );

        const selectedRefs = new Set<string>([
            ...selectedSymbols.map((s) => s.reference),
            ...selectedSheets.map((s) => s.sheetname ?? s.sheetfile ?? s.uuid),
        ]);

        const allSymbols = Array.from(this.schematic.symbols.values());
        const allSheets = Array.from(this.schematic.sheets);

        // Use ALL wires and labels so we can find connections to components
        // outside the current selection zone.
        const wires = this.schematic.wires;
        const labels = [
            ...this.schematic.net_labels,
            ...this.schematic.global_labels,
            ...this.schematic.hierarchical_labels,
        ];

        // Union-Find for connectivity across wire graph, pins, and labels.
        const parent = new Map<string, string>();
        const find = (k: string): string => {
            let p = parent.get(k);
            if (p === undefined) {
                parent.set(k, k);
                p = k;
            }
            if (p !== k) {
                const root = find(p);
                parent.set(k, root);
                return root;
            }
            return p;
        };
        const union = (a: string, b: string) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) {
                parent.set(ra, rb);
            }
        };

        const keyFor = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;

        // Add wire endpoints and connect consecutive points in each wire.
        for (const wire of wires) {
            for (let i = 0; i < wire.pts.length; i++) {
                const pt = wire.pts[i]!;
                const k = keyFor(pt.x, pt.y);
                find(k);
                if (i > 0) {
                    const prev = wire.pts[i - 1]!;
                    union(k, keyFor(prev.x, prev.y));
                }
            }
        }

        // Label maps (must exist before sheet pin processing)
        const labelByKey = new Map<string, NetLabel | GlobalLabel | HierarchicalLabel>();
        const labelRootsByText = new Map<string, string[]>();

        // Map pin positions to nodes
        type Endpoint = { ref: string; pinId: string };
        const pinPositions = new Map<string, Endpoint[]>();
        for (const symbol of allSymbols) {
            for (const pin of symbol.unit_pins) {
                const pos = this.get_pin_position(symbol, pin);
                const k = keyFor(pos.x, pos.y);
                find(k);
                if (!pinPositions.has(k)) {
                    pinPositions.set(k, []);
                }
                pinPositions.get(k)!.push({
                    ref: symbol.reference,
                    pinId: pin.number,
                });
            }
        }

        // Sheet pins (hierarchical ports) participate in connectivity
        for (const sheet of allSheets) {
            const sheetRef = sheet.sheetname ?? sheet.sheetfile ?? sheet.uuid;
            for (const pin of sheet.pins) {
                const pos = pin.at.position;
                const k = keyFor(pos.x, pos.y);
                find(k);
                if (!pinPositions.has(k)) {
                    pinPositions.set(k, []);
                }
                pinPositions.get(k)!.push({
                    ref: sheetRef,
                    pinId: pin.name,
                });
                // Track sheet pin roots by name for cross-sheet linking
                if (!labelRootsByText.has(pin.name)) {
                    labelRootsByText.set(pin.name, []);
                }
                labelRootsByText.get(pin.name)!.push(find(k));
            }
        }

        // Attach pins to wire nodes (union with any existing wire node at same coord)
        for (const k of pinPositions.keys()) {
            find(k); // ensure node exists
        }

        // Attach labels as nodes and union with coincident wire/pin points
        for (const label of labels) {
            const k = keyFor(label.at.position.x, label.at.position.y);
            labelByKey.set(k, label);
            find(k);
            const root = find(k);
            if (label.text) {
                if (!labelRootsByText.has(label.text)) {
                    labelRootsByText.set(label.text, []);
                }
                labelRootsByText.get(label.text)!.push(root);
            }
        }

        // If labels or pins share the same coordinate as a wire node, they are already united.
        // (All nodes share the same key mapping.)

        // Connect hierarchical/global labels with identical text (and sheet pins with same name)
        const unionAll = (roots: string[]) => {
            if (roots.length < 2) return;
            const [first, ...rest] = roots;
            if (!first) return;
            for (const r of rest) {
                union(first, r);
            }
        };

        // Deduplicate connections regardless of ordering
        const seen = new Set<string>();

        const isPowerRef = (ref: string) =>
            ref.startsWith("#PWR") || ref.toUpperCase().startsWith("PWR?");

        const pushConnection = (a: Endpoint, b: Endpoint, netName?: string) => {
            const aRef = a.ref;
            const bRef = b.ref;

            // Drop power symbol connections
            if (isPowerRef(aRef) || isPowerRef(bRef)) {
                return;
            }

            if (aRef === bRef) {
                return;
            }

            const aSelected = selectedRefs.has(aRef);
            const bSelected = selectedRefs.has(bRef);

            if (!aSelected && !bSelected) {
                return;
            }

            // Prefer selected -> other
            let from = a;
            let to = b;
            if (!aSelected && bSelected) {
                from = b;
                to = a;
            }

            const key = `${from.ref}|${from.pinId}->${to.ref}|${to.pinId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);

                                    connections.push({
                from: from.ref,
                fromPin: from.pinId,
                to: to.ref,
                toPin: to.pinId,
                netName,
            });
        };

        // Union all roots sharing the same label/pin text
        for (const roots of labelRootsByText.values()) {
            unionAll(roots.map((r) => find(r)));
        }

        // Build groups of pins by connectivity root
        const pinsByRoot = new Map<string, Endpoint[]>();
        for (const [k, pins] of pinPositions) {
            const root = find(k);
            if (!pinsByRoot.has(root)) {
                pinsByRoot.set(root, []);
            }
            pinsByRoot.get(root)!.push(...pins);
        }

        // Determine net name per root (if any label on that root)
        const netNameByRoot = new Map<string, string>();
        for (const [k, label] of labelByKey) {
            const root = find(k);
            if (!netNameByRoot.has(root) && label.text) {
                netNameByRoot.set(root, label.text);
            }
        }

        // For each connectivity component, connect pins within it
        for (const [root, pins] of pinsByRoot) {
            const netName = netNameByRoot.get(root);
            for (let i = 0; i < pins.length; i++) {
                for (let j = i + 1; j < pins.length; j++) {
                    pushConnection(pins[i]!, pins[j]!, netName);
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
     * Find an item by UUID (override from base Viewer)
     */
    public override find_item_by_uuid(uuid: string): unknown {
        if (!this.schematic) {
            return null;
        }

        // Check symbols
        const symbol = this.schematic.symbols.get(uuid);
        if (symbol) {
            return symbol;
        }

        // Check sheets
        for (const sheet of this.schematic.sheets) {
            if (sheet.uuid === uuid) {
                return sheet;
            }
        }

        return null;
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
    public get_symbol_data(symbol: SchematicSymbol): {
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
