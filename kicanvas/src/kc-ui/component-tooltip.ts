/*
    Copyright (c) 2024 KiCanvas Contributors.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { css, html } from "../base/web-components";
import { KCUIElement } from "./element";

export interface TooltipData {
    /** Component type (Symbol, Sheet, Wire, etc.) */
    type: string;
    /** Component reference designator (R1, C2, U3) */
    reference?: string;
    /** Component value (10k, 100nF, LM7805) */
    value?: string;
    /** Library description of the component */
    description?: string;
    /** Datasheet URL if available */
    datasheet?: string;
    /** Manufacturer name */
    manufacturer?: string;
    /** Manufacturer part number */
    partNumber?: string;
    /** Package type from footprint */
    package?: string;
    /** Net or signal name */
    netName?: string;
    /** Sheet name for hierarchical sheets */
    sheetName?: string;
    /** Number of pins */
    pinCount?: number;
    /** Whether component is in BOM */
    inBom?: boolean;
    /** Whether component is placed on board */
    onBoard?: boolean;
    /** Do Not Populate flag */
    dnp?: boolean;
    /** Additional key properties as key-value pairs */
    extras?: Array<{ key: string; value: string }>;
}

/**
 * A tooltip component for displaying schematic component information.
 * Styled to match the KiCanvas dark theme.
 */
