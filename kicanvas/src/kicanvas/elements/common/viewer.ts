/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { listen } from "../../../base/events";
import { attribute, html } from "../../../base/web-components";
import {
    KCUIComponentTooltip,
    KCUIElement,
    type TooltipData,
} from "../../../kc-ui";
import {
    KiCanvasHoverEvent,
    KiCanvasLoadEvent,
} from "../../../viewers/base/events";
import type { Viewer } from "../../../viewers/base/viewer";
import { Preferences, WithPreferences } from "../../preferences";
import type { ProjectPage } from "../../project";
import themes from "../../themes";

// Import tooltip component to register it
import "../../../kc-ui/component-tooltip";

/**
 * Basic element for wiring up a Viewer to the DOM.
 */
export abstract class KCViewerElement<
    ViewerT extends Viewer,
> extends WithPreferences(KCUIElement) {
    canvas: HTMLCanvasElement;
    viewer: ViewerT;
    selected: any[] = [];

    #tooltip: KCUIComponentTooltip | null = null;

    @attribute({ type: Boolean })
    loaded: boolean;

    @attribute({ type: String })
    theme: string;

    @attribute({ type: Boolean })
    disableinteraction: boolean;

    override initialContentCallback() {
        (async () => {
            this.viewer = this.addDisposable(this.make_viewer());

            await this.viewer.setup();

            this.addDisposable(
                this.viewer.addEventListener(KiCanvasLoadEvent.type, () => {
                    this.loaded = true;
                    this.dispatchEvent(new KiCanvasLoadEvent());
                }),
            );

            // Set up tooltip handling
            this.#setupTooltip();
        })();
    }

    #setupTooltip() {
        // Create tooltip element and add to document body for fixed positioning
        this.#tooltip = document.createElement(
            "kc-ui-component-tooltip",
        ) as KCUIComponentTooltip;
        document.body.appendChild(this.#tooltip);

        // Listen for hover events from the viewer
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasHoverEvent.type, (e) => {
                this.#onHover(e);
            }),
        );

        // Direct mousemove listener as fallback for immediate hover detection
        this.addDisposable(
            listen(this.canvas, "mousemove", (e: MouseEvent) => {
                // Update tooltip position if visible
                if (this.#tooltip?.visible) {
                    this.#tooltip.updatePosition(e.clientX, e.clientY);
                }
            }),
        );

        // Hide tooltip when mouse leaves canvas
        this.addDisposable(
            listen(this.canvas, "mouseleave", () => {
                this.#tooltip?.hide();
            }),
        );
    }

    #onHover(e: KiCanvasHoverEvent) {
        const { item, screenX, screenY } = e.detail;

        if (!item) {
            this.#tooltip?.hide();
            return;
        }

        // Extract tooltip data from the item
        const tooltipData = this.getTooltipData(item);
        if (tooltipData) {
            this.#tooltip?.show(tooltipData, screenX, screenY);
        } else {
            this.#tooltip?.hide();
        }
    }

    /**
     * Override in subclasses to provide type-specific tooltip data
     */
    protected getTooltipData(item: unknown): TooltipData | null {
        // Default implementation returns null
        // Subclasses should override to provide specific data
        return null;
    }

    override disconnectedCallback() {
        super.disconnectedCallback();
        this.selected = [];

        // Clean up tooltip
        if (this.#tooltip) {
            this.#tooltip.remove();
            this.#tooltip = null;
        }
    }

    override async preferenceChangeCallback(preferences: Preferences) {
        // Don't apply preference changes if the theme has been set via an attribute.
        if (this.theme || !this.viewer || !this.viewer.loaded) {
            return;
        }
        this.update_theme();
        this.viewer.paint();
        this.viewer.draw();
    }

    protected get themeObject() {
        // If the theme attribute is set, override preferences.
        if (this.theme) {
            return themes.by_name(this.theme);
        } else {
            return Preferences.INSTANCE.theme;
        }
    }

    protected abstract update_theme(): void;

    protected abstract make_viewer(): ViewerT;

    async load(src: ProjectPage) {
        this.loaded = false;
        await this.viewer.load(src.document);
    }

    override render() {
        this.canvas = html`<canvas></canvas>` as HTMLCanvasElement;

        return html`<style>
                :host {
                    display: block;
                    touch-action: none;
                    width: 100%;
                    height: 100%;
                }

                canvas {
                    width: 100%;
                    height: 100%;
                }
            </style>
            ${this.canvas}`;
    }
}
