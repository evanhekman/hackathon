/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Barrier, later } from "../../base/async";
import { Disposables, type IDisposable } from "../../base/disposable";
import { listen } from "../../base/events";
import { no_self_recursion } from "../../base/functions";
import { BBox, Vec2 } from "../../base/math";
import { Color, Polygon, Polyline, Renderer } from "../../graphics";
import {
    KiCanvasLoadEvent,
    KiCanvasMouseMoveEvent,
    KiCanvasSelectEvent,
    KiCanvasZoneSelectEvent,
    type KiCanvasEventMap,
    type ZoneConnection,
} from "./events";
import { ViewLayerSet } from "./view-layers";
import { Viewport } from "./viewport";

export abstract class Viewer extends EventTarget {
    public renderer: Renderer;
    public viewport: Viewport;
    public layers: ViewLayerSet;
    public mouse_position: Vec2 = new Vec2(0, 0);
    public loaded = new Barrier();

    protected disposables = new Disposables();
    protected setup_finished = new Barrier();

    #selected: BBox | null;

    // Zone selection state
    protected zone_selection_active = false;
    protected zone_start: Vec2 | null = null;
    protected zone_current: Vec2 | null = null;
    #zone_selection_box: BBox | null = null;
    #zone_selection_just_completed = false;

    // Multi-selection: items selected via zone or Command+click
    protected zone_selected_items: unknown[] = [];
    protected zone_selected_bboxes: BBox[] = [];

    constructor(
        public canvas: HTMLCanvasElement,
        protected interactive = true,
    ) {
        super();
    }

    dispose() {
        this.disposables.dispose();
    }

