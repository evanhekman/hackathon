/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { SchematicSymbol, Wire } from "../../../kicad/schematic";
import {
    KiCanvasLoadEvent,
    KiCanvasZoneSelectEvent,
    type ZoneConnection,
} from "../../../viewers/base/events";
import { SchematicViewer } from "../../../viewers/schematic/viewer";

const MAX_VISIBLE_PINS = 8;

interface ZoneSymbolData {
    symbol: SchematicSymbol;
    reference: string;
    value: string;
    footprint: string;
    pins: { number: string; name: string }[];
}

interface ZoneSelectionData {
    symbols: ZoneSymbolData[];
    connections: ZoneConnection[];
    bounds: { x: number; y: number; w: number; h: number };
    wireCount: number;
    labelCount: number;
}

export class KCSchematicZonePanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            .zone-info {
                padding: 0.5em;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                margin-bottom: 0.5em;
                font-size: 0.85em;
            }

            .zone-info-label {
                color: rgba(255, 255, 255, 0.5);
                font-size: 0.75em;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .zone-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 0.5em;
                margin-top: 0.5em;
            }

            .zone-stat {
                text-align: center;
                padding: 0.5em;
                background: rgba(78, 205, 196, 0.1);
                border-radius: 4px;
            }

            .zone-stat-value {
                font-size: 1.5em;
                font-weight: bold;
                color: rgb(78, 205, 196);
            }

            .zone-stat-label {
                font-size: 0.7em;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
            }

            .symbol-list {
                display: flex;
                flex-direction: column;
                gap: 0.5em;
            }

            .symbol-item {
                padding: 0.75em;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s ease;
            }

            .symbol-item:hover {
                background: rgba(255, 206, 84, 0.1);
            }

            .symbol-header {
                display: flex;
                align-items: center;
                gap: 0.5em;
                margin-bottom: 0.25em;
            }

            .symbol-reference {
                font-family: "JetBrains Mono", "SF Mono", monospace;
                font-weight: bold;
                color: rgb(255, 206, 84);
            }

            .symbol-value {
                color: rgba(255, 255, 255, 0.9);
            }

            .symbol-footprint {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
            }

            .symbol-pins {
                margin-top: 0.5em;
                padding-top: 0.5em;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .symbol-pins-label {
                font-size: 0.75em;
                color: rgba(255, 255, 255, 0.5);
                margin-bottom: 0.25em;
            }

            .pin-list {
                display: flex;
                flex-wrap: wrap;
                gap: 0.25em;
            }

            .pin-item {
                font-size: 0.75em;
                padding: 0.15em 0.4em;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
            }

            .pin-number {
                color: rgb(78, 205, 196);
            }

            .pin-name {
                color: rgba(255, 255, 255, 0.7);
            }

            .connections-section {
                margin-top: 1em;
            }

            .connections-title {
                font-size: 0.9em;
                font-weight: bold;
                color: rgba(255, 255, 255, 0.8);
                margin-bottom: 0.5em;
                padding-bottom: 0.25em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }

            .connection-list {
                display: flex;
                flex-direction: column;
                gap: 0.25em;
            }

            .connection-item {
                display: flex;
                align-items: center;
                gap: 0.5em;
                padding: 0.5em;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 4px;
                font-size: 0.85em;
            }

            .connection-endpoint {
                display: flex;
                align-items: center;
                gap: 0.25em;
            }

            .connection-ref {
                font-family: "JetBrains Mono", "SF Mono", monospace;
                color: rgb(255, 206, 84);
            }

            .connection-pin {
                color: rgb(78, 205, 196);
            }

            .connection-arrow {
                color: rgba(255, 255, 255, 0.3);
            }

            .connection-net {
                margin-left: auto;
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
                background: rgba(255, 255, 255, 0.1);
                padding: 0.1em 0.4em;
                border-radius: 3px;
            }

            .empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2em;
                color: rgba(255, 255, 255, 0.5);
                text-align: center;
            }

            .empty-state-icon {
                font-size: 2.5em;
                margin-bottom: 0.5em;
                opacity: 0.5;
            }

            .empty-state-hint {
                font-size: 0.85em;
                margin-top: 0.5em;
                color: rgba(255, 255, 255, 0.4);
            }

            .hint-key {
                display: inline-block;
                padding: 0.1em 0.4em;
                background: rgba(255, 255, 255, 0.15);
                border-radius: 3px;
                font-family: "JetBrains Mono", "SF Mono", monospace;
                font-size: 0.9em;
            }

            .export-buttons {
                display: flex;
                gap: 0.5em;
                margin-top: 1em;
                padding-top: 0.5em;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }

            .export-button {
                flex: 1;
                padding: 0.5em;
                background: rgba(78, 205, 196, 0.2);
                border: 1px solid rgba(78, 205, 196, 0.3);
                border-radius: 4px;
                color: rgb(78, 205, 196);
                cursor: pointer;
                font-size: 0.85em;
                text-align: center;
                transition: all 0.2s ease;
            }

            .export-button:hover {
                background: rgba(78, 205, 196, 0.3);
                border-color: rgba(78, 205, 196, 0.5);
            }

            .scrollable {
                max-height: 400px;
                overflow-y: auto;
            }
        `,
    ];

    viewer: SchematicViewer;
    zoneData: ZoneSelectionData | null = null;

    override connectedCallback() {
        (async () => {
            this.viewer = await this.requestLazyContext("viewer");
            await this.viewer.loaded;
            super.connectedCallback();
            this.setup_events();
        })();
    }

    private setup_events() {
        // Listen for zone selection events
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasZoneSelectEvent.type, (e) => {
                this.on_zone_select(e);
            }),
        );

        // Clear zone data when schematic changes
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasLoadEvent.type, () => {
                this.zoneData = null;
                this.update();
            }),
        );

        // Handle clicks via event delegation
        this.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            
            // Handle symbol clicks
            const symbolItem = target.closest("[data-symbol-uuid]") as HTMLElement;
            if (symbolItem) {
                const uuid = symbolItem.dataset["symbolUuid"];
                if (uuid) {
                    this.viewer.select(uuid);
                }
                return;
            }
            
            // Handle action buttons
            const actionButton = target.closest("[data-action]") as HTMLElement;
            if (actionButton) {
                const action = actionButton.dataset["action"];
                if (action === "copy") {
                    this.copy_to_clipboard();
                } else if (action === "export") {
                    this.export_to_json();
                }
            }
        });
    }

    private on_zone_select(e: KiCanvasZoneSelectEvent) {
        const { items, bounds, connections } = e.detail;

        // If no items selected, clear the zone data (deselection)
        if (items.length === 0) {
            this.zoneData = null;
            this.update();
            return;
        }

        // Filter and process symbols
        const symbols: ZoneSymbolData[] = items
            .filter(
                (item): item is SchematicSymbol =>
                    item instanceof SchematicSymbol,
            )
            .map((symbol) => {
                const data = this.viewer.get_symbol_data(symbol);
                return {
                    symbol,
                    reference: data.reference,
                    value: data.value,
                    footprint: data.footprint,
                    pins: data.pins,
                };
            });

        // Count wires and labels
        const wireCount = items.filter(
            (item): item is Wire => item instanceof Wire,
        ).length;

        const labelCount = items.filter(
            (item) =>
                item !== null &&
                typeof item === "object" &&
                "text" in item &&
                "at" in item,
        ).length;

        this.zoneData = {
            symbols,
            connections,
            bounds,
            wireCount,
            labelCount,
        };

        this.update();

        // Dispatch custom event for external consumers
        this.dispatchEvent(
            new CustomEvent("zone-data-updated", {
                detail: this.zoneData,
                bubbles: true,
                composed: true,
            }),
        );
    }

    private export_to_json() {
        if (!this.zoneData) return;

        const exportData = {
            bounds: this.zoneData.bounds,
            symbols: this.zoneData.symbols.map((s) => ({
                reference: s.reference,
                value: s.value,
                footprint: s.footprint,
                pins: s.pins,
            })),
            connections: this.zoneData.connections,
            summary: {
                symbolCount: this.zoneData.symbols.length,
                wireCount: this.zoneData.wireCount,
                labelCount: this.zoneData.labelCount,
                connectionCount: this.zoneData.connections.length,
            },
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "zone-selection.json";
        a.click();
        URL.revokeObjectURL(url);
    }

    private copy_to_clipboard() {
        if (!this.zoneData) return;

        const text = this.zoneData.symbols
            .map((s) => `${s.reference}\t${s.value}\t${s.footprint}`)
            .join("\n");

        navigator.clipboard.writeText(text);
    }

    override render() {
        if (!this.zoneData) {
            return html`
                <kc-ui-panel>
                    <kc-ui-panel-title title="Zone Selection"></kc-ui-panel-title>
                    <kc-ui-panel-body>
                        <div class="empty-state">
                            <div class="empty-state-icon">◻️</div>
                            <div>No zone selected</div>
                            <div class="empty-state-hint">
                                Hold <span class="hint-key">Shift</span> and
                                drag to select a zone
                            </div>
                        </div>
                    </kc-ui-panel-body>
                </kc-ui-panel>
            `;
        }

        const { symbols, connections, wireCount, labelCount } = this.zoneData;

        const symbolItems = symbols.map(
            (s) => html`
                <div
                    class="symbol-item"
                    data-symbol-uuid="${s.symbol.uuid}">
                    <div class="symbol-header">
                        <span class="symbol-reference">${s.reference}</span>
                        <span class="symbol-value">${s.value}</span>
                    </div>
                    <div class="symbol-footprint">${s.footprint || "—"}</div>
                    ${s.pins.length > 0
                        ? html`
                              <div class="symbol-pins">
                                  <div class="symbol-pins-label">Pins:</div>
                                  <div class="pin-list">
                                      ${s.pins.slice(0, MAX_VISIBLE_PINS).map(
                                          (pin) => html`
                                              <span class="pin-item">
                                                  <span class="pin-number"
                                                      >${pin.number}</span
                                                  >
                                                  ${pin.name
                                                      ? html`<span
                                                            class="pin-name"
                                                            >:${pin.name}</span
                                                        >`
                                                      : null}
                                              </span>
                                          `,
                                      )}
                                      ${s.pins.length > MAX_VISIBLE_PINS
                                          ? html`<span class="pin-item"
                                                >+${s.pins.length - MAX_VISIBLE_PINS}
                                                more</span
                                            >`
                                          : null}
                                  </div>
                              </div>
                          `
                        : null}
                </div>
            `,
        );

        const connectionItems = connections.map(
            (c) => html`
                <div class="connection-item">
                    <span class="connection-endpoint">
                        <span class="connection-ref">${c.from}</span>
                        <span class="connection-pin">.${c.fromPin}</span>
                    </span>
                    <span class="connection-arrow">→</span>
                    <span class="connection-endpoint">
                        <span class="connection-ref">${c.to}</span>
                        <span class="connection-pin">.${c.toPin}</span>
                    </span>
                    ${c.netName
                        ? html`<span class="connection-net">${c.netName}</span>`
                        : null}
                </div>
            `,
        );

        return html`
            <kc-ui-panel>
                <kc-ui-panel-title title="Zone Selection"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <div class="zone-info">
                        <div class="zone-info-label">Selection Summary</div>
                        <div class="zone-stats">
                            <div class="zone-stat">
                                <div class="zone-stat-value">
                                    ${symbols.length}
                                </div>
                                <div class="zone-stat-label">Components</div>
                            </div>
                            <div class="zone-stat">
                                <div class="zone-stat-value">
                                    ${connections.length}
                                </div>
                                <div class="zone-stat-label">Connections</div>
                            </div>
                            <div class="zone-stat">
                                <div class="zone-stat-value">${wireCount}</div>
                                <div class="zone-stat-label">Wires</div>
                            </div>
                            <div class="zone-stat">
                                <div class="zone-stat-value">${labelCount}</div>
                                <div class="zone-stat-label">Labels</div>
                            </div>
                        </div>
                    </div>

                    <div class="scrollable">
                        ${symbols.length > 0
                            ? html`
                                  <div class="symbol-list">${symbolItems}</div>
                              `
                            : null}
                        ${connections.length > 0
                            ? html`
                                  <div class="connections-section">
                                      <div class="connections-title">
                                          Connections
                                      </div>
                                      <div class="connection-list">
                                          ${connectionItems}
                                      </div>
                                  </div>
                              `
                            : null}
                    </div>

                    <div class="export-buttons">
                        <button
                            class="export-button"
                            data-action="copy">
                            📋 Copy
                        </button>
                        <button
                            class="export-button"
                            data-action="export">
                            📥 Export JSON
                        </button>
                    </div>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
    }
}

window.customElements.define(
    "kc-schematic-zone-panel",
    KCSchematicZonePanelElement,
);
