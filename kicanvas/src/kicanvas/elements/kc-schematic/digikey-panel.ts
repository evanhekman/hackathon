/*
    DigiKey Part Information Panel
    Shows DigiKey part data when a component is selected, including
    availability, pricing, and most importantly - obsolescence status.
*/

import { css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { SchematicSymbol } from "../../../kicad/schematic";
import {
    KiCanvasLoadEvent,
    KiCanvasSelectEvent,
} from "../../../viewers/base/events";
import { SchematicViewer } from "../../../viewers/schematic/viewer";
import type {
    DigiKeyPartInfo,
    DigiKeySearchResponse,
    GrokObsoleteReplacementResponse,
} from "../../services/api";
import { GrokiAPI } from "../../services/api";

type SearchState = "idle" | "loading" | "success" | "error" | "not_configured";
type ReplacementState = "idle" | "loading" | "success" | "error";

export class KCSchematicDigiKeyPanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                display: block;
                height: 100%;
            }

            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2em;
                color: var(--panel-subtitle-fg);
            }

            .loading-spinner {
                width: 24px;
                height: 24px;
                border: 3px solid var(--panel-subtitle-bg);
                border-top-color: var(--accent);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 0.5em;
            }

            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }

            .error-message {
                padding: 1em;
                color: #f87171;
                background: rgba(248, 113, 113, 0.1);
                border-radius: 4px;
                margin: 0.5em;
                font-size: 0.9em;
            }

            .not-configured {
                padding: 1em;
                color: #fbbf24;
                background: rgba(251, 191, 36, 0.1);
                border-radius: 4px;
                margin: 0.5em;
                font-size: 0.9em;
            }

            .part-card {
                border: 1px solid var(--panel-subtitle-bg);
                border-radius: 6px;
                margin: 0.5em;
                overflow: hidden;
            }

            .part-header {
                padding: 0.75em;
                background: var(--panel-subtitle-bg);
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 0.5em;
            }

            .part-mpn {
                font-weight: 600;
                font-size: 1.1em;
                color: var(--panel-fg);
                word-break: break-word;
            }

            .part-manufacturer {
                font-size: 0.85em;
                color: var(--panel-subtitle-fg);
                margin-top: 0.25em;
            }

            .status-badge {
                flex-shrink: 0;
                padding: 0.25em 0.5em;
                border-radius: 4px;
                font-size: 0.75em;
                font-weight: 600;
                text-transform: uppercase;
            }

            .status-active {
                background: rgba(34, 197, 94, 0.2);
                color: #22c55e;
            }

            .status-obsolete {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .status-nrnd {
                background: rgba(251, 191, 36, 0.2);
                color: #fbbf24;
            }

            .status-unknown {
                background: rgba(156, 163, 175, 0.2);
                color: #9ca3af;
            }

            .status-section {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 0.25em;
                flex-shrink: 0;
            }

            .part-body {
                padding: 0.75em;
            }

            .part-description {
                font-size: 0.9em;
                color: var(--panel-fg);
                margin-bottom: 0.75em;
                line-height: 1.4;
            }

            .part-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 0.5em;
                margin-bottom: 0.75em;
            }

            .stat-item {
                display: flex;
                flex-direction: column;
            }

            .stat-label {
                font-size: 0.75em;
                color: var(--panel-subtitle-fg);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .stat-value {
                font-size: 0.95em;
                font-weight: 500;
                color: var(--panel-fg);
            }

            .stat-value.in-stock {
                color: #22c55e;
            }

            .stat-value.low-stock {
                color: #fbbf24;
            }

            .stat-value.out-of-stock {
                color: #ef4444;
            }

            .part-links {
                display: flex;
                gap: 0.5em;
                flex-wrap: wrap;
            }

            .part-link {
                display: inline-flex;
                align-items: center;
                gap: 0.25em;
                padding: 0.4em 0.75em;
                background: var(--button-bg, #374151);
                color: var(--button-fg, #e5e7eb);
                text-decoration: none;
                border-radius: 4px;
                font-size: 0.85em;
                transition: background 0.15s;
            }

            .part-link:hover {
                background: var(--button-hover-bg, #4b5563);
            }

            .part-link kc-ui-icon {
                font-size: 1.1em;
            }

            .parameters-section {
                margin-top: 0.75em;
                border-top: 1px solid var(--panel-subtitle-bg);
                padding-top: 0.75em;
            }

            .parameters-title {
                font-size: 0.8em;
                color: var(--panel-subtitle-fg);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 0.5em;
            }

            .parameters-grid {
                display: grid;
                gap: 0.25em;
            }

            .parameter-row {
                display: flex;
                justify-content: space-between;
                font-size: 0.85em;
                padding: 0.2em 0;
            }

            .parameter-name {
                color: var(--panel-subtitle-fg);
            }

            .parameter-value {
                color: var(--panel-fg);
                font-weight: 500;
                text-align: right;
            }

            .no-results {
                padding: 1em;
                text-align: center;
                color: var(--panel-subtitle-fg);
            }

            .part-photo {
                width: 60px;
                height: 60px;
                object-fit: contain;
                background: #fff;
                border-radius: 4px;
                margin-right: 0.75em;
            }

            .part-header-content {
                flex: 1;
                min-width: 0;
            }

            .part-header-left {
                display: flex;
                align-items: flex-start;
                flex: 1;
                min-width: 0;
            }

            .refresh-button {
                display: inline-flex;
                align-items: center;
                gap: 0.25em;
                padding: 0.4em 0.75em;
                background: var(--button-bg, #374151);
                color: var(--button-fg, #e5e7eb);
                border: none;
                border-radius: 4px;
                font-size: 0.85em;
                cursor: pointer;
                transition: background 0.15s;
            }

            .refresh-button:hover {
                background: var(--button-hover-bg, #4b5563);
            }

            .selected-part-info {
                padding: 0.5em;
                margin: 0.5em;
                background: var(--panel-subtitle-bg);
                border-radius: 4px;
                font-size: 0.9em;
            }

            .selected-part-info strong {
                color: var(--panel-fg);
            }

            /* Grok Replacement Button & Panel Styles */
            .grok-button {
                display: inline-flex;
                align-items: center;
                gap: 0.3em;
                padding: 0.2em 0.5em;
                margin-top: 0.35em;
                background: rgba(233, 69, 96, 0.15);
                border: 1px solid rgba(233, 69, 96, 0.4);
                border-radius: 4px;
                color: #e94560;
                font-size: 0.7em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .grok-button:hover {
                background: rgba(233, 69, 96, 0.25);
                border-color: #e94560;
            }

            .grok-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .grok-button kc-ui-icon {
                font-size: 1em;
            }

            .grok-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 1.5em;
                gap: 0.75em;
            }

            .grok-loading-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid #16213e;
                border-top-color: #e94560;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            .grok-loading-text {
                color: #e94560;
                font-size: 0.9em;
                text-align: center;
            }

            .replacement-panel {
                margin-top: 0.75em;
                border: 1px solid #0f3460;
                border-radius: 6px;
                overflow: hidden;
                background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            }

            .replacement-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.6em 0.75em;
                background: rgba(233, 69, 96, 0.1);
                border-bottom: 1px solid #0f3460;
            }

            .replacement-title {
                display: flex;
                align-items: center;
                gap: 0.5em;
                color: #e94560;
                font-weight: 600;
                font-size: 0.9em;
            }

            .replacement-close {
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                padding: 0.25em;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.15s;
            }

            .replacement-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .replacement-body {
                padding: 0.75em;
                max-height: 400px;
                overflow-y: auto;
            }

            .replacement-content {
                font-size: 0.85em;
                line-height: 1.6;
                color: var(--panel-fg);
            }

            .replacement-content .grok-h1 {
                color: #e94560;
                margin: 0.75em 0 0.5em 0;
                font-size: 1.2em;
                font-weight: 700;
                border-bottom: 1px solid rgba(233, 69, 96, 0.3);
                padding-bottom: 0.25em;
            }

            .replacement-content .grok-h2 {
                color: #e94560;
                margin: 0.75em 0 0.4em 0;
                font-size: 1.1em;
                font-weight: 600;
            }

            .replacement-content .grok-h3 {
                color: #fbbf24;
                margin: 0.6em 0 0.3em 0;
                font-size: 1em;
                font-weight: 600;
            }

            .replacement-content .grok-h4 {
                color: #9ca3af;
                margin: 0.5em 0 0.25em 0;
                font-size: 0.95em;
                font-weight: 600;
            }

            .replacement-content .grok-h1:first-child,
            .replacement-content .grok-h2:first-child {
                margin-top: 0;
            }

            .replacement-content .grok-link {
                color: #60a5fa;
                text-decoration: none;
                border-bottom: 1px dotted rgba(96, 165, 250, 0.5);
                transition: all 0.15s;
            }

            .replacement-content .grok-link:hover {
                color: #93c5fd;
                border-bottom-color: #93c5fd;
            }

            .replacement-content .citation-link {
                color: #22c55e;
                text-decoration: none;
                font-size: 0.8em;
                font-weight: 600;
                padding: 0 0.1em;
            }

            .replacement-content .citation-link:hover {
                color: #4ade80;
                text-decoration: underline;
            }

            .replacement-content sup {
                line-height: 0;
            }

            .replacement-content ul,
            .replacement-content ol {
                margin: 0.4em 0;
                padding-left: 1.25em;
            }

            .replacement-content li {
                margin: 0.2em 0;
            }

            .replacement-content strong {
                color: #fbbf24;
            }

            .replacement-error {
                padding: 1em;
                color: #f87171;
                background: rgba(248, 113, 113, 0.1);
                border-radius: 4px;
                font-size: 0.9em;
            }
        `,
    ];

    viewer: SchematicViewer;
    selected_item?: SchematicSymbol;
    search_state: SearchState = "idle";
    search_result?: DigiKeySearchResponse;
    digikey_configured = false;
    
    // Grok replacement state
    replacement_state: ReplacementState = "idle";
    replacement_result?: GrokObsoleteReplacementResponse;
    replacement_part?: DigiKeyPartInfo;
    loading_message_index = 0;
    loading_interval?: number;

    override connectedCallback() {
        (async () => {
            this.viewer = await this.requestLazyContext("viewer");
            await this.viewer.loaded;
            super.connectedCallback();
            this.setup_events();
            await this.check_configuration();
        })();
    }

    override disconnectedCallback() {
        super.disconnectedCallback();
        // Clean up any running loading animation interval
        this.stop_loading_animation();
    }

    private async check_configuration() {
        const status = await GrokiAPI.getDigiKeyStatus();
        this.digikey_configured = status.configured;
        if (!status.configured) {
            this.search_state = "not_configured";
        }
        this.update();
    }

    override renderedCallback() {
        // Bind retry button click after each render
        const retryBtn = this.renderRoot.querySelector("#retry-btn");
        if (retryBtn) {
            retryBtn.addEventListener("click", () => this.search_for_part());
        }

        // Bind Grok replacement buttons
        const grokButtons =
            this.renderRoot.querySelectorAll(".grok-button");
        grokButtons.forEach((btn) => {
            const partIndex = btn.getAttribute("data-part-index");
            if (partIndex !== null && this.search_result?.parts) {
                const part = this.search_result.parts[parseInt(partIndex, 10)];
                if (part) {
                    btn.addEventListener("click", () =>
                        this.find_replacement(part),
                    );
                }
            }
        });

        // Bind close buttons for replacement panel
        const closeButtons = this.renderRoot.querySelectorAll(
            ".replacement-close",
        );
        closeButtons.forEach((btn) => {
            btn.addEventListener("click", () => this.close_replacement_panel());
        });
    }

    private setup_events() {
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasSelectEvent.type, (e) => {
                const item = e.detail.item;
                if (item instanceof SchematicSymbol) {
                    this.selected_item = item;
                    if (this.digikey_configured) {
                        this.search_for_part();
                    }
                } else {
                    this.selected_item = undefined;
                    this.search_result = undefined;
                    this.search_state = this.digikey_configured
                        ? "idle"
                        : "not_configured";
                }
                this.update();
            }),
        );

        this.addDisposable(
            this.viewer.addEventListener(KiCanvasLoadEvent.type, () => {
                this.selected_item = undefined;
                this.search_result = undefined;
                this.search_state = this.digikey_configured
                    ? "idle"
                    : "not_configured";
                this.update();
            }),
        );
    }

    private async search_for_part() {
        if (!this.selected_item || !this.digikey_configured) return;

        // Try to extract a useful search query from the component
        const mpn = this.extract_mpn(this.selected_item);
        if (!mpn) {
            this.search_state = "idle";
            this.search_result = undefined;
            this.update();
            return;
        }

        this.search_state = "loading";
        this.update();

        try {
            // Search by MPN first for better results
            this.search_result = await GrokiAPI.searchDigiKey(mpn, mpn);

            if (this.search_result.success) {
                this.search_state = "success";
            } else {
                this.search_state = "error";
            }
        } catch {
            this.search_state = "error";
            this.search_result = {
                query: mpn,
                success: false,
                error: "Failed to search DigiKey",
                parts: [],
                total_count: 0,
            };
        }

        this.update();
    }

    private extract_mpn(symbol: SchematicSymbol): string | null {
        // Try common property names for manufacturer part number
        const mpn_properties = [
            "MPN",
            "Manufacturer Part Number",
            "PartNumber",
            "Part Number",
            "Part_Number",
            "Part",
            "Value",
            "Mfr. #",
            "Mfr Part #",
        ];

        for (const prop_name of mpn_properties) {
            const prop = symbol.properties.get(prop_name);
            if (prop?.text && prop.text.trim() && prop.text !== "~") {
                return prop.text.trim();
            }
        }

        // Fall back to lib_id or lib_name if no MPN found
        if (symbol.lib_name && symbol.lib_name !== "~") {
            return symbol.lib_name;
        }

        return null;
    }

    private get_status_class(part: DigiKeyPartInfo): string {
        if (part.is_obsolete) return "status-obsolete";
        const status = (part.product_status || "").toLowerCase();
        if (
            status.includes("active") ||
            status.includes("in production")
        ) {
            return "status-active";
        }
        if (
            status.includes("not recommended") ||
            status.includes("nrnd") ||
            status.includes("last time buy")
        ) {
            return "status-nrnd";
        }
        return "status-unknown";
    }

    private get_status_text(part: DigiKeyPartInfo): string {
        if (part.is_obsolete) return "Obsolete";
        const status = part.lifecycle_status || part.product_status;
        if (!status) return "Unknown";
        // Shorten common statuses
        if (status.toLowerCase().includes("active")) return "Active";
        if (status.toLowerCase().includes("not recommended"))
            return "NRND";
        return status;
    }

    private get_stock_class(qty: number | null): string {
        if (qty === null) return "";
        if (qty === 0) return "out-of-stock";
        if (qty < 100) return "low-stock";
        return "in-stock";
    }

    private format_price(price: number | null): string {
        if (price === null) return "—";
        return `$${price.toFixed(4)}`;
    }

    private format_stock(qty: number | null): string {
        if (qty === null) return "—";
        if (qty === 0) return "Out of Stock";
        return qty.toLocaleString();
    }

    private static LOADING_MESSAGES = [
        "Analyzing part specifications...",
        "Researching datasheet...",
        "Searching for compatible replacements...",
        "Checking distributor availability...",
        "Comparing specifications...",
        "Evaluating pin compatibility...",
        "Finding best matches...",
        "Compiling recommendations...",
    ];

    private start_loading_animation() {
        this.loading_message_index = 0;
        this.loading_interval = window.setInterval(() => {
            this.loading_message_index =
                (this.loading_message_index + 1) %
                KCSchematicDigiKeyPanelElement.LOADING_MESSAGES.length;
            // Update text directly to avoid re-rendering spinner (which resets animation)
            const textEl = this.renderRoot.querySelector(".grok-loading-text");
            if (textEl) {
                textEl.textContent =
                    KCSchematicDigiKeyPanelElement.LOADING_MESSAGES[
                        this.loading_message_index
                    ] ?? "";
            }
        }, 2500);
    }

    private stop_loading_animation() {
        if (this.loading_interval) {
            clearInterval(this.loading_interval);
            this.loading_interval = undefined;
        }
    }

    private async find_replacement(part: DigiKeyPartInfo) {
        this.replacement_state = "loading";
        this.replacement_part = part;
        this.replacement_result = undefined;
        this.start_loading_animation();
        this.update();

        try {
            this.replacement_result =
                await GrokiAPI.findObsoleteReplacement(part);

            if (this.replacement_result.success) {
                this.replacement_state = "success";
            } else {
                this.replacement_state = "error";
            }
        } catch {
            this.replacement_state = "error";
            this.replacement_result = {
                original_part: part.manufacturer_part_number || "Unknown",
                analysis: "",
                success: false,
                error: "Failed to connect to Grok AI",
            };
        }

        this.stop_loading_animation();
        this.update();
    }

    private close_replacement_panel() {
        this.replacement_state = "idle";
        this.replacement_result = undefined;
        this.replacement_part = undefined;
        this.update();
    }

    private get_part_index(part: DigiKeyPartInfo): number {
        if (!this.search_result?.parts) return -1;
        return this.search_result.parts.indexOf(part);
    }

    private render_replacement_panel() {
        if (this.replacement_state === "idle") {
            return "";
        }

        if (this.replacement_state === "loading") {
            const loadingMessage =
                KCSchematicDigiKeyPanelElement.LOADING_MESSAGES[
                    this.loading_message_index
                ];
            return html`
                <div class="replacement-panel">
                    <div class="replacement-header">
                        <span class="replacement-title">
                            <kc-ui-icon>psychology</kc-ui-icon>
                            Grok AI
                        </span>
                    </div>
                    <div class="grok-loading">
                        <div class="grok-loading-spinner"></div>
                        <div class="grok-loading-part">
                            ${this.replacement_part?.manufacturer_part_number ||
                            "Part"}
                        </div>
                        <div class="grok-loading-text">${loadingMessage}</div>
                        <div class="grok-loading-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.replacement_state === "error") {
            return html`
                <div class="replacement-panel">
                    <div class="replacement-header">
                        <span class="replacement-title">
                            <kc-ui-icon>psychology</kc-ui-icon>
                            Grok AI
                        </span>
                        <button class="replacement-close">
                            <kc-ui-icon>close</kc-ui-icon>
                        </button>
                    </div>
                    <div class="replacement-body">
                        <div class="replacement-error">
                            <strong>Error</strong>
                            <p>
                                ${this.replacement_result?.error ||
                                "Unknown error occurred"}
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        // Success state - render the analysis with markdown-like formatting
        const analysis = this.replacement_result?.analysis || "";
        const formattedAnalysis = this.format_analysis(analysis);

        return html`
            <div class="replacement-panel">
                <div class="replacement-header">
                    <span class="replacement-title">
                        <kc-ui-icon>psychology</kc-ui-icon>
                        Grok Recommends
                    </span>
                    <button class="replacement-close">
                        <kc-ui-icon>close</kc-ui-icon>
                    </button>
                </div>
                <div class="replacement-body">
                    <div class="replacement-content">${formattedAnalysis}</div>
                </div>
            </div>
        `;
    }

    private format_analysis(text: string): HTMLElement {
        // Create a container div
        const container = document.createElement("div");

        // Convert markdown-like text to HTML
        let formatted = text;

        // Handle headers (must do before other processing)
        formatted = formatted
            .replace(/^#### (.+)$/gm, '<h4 class="grok-h4">$1</h4>')
            .replace(/^### (.+)$/gm, '<h3 class="grok-h3">$1</h3>')
            .replace(/^## (.+)$/gm, '<h2 class="grok-h2">$1</h2>')
            .replace(/^# (.+)$/gm, '<h1 class="grok-h1">$1</h1>');

        // Handle bold
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        // Handle citation-style links first: [[1]](url) -> superscript link
        formatted = formatted.replace(
            /\[\[(\d+)\]\]\(([^)]+)\)/g,
            '<sup><a href="$2" target="_blank" rel="noopener noreferrer" class="citation-link">[$1]</a></sup>',
        );

        // Handle standard markdown links: [text](url)
        formatted = formatted.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" class="grok-link">$1</a>',
        );

        // Handle plain URLs (but not already in href)
        formatted = formatted.replace(
            /(?<!href=")(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="grok-link">$1</a>',
        );

        // Handle bullet points with proper list wrapping
        const lines = formatted.split("\n");
        let inList = false;
        let listType = "";
        const processedLines: string[] = [];

        for (const line of lines) {
            const bulletMatch = line.match(/^(\s*)- (.+)$/);
            const numberMatch = line.match(/^(\s*)(\d+)\. (.+)$/);

            if (bulletMatch) {
                if (!inList || listType !== "ul") {
                    if (inList) processedLines.push(`</${listType}>`);
                    processedLines.push("<ul>");
                    inList = true;
                    listType = "ul";
                }
                processedLines.push(`<li>${bulletMatch[2]}</li>`);
            } else if (numberMatch) {
                if (!inList || listType !== "ol") {
                    if (inList) processedLines.push(`</${listType}>`);
                    processedLines.push("<ol>");
                    inList = true;
                    listType = "ol";
                }
                processedLines.push(`<li>${numberMatch[3]}</li>`);
            } else {
                if (inList) {
                    processedLines.push(`</${listType}>`);
                    inList = false;
                    listType = "";
                }
                // Don't add <br> after headers or empty lines
                if (
                    line.trim() === "" ||
                    line.includes("<h1") ||
                    line.includes("<h2") ||
                    line.includes("<h3") ||
                    line.includes("<h4")
                ) {
                    processedLines.push(line);
                } else {
                    processedLines.push(line + "<br>");
                }
            }
        }
        if (inList) processedLines.push(`</${listType}>`);

        formatted = processedLines.join("\n");

        // Clean up extra <br> tags
        formatted = formatted.replace(/<br>\s*<br>/g, "<br>");
        formatted = formatted.replace(/<br>\s*<\/ul>/g, "</ul>");
        formatted = formatted.replace(/<br>\s*<\/ol>/g, "</ol>");
        formatted = formatted.replace(/<br>\s*<ul>/g, "<ul>");
        formatted = formatted.replace(/<br>\s*<ol>/g, "<ol>");

        container.innerHTML = formatted;
        return container;
    }

    private render_part_card(part: DigiKeyPartInfo) {
        const important_params = part.parameters.slice(0, 6);

        return html`
            <div class="part-card">
                <div class="part-header">
                    <div class="part-header-left">
                        ${part.photo_url
                            ? html`<img
                                  class="part-photo"
                                  src="${part.photo_url}"
                                  alt="${part.manufacturer_part_number || ""}"
                                  loading="lazy" />`
                            : ""}
                        <div class="part-header-content">
                            <div class="part-mpn">
                                ${part.manufacturer_part_number ||
                                part.digikey_part_number ||
                                "Unknown Part"}
                            </div>
                            <div class="part-manufacturer">
                                ${part.manufacturer || "Unknown Manufacturer"}
                            </div>
                        </div>
                    </div>
                    <div class="status-section">
                        <span
                            class="status-badge ${this.get_status_class(part)}">
                            ${this.get_status_text(part)}
                        </span>
                        ${part.is_obsolete
                            ? html`
                                  <button
                                      class="grok-button"
                                      data-part-index="${this.get_part_index(
                                          part,
                                      )}"
                                      disabled="${this.replacement_state ===
                                      "loading"}">
                                      <kc-ui-icon>psychology</kc-ui-icon>
                                      Grok Replace
                                  </button>
                              `
                            : ""}
                    </div>
                </div>
                <div class="part-body">
                    ${part.description
                        ? html`<div class="part-description">
                              ${part.description}
                          </div>`
                        : ""}

                    <div class="part-stats">
                        <div class="stat-item">
                            <span class="stat-label">Unit Price</span>
                            <span class="stat-value">
                                ${this.format_price(part.unit_price)}
                            </span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">In Stock</span>
                            <span
                                class="stat-value ${this.get_stock_class(
                                    part.quantity_available,
                                )}">
                                ${this.format_stock(part.quantity_available)}
                            </span>
                        </div>
                        ${part.category
                            ? html`
                                  <div class="stat-item">
                                      <span class="stat-label">Category</span>
                                      <span class="stat-value"
                                          >${part.category}</span
                                      >
                                  </div>
                              `
                            : ""}
                        ${part.digikey_part_number
                            ? html`
                                  <div class="stat-item">
                                      <span class="stat-label">DigiKey #</span>
                                      <span class="stat-value"
                                          >${part.digikey_part_number}</span
                                      >
                                  </div>
                              `
                            : ""}
                    </div>

                    <div class="part-links">
                        ${part.product_url
                            ? html`<a
                                  class="part-link"
                                  href="${part.product_url}"
                                  target="_blank"
                                  rel="noopener noreferrer">
                                  <kc-ui-icon>open_in_new</kc-ui-icon>
                                  DigiKey Page
                              </a>`
                            : ""}
                        ${part.datasheet_url
                            ? html`<a
                                  class="part-link"
                                  href="${part.datasheet_url}"
                                  target="_blank"
                                  rel="noopener noreferrer">
                                  <kc-ui-icon>description</kc-ui-icon>
                                  Datasheet
                              </a>`
                            : ""}
                    </div>

                    ${part.is_obsolete && this.replacement_part === part
                        ? this.render_replacement_panel()
                        : ""}

                    ${important_params.length > 0
                        ? html`
                              <div class="parameters-section">
                                  <div class="parameters-title">
                                      Key Specifications
                                  </div>
                                  <div class="parameters-grid">
                                      ${important_params.map(
                                          (p) => html`
                                              <div class="parameter-row">
                                                  <span class="parameter-name"
                                                      >${p.name}</span
                                                  >
                                                  <span class="parameter-value"
                                                      >${p.value}</span
                                                  >
                                              </div>
                                          `,
                                      )}
                                  </div>
                              </div>
                          `
                        : ""}
                </div>
            </div>
        `;
    }

    override render() {
        let content;

        switch (this.search_state) {
            case "not_configured":
                content = html`
                    <div class="not-configured">
                        <strong>DigiKey API Not Configured</strong>
                        <p>
                            To enable DigiKey integration, set the following
                            environment variables on the backend:
                        </p>
                        <ul>
                            <li>DIGIKEY_CLIENT_ID</li>
                            <li>DIGIKEY_CLIENT_SECRET</li>
                        </ul>
                        <p>
                            Visit
                            <a
                                href="https://developer.digikey.com"
                                target="_blank"
                                rel="noopener"
                                >developer.digikey.com</a
                            >
                            to get API credentials.
                        </p>
                    </div>
                `;
                break;

            case "loading":
                content = html`
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Searching DigiKey...
                    </div>
                `;
                break;

            case "error":
                content = html`
                    <div class="error-message">
                        <strong>Search Error</strong>
                        <p>${this.search_result?.error || "Unknown error"}</p>
                        <button class="refresh-button" id="retry-btn">
                            <kc-ui-icon>refresh</kc-ui-icon>
                            Retry
                        </button>
                    </div>
                `;
                break;

            case "success":
                if (
                    !this.search_result ||
                    this.search_result.parts.length === 0
                ) {
                    content = html`
                        <div class="no-results">
                            <p>No parts found for "${this.search_result?.query}"</p>
                            <p style="font-size: 0.85em; margin-top: 0.5em;">
                                Try checking if the part number is correct
                            </p>
                        </div>
                    `;
                } else {
                    content = html`
                        ${this.search_result.parts.map((p) =>
                            this.render_part_card(p),
                        )}
                    `;
                }
                break;

            default:
                if (this.selected_item) {
                    const mpn = this.extract_mpn(this.selected_item);
                    if (!mpn) {
                        content = html`
                            <div class="no-results">
                                <p>No part number found for this component</p>
                                <p style="font-size: 0.85em; margin-top: 0.5em;">
                                    Add an MPN or Value property to enable
                                    DigiKey lookup
                                </p>
                            </div>
                        `;
                    } else {
                        // Component with MPN selected but search not yet started
                        content = html`
                            <div class="loading">
                                <div class="loading-spinner"></div>
                                Preparing search...
                            </div>
                        `;
                    }
                } else {
                    content = html`
                        <kc-ui-property-list>
                            <kc-ui-property-list-item
                                class="label"
                                name="Select a component to look up on DigiKey">
                            </kc-ui-property-list-item>
                        </kc-ui-property-list>
                    `;
                }
        }

        return html`
            <kc-ui-panel>
                <kc-ui-panel-title title="DigiKey"></kc-ui-panel-title>
                <kc-ui-panel-body>${content}</kc-ui-panel-body>
            </kc-ui-panel>
        `;
    }
}

window.customElements.define(
    "kc-schematic-digikey-panel",
    KCSchematicDigiKeyPanelElement,
);