    override addEventListener<K extends keyof KiCanvasEventMap>(
        type: K,
        listener:
            | ((this: Viewer, ev: KiCanvasEventMap[K]) => void)
            | { handleEvent: (ev: KiCanvasEventMap[K]) => void }
            | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable;
    override addEventListener(
        type: string,
        listener: EventListener | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable {
        super.addEventListener(type, listener, options);
        return {
            dispose: () => {
                this.removeEventListener(type, listener, options);
            },
        };
    }

    protected abstract create_renderer(canvas: HTMLCanvasElement): Renderer;

    async setup() {
        this.renderer = this.disposables.add(this.create_renderer(this.canvas));

        await this.renderer.setup();

        this.viewport = this.disposables.add(
            new Viewport(this.renderer, () => {
                this.on_viewport_change();
            }),
        );

        if (this.interactive) {
            this.viewport.enable_pan_and_zoom(0.5, 190);

            this.disposables.add(
                listen(this.canvas, "mousemove", (e) => {
                    this.on_mouse_change(e);
                    this.on_zone_selection_move(e);
                }),
            );

            this.disposables.add(
                listen(this.canvas, "panzoom", (e) => {
                    this.on_mouse_change(e as MouseEvent);
                }),
            );

            this.disposables.add(
                listen(this.canvas, "click", (e) => {
                    // Skip click events that follow a completed zone selection
                    if (this.#zone_selection_just_completed) {
                        this.#zone_selection_just_completed = false;
                        return;
                    }

                    // Only handle click if not in zone selection mode
                    if (!this.zone_selection_active) {
                        const items = this.layers.query_point(
                            this.mouse_position,
                        );
                        // Shift+click adds to zone selection
                        if (e.shiftKey) {
                            this.on_pick_additive(this.mouse_position, items);
                        } else {
                            this.on_pick(this.mouse_position, items);
                        }
                    }
                }),
            );

            // Zone selection: Shift+Click drag
            this.disposables.add(
                listen(this.canvas, "mousedown", (e) => {
                    this.on_zone_selection_start(e);
                }),
            );

            this.disposables.add(
                listen(this.canvas, "mouseup", (e) => {
                    this.on_zone_selection_end(e);
                }),
            );

            // Handle mouse leaving the canvas during zone selection
            this.disposables.add(
                listen(this.canvas, "mouseleave", () => {
                    if (this.zone_selection_active) {
                        this.cancel_zone_selection();
                    }
                }),
            );
        }

        this.setup_finished.open();
    }

    protected on_viewport_change() {
        if (this.interactive) {
            this.draw();
        }
    }

    protected on_mouse_change(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const new_position = this.viewport.camera.screen_to_world(
            new Vec2(e.clientX - rect.left, e.clientY - rect.top),
        );

        if (
            this.mouse_position.x != new_position.x ||
            this.mouse_position.y != new_position.y
        ) {
            this.mouse_position.set(new_position);
            this.dispatchEvent(new KiCanvasMouseMoveEvent(this.mouse_position));
        }
    }

    public abstract load(src: any): Promise<void>;

    protected resolve_loaded(value: boolean) {
        if (value) {
            this.loaded.open();
            this.dispatchEvent(new KiCanvasLoadEvent());
        }
    }

    public abstract paint(): void;

    protected on_draw() {
        this.renderer.clear_canvas();

        if (!this.layers) {
            return;
        }

        // Render all layers in display order (back to front)
        let depth = 0.01;
        const camera = this.viewport.camera.matrix;
        const should_dim = this.layers.is_any_layer_highlighted();

        for (const layer of this.layers.in_display_order()) {
            if (layer.visible && layer.graphics) {
                let alpha = layer.opacity;

                if (should_dim && !layer.highlighted) {
                    alpha = 0.25;
                }

                layer.graphics.render(camera, depth, alpha);
                depth += 0.01;
            }
        }
    }

    public draw() {
        if (!this.viewport) {
            return;
        }

        window.requestAnimationFrame(() => {
            this.on_draw();
        });
    }

    protected on_pick(
        mouse: Vec2,
        items: ReturnType<ViewLayerSet["query_point"]>,
    ) {
        // Clear any existing zone selection
        this.zone_selected_items = [];
        this.zone_selected_bboxes = [];

        // Get the first item at this position
        for (const { layer: _layer, bbox } of items) {
            const item = bbox.context;
            if (item) {
                // Add single item to zone selection for consistent highlighting
                this.zone_selected_items.push(item);
                this.zone_selected_bboxes.push(bbox);
            }
            break;
        }

        // Also update the legacy selected property for compatibility
        if (this.zone_selected_bboxes.length > 0) {
            this.select(this.zone_selected_bboxes[0]!);
        } else {
            this.select(null);
        }

        // Repaint with the new selection
        this.paint_zone_selection();
        
        // Always dispatch zone selection event (including deselection)
        this.dispatch_zone_selection_event();
    }

    /**
     * Handle additive selection (Command/Ctrl+click)
     */
    protected on_pick_additive(
        _mouse: Vec2,
        items: ReturnType<ViewLayerSet["query_point"]>,
    ) {
        for (const { layer: _layer, bbox } of items) {
            // The item is stored in bbox.context
            const item = bbox.context;
            if (!item) continue;

            // Check if already selected
            const existingIndex = this.zone_selected_items.indexOf(item);
            if (existingIndex >= 0) {
                // Remove from selection (toggle)
                this.zone_selected_items.splice(existingIndex, 1);
                this.zone_selected_bboxes.splice(existingIndex, 1);
            } else {
                // Add to selection
                this.zone_selected_items.push(item);
                this.zone_selected_bboxes.push(bbox);
            }
            break; // Only handle first item at this position
        }

        // Repaint and dispatch event
        this.paint_zone_selection();
        this.dispatch_zone_selection_event();
    }

    /**
     * Clear zone/multi-selection
     */
    public clear_zone_selection() {
        if (this.zone_selected_items.length > 0) {
            this.zone_selected_items = [];
            this.zone_selected_bboxes = [];
            this.paint_zone_selection();
        }
    }

    public select(item: BBox | null) {
        this.selected = item;
    }

    public get selected(): BBox | null {
        return this.#selected;
    }

    public set selected(bb: BBox | null) {
        this._set_selected(bb);
    }

    @no_self_recursion
    private _set_selected(bb: BBox | null) {
        const previous = this.#selected;
        this.#selected = bb?.copy() || null;

        // Notify event listeners
        this.dispatchEvent(
            new KiCanvasSelectEvent({
                item: this.#selected?.context,
                previous: previous?.context,
            }),
        );

        later(() => this.paint_selected());
    }

    public get selection_color() {
        return Color.white;
    }

    protected paint_selected() {
        // Use the unified painting method that handles both single and zone selection
        this.paint_zone_selection();
    }

    abstract zoom_to_page(): void;

    zoom_to_selection() {
        if (!this.selected) {
            return;
        }
        this.viewport.camera.bbox = this.selected.grow(10);
        this.draw();
    }

    // Zone selection methods

    protected on_zone_selection_start(e: MouseEvent) {
        // Only start zone selection with Shift+Left click
        if (e.button !== 0 || !e.shiftKey) {
            return;
        }

        e.preventDefault();
        this.zone_selection_active = true;
        this.zone_start = this.mouse_position.copy();
        this.zone_current = this.mouse_position.copy();
        this.#zone_selection_box = null;
    }

    protected on_zone_selection_move(e: MouseEvent) {
        if (!this.zone_selection_active || !this.zone_start) {
            return;
        }

        this.zone_current = this.mouse_position.copy();
        this.#zone_selection_box = BBox.from_corners(
            this.zone_start.x,
            this.zone_start.y,
            this.zone_current.x,
            this.zone_current.y,
        );

        this.paint_zone_selection();
    }

    protected on_zone_selection_end(e: MouseEvent) {
        if (!this.zone_selection_active || !this.zone_start) {
            return;
        }

        if (e.button !== 0) {
            return;
        }

        this.zone_current = this.mouse_position.copy();
        this.#zone_selection_box = BBox.from_corners(
            this.zone_start.x,
            this.zone_start.y,
            this.zone_current.x,
            this.zone_current.y,
        );

        // Only trigger zone selection if the box is big enough
        if (
            this.#zone_selection_box.w > 1 &&
            this.#zone_selection_box.h > 1
        ) {
            this.complete_zone_selection();
        }

        this.cancel_zone_selection();
    }

