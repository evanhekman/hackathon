/*
    Extracted CSS styles for Grok chat panel components.
    Organized by component/section for easier maintenance.
*/

import { css } from "../../../base/web-components";

// =============================================================================
// Host & Container Styles
// =============================================================================

export const hostStyles = css`
    :host {
        position: fixed;
        top: 60px;
        bottom: 80px;
        right: 20px;
        z-index: 1000;
        pointer-events: auto;
        opacity: 1;
        transform: translateX(0);
        transition:
            opacity 0.2s ease,
            transform 0.2s ease;
    }

    :host(:not([visible])) {
        opacity: 0;
        pointer-events: none;
        transform: translateX(10px);
    }
`;

export const containerStyles = css`
    .chat-container {
        width: 340px;
        height: 100%;
        background: rgba(15, 15, 15, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    /* Allow dropdown to extend beyond container bounds */
    :host([data-search-open]) .chat-container {
        overflow: visible;
    }
`;

// =============================================================================
// Header Styles
// =============================================================================

export const headerStyles = css`
    .chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(25, 25, 25, 0.95);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
    }

    .chat-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .grok-logo {
        width: 24px;
        height: 24px;
        object-fit: contain;
    }

    .chat-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
    }

    .close-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 4px 6px;
        font-size: 18px;
        line-height: 1;
        border-radius: 6px;
        min-width: 28px;
        transition: all 0.15s ease;
    }

    .close-button:hover {
        background: var(--button-hover-bg, rgba(255, 255, 255, 0.08));
        color: var(--button-hover-fg, rgba(255, 255, 255, 0.9));
    }
`;

// =============================================================================
// Body & Section Styles
// =============================================================================

export const bodyStyles = css`
    .chat-body {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
    }

    .section {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .section:last-child {
        border-bottom: none;
    }

    .section-label {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.4);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 10px;
    }
`;

// =============================================================================
// Component Card Styles
// =============================================================================

export const componentCardStyles = css`
    .component-cards {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .component-card {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(255, 206, 84, 0.15);
        border: 1px solid rgba(255, 206, 84, 0.3);
        border-radius: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
    }

    .component-card:hover {
        background: rgba(255, 206, 84, 0.25);
        border-color: rgba(255, 206, 84, 0.5);
    }

    .component-card.hovered {
        background: rgba(255, 206, 84, 0.35);
        border-color: rgba(255, 206, 84, 0.7);
        box-shadow: 0 0 8px rgba(255, 206, 84, 0.4);
    }

    .component-card .ref {
        font-weight: 600;
        font-family: "JetBrains Mono", "SF Mono", monospace;
    }

    .more-indicator {
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .more-indicator:hover {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.9);
    }

    .no-selection {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        font-style: italic;
    }
`;

// =============================================================================
// Search Styles
// =============================================================================

export const searchStyles = css`
    .search-container {
        position: relative;
    }

    .search-input {
        width: 100%;
        padding: 8px 12px 8px 32px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        outline: none;
        transition: all 0.15s ease;
        box-sizing: border-box;
    }

    .search-input:focus {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 206, 84, 0.5);
    }

    .search-input::placeholder {
        color: rgba(255, 255, 255, 0.3);
    }

    .search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        font-family: "Material Symbols Outlined";
        font-size: 18px;
        font-weight: normal;
        font-style: normal;
        line-height: 1;
        color: rgba(255, 255, 255, 0.4);
        pointer-events: none;
        user-select: none;
    }

    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 180px;
        overflow-y: auto;
        background: rgba(20, 20, 20, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        margin-top: 4px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        /* Ensure dropdown doesn't block elements outside the panel */
        pointer-events: auto;
    }

    .search-result-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
    }

    .search-result-item:hover {
        background: rgba(255, 255, 255, 0.12);
    }

    .search-result-item.selected {
        background: rgba(255, 206, 84, 0.25);
        border-left: 3px solid rgba(255, 206, 84, 0.8);
        padding-left: 9px;
    }

    .search-result-item.selected:hover {
        background: rgba(255, 206, 84, 0.35);
    }

    .search-result-item.highlighted {
        background: rgba(255, 255, 255, 0.15);
        outline: 1px solid rgba(255, 255, 255, 0.3);
        outline-offset: -1px;
    }

    .search-result-item.selected.highlighted {
        background: rgba(255, 206, 84, 0.35);
        outline-color: rgba(255, 206, 84, 0.6);
    }

    .search-result-ref {
        font-weight: 600;
        font-family: "JetBrains Mono", "SF Mono", monospace;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
    }

    .search-result-value {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        margin-left: 8px;
    }

    .search-result-action {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.5);
        width: 18px;
        text-align: center;
    }

    .search-result-item.selected .search-result-action {
        color: rgba(255, 206, 84, 0.9);
    }
`;

// =============================================================================
// Preset Card Styles (matches component card style)
// =============================================================================

