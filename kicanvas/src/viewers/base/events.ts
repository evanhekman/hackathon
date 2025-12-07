/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

class KiCanvasEvent<T> extends CustomEvent<T> {
    constructor(name: string, detail: T, bubbles = false) {
        super(name, { detail: detail, composed: true, bubbles: bubbles });
    }
}

export class KiCanvasLoadEvent extends KiCanvasEvent<null> {
    static readonly type = "kicanvas:load";

    constructor() {
        super(KiCanvasLoadEvent.type, null);
    }
}

interface SelectDetails {
    item: unknown;
    previous: unknown;
}

export class KiCanvasSelectEvent extends KiCanvasEvent<SelectDetails> {
    static readonly type = "kicanvas:select";

    constructor(detail: SelectDetails) {
        super(KiCanvasSelectEvent.type, detail, true);
    }
}

interface MouseMoveDetails {
    x: number;
    y: number;
}

export class KiCanvasMouseMoveEvent extends KiCanvasEvent<MouseMoveDetails> {
    static readonly type = "kicanvas:mousemove";

    constructor(detail: MouseMoveDetails) {
        super(KiCanvasMouseMoveEvent.type, detail, true);
    }
}

export interface HoverDetails {
    /** The item currently being hovered over (null if nothing) */
    item: unknown;
    /** Screen position for tooltip placement */
    screenX: number;
    screenY: number;
    /** World position */
    worldX: number;
    worldY: number;
}

export class KiCanvasHoverEvent extends KiCanvasEvent<HoverDetails> {
    static readonly type = "kicanvas:hover";

    constructor(detail: HoverDetails) {
        super(KiCanvasHoverEvent.type, detail, true);
    }
}

interface ZoneSelectDetails {
    /** The items (symbols, wires, etc.) within the selected zone */
    items: unknown[];
    /** The bounding box of the selection zone */
    bounds: { x: number; y: number; w: number; h: number };
    /** Connection data for the selected components */
    connections: ZoneConnection[];
}

export interface ZoneConnection {
    /** The source component reference */
    from: string;
    /** The source component pin */
    fromPin: string;
    /** The destination component reference */
    to: string;
    /** The destination component pin */
    toPin: string;
    /** The net name if available */
    netName?: string;
}

export class KiCanvasZoneSelectEvent extends KiCanvasEvent<ZoneSelectDetails> {
    static readonly type = "kicanvas:zoneselect";

    constructor(detail: ZoneSelectDetails) {
        super(KiCanvasZoneSelectEvent.type, detail, true);
    }
}

// Event maps for type safe addEventListener.

export interface KiCanvasEventMap {
    [KiCanvasLoadEvent.type]: KiCanvasLoadEvent;
    [KiCanvasSelectEvent.type]: KiCanvasSelectEvent;
    [KiCanvasMouseMoveEvent.type]: KiCanvasMouseMoveEvent;
    [KiCanvasZoneSelectEvent.type]: KiCanvasZoneSelectEvent;
    [KiCanvasHoverEvent.type]: KiCanvasHoverEvent;
}

declare global {
    interface WindowEventMap {
        [KiCanvasLoadEvent.type]: KiCanvasLoadEvent;
        [KiCanvasSelectEvent.type]: KiCanvasSelectEvent;
        [KiCanvasZoneSelectEvent.type]: KiCanvasZoneSelectEvent;
        [KiCanvasHoverEvent.type]: KiCanvasHoverEvent;
    }

    interface HTMLElementEventMap {
        [KiCanvasLoadEvent.type]: KiCanvasLoadEvent;
        [KiCanvasSelectEvent.type]: KiCanvasSelectEvent;
        [KiCanvasZoneSelectEvent.type]: KiCanvasZoneSelectEvent;
        [KiCanvasHoverEvent.type]: KiCanvasHoverEvent;
    }
}