    protected cancel_zone_selection() {
        this.zone_selection_active = false;
        this.zone_start = null;
        this.zone_current = null;
        this.#zone_selection_box = null;
        // Note: We do NOT clear zone_selected_items here - they should stay selected
        this.paint_zone_selection();
    }

    protected complete_zone_selection() {
        if (!this.#zone_selection_box) {
            return;
        }

        // Query all items within the zone
        const items = this.query_zone(this.#zone_selection_box);

        // Store selected items and get their bounding boxes
        this.zone_selected_items = items;
        this.zone_selected_bboxes = this.get_bboxes_for_items(items);

        // Clear the legacy selected property when doing zone selection
        this.#selected = null;

        // Repaint with the new selection (will be called again in cancel_zone_selection, but we need it here too)
        this.paint_zone_selection();

        // Dispatch the zone selection event
        this.dispatch_zone_selection_event();

        // Mark that zone selection just completed to prevent the subsequent
        // click event from modifying the selection
        this.#zone_selection_just_completed = true;
    }

    /**
     * Get bounding boxes for a list of items
     */
    protected get_bboxes_for_items(items: unknown[]): BBox[] {
        const bboxes: BBox[] = [];
        for (const item of items) {
            let found = false;
            // Search ALL layers, not just interactive ones, to find bboxes for items
            for (const layer of this.layers.in_order()) {
                if (layer.bboxes.has(item)) {
                    bboxes.push(layer.bboxes.get(item)!);
                    found = true;
                    break;
                }
            }
            // If not found in any layer, try the interactive layers query
            if (!found) {
                for (const bbox of this.layers.query_item_bboxes(item)) {
                    bboxes.push(bbox);
                    break;
                }
            }
        }
        return bboxes;
    }

    /**
     * Dispatch zone selection event with current selected items
     */
    protected dispatch_zone_selection_event() {
        const connections = this.analyze_connections(this.zone_selected_items);

        // Calculate bounding box for all selected items
        let bounds = { x: 0, y: 0, w: 0, h: 0 };
        if (this.zone_selected_bboxes.length > 0) {
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (const bbox of this.zone_selected_bboxes) {
                minX = Math.min(minX, bbox.x);
                minY = Math.min(minY, bbox.y);
                maxX = Math.max(maxX, bbox.x2);
                maxY = Math.max(maxY, bbox.y2);
            }
            bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        this.dispatchEvent(
            new KiCanvasZoneSelectEvent({
                items: this.zone_selected_items,
                bounds: bounds,
                connections: connections,
            }),
        );
    }

    /** Override in subclass to query items within a zone */
    protected query_zone(zone: BBox): unknown[] {
        const items: unknown[] = [];
        for (const layer of this.layers.interactive_layers()) {
            for (const [item, bbox] of layer.bboxes) {
                if (zone.contains(bbox) || this.bbox_intersects(zone, bbox)) {
                    items.push(item);
                }
            }
        }
        return items;
    }

    /** Check if two bboxes intersect */
    protected bbox_intersects(a: BBox, b: BBox): boolean {
        return !(
            a.x2 < b.x ||
            b.x2 < a.x ||
            a.y2 < b.y ||
            b.y2 < a.y
        );
    }

    /** Override in subclass to analyze connections between items */
    protected analyze_connections(_items: unknown[]): ZoneConnection[] {
        return [];
    }

    public get zone_selection_box(): BBox | null {
        return this.#zone_selection_box;
    }

    public get zone_selection_color() {
        return new Color(0.3, 0.8, 1, 1); // Cyan color for zone selection
    }

    protected paint_zone_selection() {
        const layer = this.layers.overlay;
        layer.clear();

        const hasContent =
            this.zone_selected_bboxes.length > 0 ||
            (this.#zone_selection_box && this.zone_selection_active);

        if (!hasContent) {
            this.draw();
            return;
        }

        // Start a single layer for all selection graphics
        this.renderer.start_layer(layer.name);

        // Paint all selected items with consistent cyan highlighting
        if (this.zone_selected_bboxes.length > 0) {
            const selectColor = this.zone_selection_color.with_alpha(0.3);
            const selectStroke = this.zone_selection_color;

            for (const bbox of this.zone_selected_bboxes) {
                const bb = bbox.copy().grow(Math.max(bbox.w, bbox.h) * 0.05);
                // Draw filled rectangle
                this.renderer.polygon(Polygon.from_BBox(bb, selectColor));
                // Draw border
                this.renderer.line(
                    Polyline.from_BBox(bb, 0.3, selectStroke),
                );
            }
        }

        // Paint zone selection box if actively dragging
        if (this.#zone_selection_box && this.zone_selection_active) {
            const zone_color = new Color(0.3, 0.7, 1, 0.2);
            const zone_stroke_color = new Color(0.3, 0.7, 1, 0.9);

            this.renderer.polygon(
                Polygon.from_BBox(this.#zone_selection_box, zone_color),
            );
            this.renderer.line(
                Polyline.from_BBox(
                    this.#zone_selection_box,
                    0.5,
                    zone_stroke_color,
                ),
            );
        }

        layer.graphics = this.renderer.end_layer();
        layer.graphics.composite_operation = "source-over";

        this.draw();
    }
}
