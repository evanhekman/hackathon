/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { attribute, css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import {
    KiCanvasSelectEvent,
    KiCanvasZoneSelectEvent,
    type ZoneConnection,
} from "../../../viewers/base/events";
import type { Viewer } from "../../../viewers/base/viewer";
import "./grok-chat-panel";
import type { KCGrokChatPanelElement } from "./grok-chat-panel";

/** Item with a uuid property */
interface UuidItem {
    uuid: string;
}

/** Check if an item has a uuid property */
function hasUuid(item: unknown): item is UuidItem {
    return (
        item !== null &&
        typeof item === "object" &&
        "uuid" in item &&
        typeof (item as UuidItem).uuid === "string"
    );
}

/** Payload structure for Grok API request */
export interface GrokPayload {
    selectedItems: {
        uuid: string;
        type: string;
        reference?: string;
        value?: string;
    }[];
    connections: ZoneConnection[];
    bounds: { x: number; y: number; w: number; h: number };
    timestamp: number;
}

export class KCGrokButtonElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                position: absolute;
                top: 0.5em;
                right: 0.5em;
                z-index: 100;
                pointer-events: auto;
            }

            .grok-button {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 44px;
                height: 44px;
                padding: 8px;
                background: rgba(10, 10, 10, 0.9);
                border: 2px solid rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                overflow: visible;
            }

            .grok-button:hover {
                background: rgba(26, 26, 26, 0.95);
                border-color: rgba(255, 255, 255, 0.3);
                transform: scale(1.05);
            }

            .grok-button:active {
                transform: scale(0.98);
            }

            .grok-button .logo {
                width: 24px;
                height: 24px;
                object-fit: contain;
                filter: brightness(1);
                transition: filter 0.2s ease;
            }

            .grok-button:hover .logo {
                filter: brightness(1.1);
            }

            /* Glow effect when selection is active */
            :host([has-selection]) .grok-button {
                border-color: rgba(255, 255, 255, 0.5);
                box-shadow: 
                    0 0 10px rgba(255, 255, 255, 0.3),
                    0 0 20px rgba(255, 255, 255, 0.15),
                    0 0 30px rgba(255, 255, 255, 0.1);
                animation: glow-pulse 2s ease-in-out infinite;
            }

            @keyframes glow-pulse {
                0%, 100% {
                    border-color: rgba(255, 255, 255, 0.5);
                    box-shadow: 
                        0 0 10px rgba(255, 255, 255, 0.3),
                        0 0 20px rgba(255, 255, 255, 0.15),
                        0 0 30px rgba(255, 255, 255, 0.1);
                }
                50% {
                    border-color: rgba(255, 255, 255, 0.8);
                    box-shadow: 
                        0 0 15px rgba(255, 255, 255, 0.5),
                        0 0 30px rgba(255, 255, 255, 0.25),
                        0 0 45px rgba(255, 255, 255, 0.15),
                        inset 0 0 8px rgba(255, 255, 255, 0.1);
                }
            }

            /* Animated border gradient when has selection */
            :host([has-selection]) .grok-button::before {
                content: '';
                position: absolute;
                top: -3px;
                left: -3px;
                right: -3px;
                bottom: -3px;
                border-radius: 12px;
                background: linear-gradient(
                    90deg,
                    rgba(255, 255, 255, 0.8),
                    rgba(200, 200, 255, 0.6),
                    rgba(255, 255, 255, 0.8),
                    rgba(200, 200, 255, 0.6),
                    rgba(255, 255, 255, 0.8)
                );
                background-size: 200% 100%;
                animation: border-flow 3s linear infinite;
                z-index: -1;
                opacity: 0.6;
            }

            @keyframes border-flow {
                0% {
                    background-position: 0% 50%;
                }
                100% {
                    background-position: 200% 50%;
                }
            }

            /* Inner background to create border effect */
            :host([has-selection]) .grok-button::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                border-radius: 10px;
                background: rgba(10, 10, 10, 0.95);
                z-index: -1;
            }

            /* Tooltip */
            .tooltip {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                padding: 6px 10px;
                background: rgba(20, 20, 20, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                font-size: 12px;
                color: #ffffff;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }

            .grok-button:hover + .tooltip {
                opacity: 1;
            }

            /* Disabled state when no selection */
            :host(:not([has-selection])) .grok-button {
                opacity: 0.4;
                cursor: not-allowed;
            }

            :host(:not([has-selection])) .grok-button:hover {
                transform: none;
                background: rgba(10, 10, 10, 0.9);
                border-color: rgba(255, 255, 255, 0.15);
            }

            :host(:not([has-selection])) .grok-button:active {
                transform: none;
            }
        `,
    ];

    @attribute({ type: String })
    src: string = "./images/Grok_Logomark_Light.png";

    viewer: Viewer;
    #hasSelection: boolean = false;
    #selectedItems: unknown[] = [];
    #connections: ZoneConnection[] = [];
    #bounds: { x: number; y: number; w: number; h: number } = {
        x: 0,
        y: 0,
        w: 0,
        h: 0,
    };

    override initialContentCallback() {
        // Add click listener to button
        const button = this.renderRoot.querySelector(".grok-button");
        button?.addEventListener("click", (e) => {
            e.preventDefault();
            this.#onClick();
        });

        // Set up viewer context and event listeners asynchronously
        (async () => {
            try {
                this.viewer = await this.requestLazyContext("viewer");
                await this.viewer.loaded;

                // Listen for single selection events (for backward compatibility)
                this.addDisposable(
                    this.viewer.addEventListener(
                        KiCanvasSelectEvent.type,
                        (e) => {
                            // Single selection updates hasSelection indicator
                            // but zone select takes precedence for items
                            if (this.#selectedItems.length === 0) {
                                this.#hasSelection = !!e.detail.item;
                                if (e.detail.item) {
                                    this.#selectedItems = [e.detail.item];
                                }
                                this.#updateSelectionAttribute();
                            }
                        },
                    ),
                );

                // Listen for zone/multi-selection events
                this.addDisposable(
                    this.viewer.addEventListener(
                        KiCanvasZoneSelectEvent.type,
                        (e) => {
                            this.#selectedItems = e.detail.items;
                            this.#connections = e.detail.connections;
                            this.#bounds = e.detail.bounds;
                            this.#hasSelection = this.#selectedItems.length > 0;
                            this.#updateSelectionAttribute();
                        },
                    ),
                );
            } catch (err) {
                console.warn("Grok button: Could not get viewer context", err);
            }
        })();
    }

    #updateSelectionAttribute() {
        if (this.#hasSelection) {
            this.setAttribute("has-selection", "");
        } else {
            this.removeAttribute("has-selection");
        }
        
        // Update tooltip text
        const tooltip = this.renderRoot.querySelector(".tooltip");
        if (tooltip) {
            tooltip.textContent = this.#hasSelection 
                ? "Ask Grok AI about selection" 
                : "Select components to ask Grok";
        }
    }

    #buildPayload(): GrokPayload {
        const selectedItems = this.#selectedItems.map((item) => {
            const entry: GrokPayload["selectedItems"][0] = {
                uuid: hasUuid(item) ? item.uuid : "unknown",
                type: item?.constructor?.name ?? "unknown",
            };

            // Extract additional info for common types
            if (item && typeof item === "object") {
                if ("reference" in item && typeof item.reference === "string") {
                    entry.reference = item.reference;
                }
                if ("value" in item && typeof item.value === "string") {
                    entry.value = item.value;
                }
            }

            return entry;
        });

        return {
            selectedItems,
            connections: this.#connections,
            bounds: this.#bounds,
            timestamp: Date.now(),
        };
    }

    #onClick() {
        // Don't proceed if no selection
        if (!this.#hasSelection) {
            console.log("Grok button clicked but no selection - ignoring");
            return;
        }

        const payload = this.#buildPayload();

        // Log the payload to console
        console.log("=== GROK BUTTON CLICKED ===");
        console.log("Selected Items Count:", payload.selectedItems.length);
        console.log("Selected Item UIDs:", payload.selectedItems.map((i) => i.uuid));
        console.log("Full Payload:", payload);
        console.log("JSON Payload:", JSON.stringify(payload, null, 2));
        console.log("===========================");

        // Find or create chat panel
        let chatPanel = document.querySelector("kc-grok-chat-panel") as KCGrokChatPanelElement | null;
        
        if (!chatPanel) {
            // Use innerHTML to ensure proper custom element upgrade
            const container = document.createElement("div");
            container.innerHTML = "<kc-grok-chat-panel></kc-grok-chat-panel>";
            chatPanel = container.firstElementChild as KCGrokChatPanelElement;
            document.body.appendChild(chatPanel);
            // Wait for initialContentCallback to complete before showing
            // The base CustomElement runs it in an async IIFE, resolved after rAF
            requestAnimationFrame(() => chatPanel!.show());
        } else {
            // Panel already exists and is initialized, show immediately
            chatPanel.show();
        }

        // Dispatch event with payload for external consumers
        this.dispatchEvent(
            new CustomEvent("grok-click", {
                bubbles: true,
                composed: true,
                detail: {
                    hasSelection: this.#hasSelection,
                    payload: payload,
                },
            }),
        );
    }

    override render() {
        return html`
            <button class="grok-button">
                <img class="logo" src="${this.src}" alt="Grok AI" />
            </button>
            <div class="tooltip">Select components to ask Grok</div>
        `;
    }
}

window.customElements.define("kc-grok-button", KCGrokButtonElement);
