/*
    Floating chat panel for Grok AI streaming responses.
    Displays a transparent, hovering panel with streamed chat content.
    Can be minimized by dragging to the side.
*/

import { attribute, css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";

// Configure API base URL
const BACKEND_URL = process.env["BACKEND_URL"];
const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export class KCGrokChatPanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                position: fixed;
                bottom: 60px;
                right: 12px;
                z-index: 500;
                pointer-events: auto;
                transform: translateX(0);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                            opacity 0.3s ease;
            }

            :host(:not([visible])) {
                opacity: 0;
                pointer-events: none;
                transform: translateX(20px);
            }

            :host([minimized]) {
                transform: translateX(calc(100% - 32px));
            }

            :host([minimized]) .chat-container {
                box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
            }

            :host([minimized]) .chat-content,
            :host([minimized]) .chat-header-center,
            :host([minimized]) .close-button,
            :host([minimized]) .resize-handle {
                opacity: 0;
                pointer-events: none;
            }

            :host([minimized]) .expand-tab {
                opacity: 1;
                pointer-events: auto;
            }

            .chat-container {
                width: 380px;
                height: var(--chat-height, calc(100vh - 120px));
                min-height: 200px;
                max-height: calc(100vh - 80px);
                background: var(--panel-bg, #000000);
                border: var(--panel-border, 2px solid #1a1a1a);
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: inherit;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            }

            .resize-handle {
                height: 6px;
                background: transparent;
                cursor: ns-resize;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .resize-handle:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .resize-handle::after {
                content: '';
                width: 40px;
                height: 3px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
                transition: background 0.15s ease;
            }

            .resize-handle:hover::after {
                background: rgba(255, 206, 84, 0.5);
            }

            .chat-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                background: var(--panel-title-bg, #0a0a0a);
                border-bottom: var(--panel-title-border, 1px solid #333333);
                cursor: grab;
                user-select: none;
            }

            .chat-header:active {
                cursor: grabbing;
            }

            .chat-header-left {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }

            .grok-logo {
                width: 18px;
                height: 18px;
                object-fit: contain;
            }

            .chat-title {
                font-size: 12px;
                font-weight: 500;
                color: var(--panel-title-fg, #ffffff);
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }

            .chat-header-center {
                display: flex;
                align-items: center;
                gap: 6px;
                transition: opacity 0.2s ease;
            }

            .status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transition: background 0.3s ease;
            }

            :host([streaming]) .status-dot {
                background: rgba(255, 206, 84, 0.9);
                box-shadow: 0 0 8px rgba(255, 206, 84, 0.5);
                animation: pulse 1.5s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .status-text {
                font-size: 10px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .close-button {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                transition: all 0.15s ease;
                font-size: 16px;
                line-height: 1;
                flex-shrink: 0;
            }

            .close-button:hover {
                background: rgba(255, 255, 255, 0.1);
                color: rgba(255, 255, 255, 0.9);
            }

            .expand-tab {
                position: absolute;
                left: -24px;
                top: 50%;
                transform: translateY(-50%);
                width: 24px;
                height: 48px;
                background: var(--panel-title-bg, #0a0a0a);
                border: 1px solid #333333;
                border-right: none;
                border-radius: 8px 0 0 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease, background 0.15s ease;
            }

            .expand-tab:hover {
                background: var(--panel-title-button-hover-bg, #1a1a1a);
            }

            .expand-tab-icon {
                width: 14px;
                height: 14px;
                object-fit: contain;
                opacity: 0.7;
            }

            .chat-content {
                flex: 1;
                padding: 12px 14px;
                overflow-y: auto;
                min-height: 80px;
                transition: opacity 0.2s ease;
            }

            .message {
                font-size: 13px;
                line-height: 1.6;
                color: var(--panel-fg, #ffffff);
                white-space: pre-wrap;
                word-wrap: break-word;
            }

            .message-empty {
                color: rgba(255, 255, 255, 0.4);
                font-style: italic;
            }

            /* Typing cursor animation */
            .cursor {
                display: inline-block;
                width: 2px;
                height: 1em;
                background: rgba(255, 206, 84, 0.8);
                margin-left: 2px;
                animation: blink 1s step-end infinite;
                vertical-align: text-bottom;
            }

            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
            }

            :host(:not([streaming])) .cursor {
                display: none;
            }

            /* Markdown-like styling */
            .message code {
                background: rgba(255, 255, 255, 0.08);
                padding: 2px 5px;
                border-radius: 3px;
                font-family: "SF Mono", Menlo, Monaco, monospace;
                font-size: 0.9em;
            }

            .message strong {
                color: rgba(255, 255, 255, 1);
                font-weight: 600;
            }

            /* Scrollbar styling - match app theme */
            .chat-content::-webkit-scrollbar {
                width: 6px;
            }

            .chat-content::-webkit-scrollbar-track {
                background: transparent;
            }

            .chat-content::-webkit-scrollbar-thumb {
                background: var(--scrollbar-fg, rgba(255, 206, 84, 0.5));
                border-radius: 3px;
            }

            .chat-content::-webkit-scrollbar-thumb:hover {
                background: var(--scrollbar-hover-fg, rgba(255, 206, 84, 0.7));
            }

            /* Loading state */
            .loading-dots {
                display: flex;
                gap: 4px;
                padding: 8px 0;
            }

            .loading-dots span {
                width: 6px;
                height: 6px;
                background: rgba(255, 206, 84, 0.6);
                border-radius: 50%;
                animation: loadingDot 1.4s ease-in-out infinite both;
            }

            .loading-dots span:nth-child(1) { animation-delay: 0s; }
            .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
            .loading-dots span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes loadingDot {
                0%, 80%, 100% {
                    transform: scale(0.6);
                    opacity: 0.4;
                }
                40% {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            /* Error state */
            .error-message {
                color: #ff6b6b;
                background: rgba(255, 107, 107, 0.1);
                padding: 10px 12px;
                border-radius: 6px;
                border: 1px solid rgba(255, 107, 107, 0.2);
                font-size: 12px;
            }
        `,
    ];

    @attribute({ type: Boolean })
    visible: boolean = false;

    @attribute({ type: Boolean })
    streaming: boolean = false;

    @attribute({ type: Boolean })
    minimized: boolean = false;

    @attribute({ type: String })
    logoSrc: string = "./images/Grok_Logomark_Light.png";

    #content: string = "";
    #isLoading: boolean = false;
    #error: string | null = null;
    #eventSource: EventSource | null = null;
    #isDragging: boolean = false;
    #dragStartX: number = 0;
    #isResizing: boolean = false;
    #resizeStartY: number = 0;
    #resizeStartHeight: number = 0;

    // Bound event handlers for cleanup
    #boundDragMove = (e: MouseEvent) => this.#onDragMove(e);
    #boundDragEnd = () => this.#onDragEnd();
    #boundResizeMove = (e: MouseEvent) => this.#onResizeMove(e);
    #boundResizeEnd = () => this.#onResizeEnd();

    override disconnectedCallback() {
        super.disconnectedCallback();
        this.#closeStream();
        // Clean up document-level event listeners
        document.removeEventListener("mousemove", this.#boundDragMove);
        document.removeEventListener("mouseup", this.#boundDragEnd);
        document.removeEventListener("mousemove", this.#boundResizeMove);
        document.removeEventListener("mouseup", this.#boundResizeEnd);
    }

    override initialContentCallback() {
        // Add click listener to close button
        const closeButton = this.renderRoot.querySelector(".close-button");
        closeButton?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#handleClose();
        });

        // Add click listener to expand tab
        const expandTab = this.renderRoot.querySelector(".expand-tab");
        expandTab?.addEventListener("click", (e) => {
            e.preventDefault();
            this.minimized = false;
        });

        // Add drag handlers to header for minimize gesture
        const header = this.renderRoot.querySelector(".chat-header");
        header?.addEventListener("mousedown", (e) => this.#onDragStart(e as MouseEvent));
        document.addEventListener("mousemove", this.#boundDragMove);
        document.addEventListener("mouseup", this.#boundDragEnd);

        // Add resize handlers
        const resizeHandle = this.renderRoot.querySelector(".resize-handle");
        resizeHandle?.addEventListener("mousedown", (e) => this.#onResizeStart(e as MouseEvent));
        document.addEventListener("mousemove", this.#boundResizeMove);
        document.addEventListener("mouseup", this.#boundResizeEnd);
    }

    #onDragStart(e: MouseEvent) {
        // Don't start drag if clicking close button
        if ((e.target as HTMLElement).closest(".close-button")) return;
        
        this.#isDragging = true;
        this.#dragStartX = e.clientX;
    }

    #onDragMove(e: MouseEvent) {
        if (!this.#isDragging) return;
        
        const deltaX = e.clientX - this.#dragStartX;
        
        // If dragged right more than 50px, minimize
        if (deltaX > 50 && !this.minimized) {
            this.minimized = true;
            this.#isDragging = false;
        }
        // If dragged left more than 50px, expand
        else if (deltaX < -50 && this.minimized) {
            this.minimized = false;
            this.#isDragging = false;
        }
    }

    #onDragEnd() {
        this.#isDragging = false;
    }

    #onResizeStart(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.#isResizing = true;
        this.#resizeStartY = e.clientY;
        
        const container = this.renderRoot.querySelector(".chat-container") as HTMLElement;
        if (container) {
            this.#resizeStartHeight = container.offsetHeight;
        }
        
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
    }

    #onResizeMove(e: MouseEvent) {
        if (!this.#isResizing) return;
        
        const deltaY = this.#resizeStartY - e.clientY;
        const maxHeight = window.innerHeight - 80;
        const newHeight = Math.max(200, Math.min(maxHeight, this.#resizeStartHeight + deltaY));
        
        this.style.setProperty("--chat-height", `${newHeight}px`);
    }

    #onResizeEnd() {
        if (this.#isResizing) {
            this.#isResizing = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
    }

    /**
     * Show the panel and start streaming
     */
    public show() {
        this.visible = true;
        this.minimized = false;
        this.#startStream();
    }

    /**
     * Hide the panel and stop streaming
     */
    public hide() {
        this.visible = false;
        this.#closeStream();
    }

    /**
     * Toggle panel visibility
     */
    public toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    #startStream() {
        // Reset state
        this.#content = "";
        this.#error = null;
        this.#isLoading = true;
        this.streaming = true;
        this.#updateContent();

        // Close any existing stream
        this.#closeStream();

        // Create EventSource for SSE
        const streamUrl = `${API_BASE_URL}/grok/chat/stream`;
        console.log(`[GrokChat] Starting stream from: ${streamUrl}`);

        this.#eventSource = new EventSource(streamUrl);

        this.#eventSource.onopen = () => {
            console.log("[GrokChat] Stream connected");
            this.#isLoading = false;
            this.#updateContent();
        };

        this.#eventSource.onmessage = (event) => {
            const data = event.data;

            if (data === "[DONE]") {
                console.log("[GrokChat] Stream completed");
                this.streaming = false;
                this.#closeStream();
                this.#updateContent();
                return;
            }

            if (data.startsWith("[ERROR:")) {
                console.error("[GrokChat] Stream error:", data);
                this.#error = data;
                this.streaming = false;
                this.#closeStream();
                this.#updateContent();
                return;
            }

            // Append content
            this.#content += data;
            this.#updateContent();

            // Auto-scroll to bottom
            const contentEl = this.renderRoot.querySelector(".chat-content");
            if (contentEl) {
                contentEl.scrollTop = contentEl.scrollHeight;
            }
        };

        this.#eventSource.onerror = (event) => {
            console.error("[GrokChat] EventSource error:", event);
            this.#isLoading = false;
            this.streaming = false;

            if (this.#content.length === 0) {
                this.#error = "Failed to connect to Grok AI. Please ensure the backend is running.";
            }

            this.#closeStream();
            this.#updateContent();
        };
    }

    #closeStream() {
        if (this.#eventSource) {
            this.#eventSource.close();
            this.#eventSource = null;
        }
    }

    #updateContent() {
        const messageEl = this.renderRoot.querySelector(".message");
        if (messageEl) {
            if (this.#error) {
                messageEl.innerHTML = `<div class="error-message">${this.#escapeHtml(this.#error)}</div>`;
            } else if (this.#isLoading) {
                messageEl.innerHTML = `
                    <div class="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                `;
            } else if (this.#content.length === 0) {
                messageEl.innerHTML = `<span class="message-empty">Waiting for response...</span>`;
            } else {
                messageEl.innerHTML = this.#formatContent(this.#content) +
                    (this.streaming ? '<span class="cursor"></span>' : "");
            }
        }

        // Update streaming attribute for CSS
        if (this.streaming) {
            this.setAttribute("streaming", "");
        } else {
            this.removeAttribute("streaming");
        }
    }

    #formatContent(content: string): string {
        // Basic formatting: escape HTML and apply simple markdown-like formatting
        let formatted = this.#escapeHtml(content);

        // Bold: **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Inline code: `code`
        formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

        return formatted;
    }

    #escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    #handleClose() {
        this.hide();
        this.dispatchEvent(
            new CustomEvent("grok-chat-close", {
                bubbles: true,
                composed: true,
            }),
        );
    }

    override render() {
        return html`
            <div class="expand-tab">
                <img class="expand-tab-icon" src="${this.logoSrc}" alt="Expand" />
            </div>
            <div class="chat-container">
                <div class="resize-handle"></div>
                <div class="chat-header">
                    <div class="chat-header-left">
                        <img class="grok-logo" src="${this.logoSrc}" alt="Grok" />
                        <span class="chat-title">Grok</span>
                    </div>
                    <div class="chat-header-center">
                        <span class="status-dot"></span>
                        <span class="status-text">${this.streaming ? "Streaming" : "Ready"}</span>
                    </div>
                    <button class="close-button">×</button>
                </div>
                <div class="chat-content">
                    <div class="message">
                        <span class="message-empty">Analyzing selection...</span>
                    </div>
                </div>
            </div>
        `;
    }
}

window.customElements.define("kc-grok-chat-panel", KCGrokChatPanelElement);