export class KCUIComponentTooltip extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transform: translateY(4px) scale(0.98);
                transition:
                    opacity 0.12s ease-out,
                    transform 0.12s ease-out;
            }

            :host([visible]) {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            .tooltip {
                background: #0a0a0a;
                color: #ffffff;
                border: 1px solid #222;
                border-radius: 6px;
                padding: 10px 14px;
                font-size: 12px;
                font-family: inherit;
                min-width: 160px;
                max-width: 320px;
                box-shadow:
                    0 8px 32px rgba(0, 0, 0, 0.5),
                    0 2px 8px rgba(0, 0, 0, 0.3);
            }

            .header {
                display: flex;
                align-items: baseline;
                gap: 10px;
                margin-bottom: 2px;
            }

            .reference {
                font-size: 16px;
                font-weight: 700;
                color: #fff;
                letter-spacing: 0.02em;
            }

            .value {
                font-size: 14px;
                color: rgba(255, 206, 84, 1);
                font-weight: 600;
            }

            .description {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.55);
                line-height: 1.4;
                margin-top: 4px;
            }

            .divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.1);
                margin: 8px 0;
            }

            .info-grid {
                display: grid;
                grid-template-columns: auto 1fr;
                gap: 3px 10px;
                font-size: 11px;
            }

            .info-label {
                color: rgba(255, 255, 255, 0.4);
            }

            .info-value {
                color: rgba(255, 255, 255, 0.85);
                font-weight: 500;
            }

            .info-value.link {
                color: #60a5fa;
            }

            .net-name {
                font-size: 14px;
                color: #4ade80;
                font-weight: 600;
                font-family: ui-monospace, monospace;
            }

            .badges {
                display: flex;
                gap: 6px;
                margin-top: 8px;
            }

            .badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .badge.dnp {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .badge.no-bom {
                background: rgba(251, 191, 36, 0.15);
                color: rgba(251, 191, 36, 0.9);
                border: 1px solid rgba(251, 191, 36, 0.25);
            }

            .badge.no-board {
                background: rgba(156, 163, 175, 0.15);
                color: rgba(156, 163, 175, 0.9);
                border: 1px solid rgba(156, 163, 175, 0.25);
            }

            .type-label {
                font-size: 9px;
                color: rgba(255, 255, 255, 0.35);
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 4px;
            }

            .sheet-info {
                font-size: 13px;
                color: rgba(255, 255, 255, 0.8);
            }

            .wire-label {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.5);
            }
        `,
    ];

    #data: TooltipData | null = null;
    #visible = false;

    get visible() {
        return this.#visible;
    }

    /**
     * Show the tooltip with the given data at the specified position
     */
    async show(data: TooltipData, x: number, y: number) {
        this.#data = data;
        this.#visible = true;

        // Wait for render to complete before positioning
        await this.update();

        this.#positionTooltip(x, y);
        this.setAttribute("visible", "");
    }

    #positionTooltip(x: number, y: number) {
        const offsetX = 14;
        const offsetY = 14;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = this.getBoundingClientRect();

        let posX = x + offsetX;
        let posY = y + offsetY;

        // Flip if overflowing
        if (posX + rect.width > vw - 16) {
            posX = x - rect.width - offsetX;
        }
        if (posY + rect.height > vh - 16) {
            posY = y - rect.height - offsetY;
        }

        // Clamp to viewport
        posX = Math.max(8, Math.min(posX, vw - rect.width - 8));
        posY = Math.max(8, Math.min(posY, vh - rect.height - 8));

        this.style.left = `${posX}px`;
        this.style.top = `${posY}px`;
    }

    /**
     * Update position while visible
     */
    updatePosition(x: number, y: number) {
        if (this.#visible) {
            this.#positionTooltip(x, y);
        }
    }

    /**
     * Hide the tooltip
     */
    hide() {
        this.#visible = false;
        this.removeAttribute("visible");
    }

    override render() {
        if (!this.#data) {
            return html`<div class="tooltip"></div>`;
        }

        const data = this.#data;

        // For labels/wires with net names
        if (data.netName && !data.reference) {
            return html`
                <div class="tooltip">
                    <div class="type-label">${data.type}</div>
                    <div class="net-name">${data.netName}</div>
                </div>
            `;
        }

        // For sheets
        if (data.sheetName) {
            return html`
                <div class="tooltip">
                    <div class="type-label">${data.type}</div>
                    <div class="sheet-info">${data.sheetName}</div>
                </div>
            `;
        }

        // For wires without net
        if (data.type === "Wire" && !data.netName) {
            return html`
                <div class="tooltip">
                    <div class="wire-label">Wire segment</div>
                </div>
            `;
        }

        // For symbols/components - build info grid
        const infoRows: HTMLElement[] = [];

        // Package/Footprint
        if (data.package) {
            infoRows.push(html`
                <span class="info-label">Package</span>
                <span class="info-value">${data.package}</span>
            ` as HTMLElement);
        }

        // Manufacturer
        if (data.manufacturer) {
            infoRows.push(html`
                <span class="info-label">Mfr</span>
                <span class="info-value">${data.manufacturer}</span>
            ` as HTMLElement);
        }

        // Part Number
        if (data.partNumber) {
            infoRows.push(html`
                <span class="info-label">P/N</span>
                <span class="info-value">${data.partNumber}</span>
            ` as HTMLElement);
        }

        // Datasheet indicator
        if (data.datasheet && data.datasheet !== "~" && data.datasheet !== "") {
            infoRows.push(html`
                <span class="info-label">Datasheet</span>
                <span class="info-value link">Available</span>
            ` as HTMLElement);
        }

        // Pin count for complex components
        if (data.pinCount !== undefined && data.pinCount > 2) {
            infoRows.push(html`
                <span class="info-label">Pins</span>
                <span class="info-value">${data.pinCount}</span>
            ` as HTMLElement);
        }

        // Extra properties
        if (data.extras) {
            for (const extra of data.extras) {
                infoRows.push(html`
                    <span class="info-label">${extra.key}</span>
                    <span class="info-value">${extra.value}</span>
                ` as HTMLElement);
            }
        }

        // Badges
        const badges: HTMLElement[] = [];
        if (data.dnp) {
            badges.push(html`<span class="badge dnp">DNP</span>` as HTMLElement);
        }
        if (data.inBom === false) {
            badges.push(html`<span class="badge no-bom">Not in BOM</span>` as HTMLElement);
        }
        if (data.onBoard === false) {
            badges.push(html`<span class="badge no-board">Not on PCB</span>` as HTMLElement);
        }

        const hasInfo = infoRows.length > 0;
        const hasBadges = badges.length > 0;

        return html`
            <div class="tooltip">
                <div class="header">
                    ${data.reference ? html`<span class="reference">${data.reference}</span>` : null}
                    ${data.value ? html`<span class="value">${data.value}</span>` : null}
                </div>
                ${data.description ? html`<div class="description">${data.description}</div>` : null}
                ${hasInfo ? html`<div class="divider"></div><div class="info-grid">${infoRows}</div>` : null}
                ${hasBadges ? html`<div class="badges">${badges}</div>` : null}
            </div>
        `;
    }
}

window.customElements.define("kc-ui-component-tooltip", KCUIComponentTooltip);