export const presetStyles = css`
    .preset-cards {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .preset-card {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .preset-card:hover:not(.disabled) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.25);
    }

    .preset-card.selected {
        background: rgba(255, 206, 84, 0.15);
        border-color: rgba(255, 206, 84, 0.4);
    }

    .preset-card.disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .preset-card.disabled:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .preset-icon {
        font-size: 14px;
    }

    .preset-title {
        font-weight: 600;
        font-family: inherit;
    }
`;

// =============================================================================
// Query Input Styles
// =============================================================================

export const queryInputStyles = css`
    .query-input-container {
        display: flex;
        gap: 8px;
    }

    .query-input {
        flex: 1;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        resize: none;
        min-height: 160px;
        max-height: 200px;
        transition: all 0.15s ease;
        box-sizing: border-box;
    }

    .query-input:focus {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 206, 84, 0.5);
    }

    .query-input::placeholder {
        color: rgba(255, 255, 255, 0.3);
    }

    .send-button {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        background: var(--button-bg, rgba(255, 255, 255, 0.08));
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        color: var(--button-fg, rgba(255, 255, 255, 0.8));
        font-family: "Material Symbols Outlined";
        font-size: 18px;
        font-weight: normal;
        font-style: normal;
        line-height: 1;
        flex-shrink: 0;
    }

    .send-button:hover:not(:disabled) {
        background: var(--button-hover-bg, rgba(255, 255, 255, 0.12));
        border-color: var(--button-hover-border, rgba(255, 255, 255, 0.2));
        color: var(--button-hover-fg, rgba(255, 255, 255, 1));
    }

    .send-button:disabled {
        background: var(--button-disabled-bg, rgba(255, 255, 255, 0.05));
        border-color: var(--button-disabled-border, rgba(255, 255, 255, 0.08));
        color: var(--button-disabled-fg, rgba(255, 255, 255, 0.3));
        cursor: not-allowed;
    }
`;

// =============================================================================
// Response Styles
// =============================================================================

export const responseStyles = css`
    .response-section {
        background: rgba(0, 0, 0, 0.3);
        max-height: 250px;
        overflow-y: auto;
    }

    .response-content {
        font-size: 13px;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.85);
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .response-content code {
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: "JetBrains Mono", "SF Mono", monospace;
        font-size: 12px;
    }

    .response-content strong {
        color: rgba(255, 206, 84, 0.9);
    }

    .cursor {
        display: inline-block;
        width: 8px;
        height: 16px;
        background: rgba(255, 206, 84, 0.8);
        animation: blink 1s step-end infinite;
        margin-left: 2px;
        vertical-align: text-bottom;
    }

    @keyframes blink {
        50% {
            opacity: 0;
        }
    }

    :host(:not([streaming])) .cursor {
        display: none;
    }

    .loading-indicator {
        display: flex;
        align-items: center;
        gap: 10px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 13px;
    }

    .loading-dots {
        display: flex;
        gap: 4px;
    }

    .loading-dots span {
        width: 6px;
        height: 6px;
        background: rgba(255, 206, 84, 0.6);
        border-radius: 50%;
        animation: loading-bounce 1.4s ease-in-out infinite;
    }

    .loading-dots span:nth-child(1) {
        animation-delay: 0s;
    }
    .loading-dots span:nth-child(2) {
        animation-delay: 0.2s;
    }
    .loading-dots span:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes loading-bounce {
        0%,
        80%,
        100% {
            transform: scale(0.8);
            opacity: 0.5;
        }
        40% {
            transform: scale(1.2);
            opacity: 1;
        }
    }

    .error-message {
        color: rgb(255, 100, 100);
        font-size: 13px;
        padding: 8px 12px;
        background: rgba(255, 100, 100, 0.1);
        border-radius: 6px;
        border: 1px solid rgba(255, 100, 100, 0.2);
    }
`;

// =============================================================================
// Scrollbar Styles
// =============================================================================

export const scrollbarStyles = css`
    .chat-body::-webkit-scrollbar,
    .response-section::-webkit-scrollbar,
    .search-results::-webkit-scrollbar {
        width: 6px;
    }

    .chat-body::-webkit-scrollbar-track,
    .response-section::-webkit-scrollbar-track,
    .search-results::-webkit-scrollbar-track {
        background: transparent;
    }

    .chat-body::-webkit-scrollbar-thumb,
    .response-section::-webkit-scrollbar-thumb,
    .search-results::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }
`;

// =============================================================================
// Footer Styles
// =============================================================================

export const footerStyles = css`
    .chat-footer {
        display: flex;
        justify-content: flex-end;
        padding: 8px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(20, 20, 20, 0.95);
        flex-shrink: 0;
    }

    .clear-data-button {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.5);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .clear-data-button:hover:not(:disabled) {
        background: rgba(255, 100, 100, 0.1);
        border-color: rgba(255, 100, 100, 0.3);
        color: rgba(255, 100, 100, 0.9);
    }

    .clear-data-button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

// =============================================================================
// Combined Styles (for main panel)
// =============================================================================

export const grokChatPanelStyles = [
    hostStyles,
    containerStyles,
    headerStyles,
    bodyStyles,
    componentCardStyles,
    searchStyles,
    presetStyles,
    queryInputStyles,
    responseStyles,
    scrollbarStyles,
    footerStyles,
];
