/*
    Extracted CSS styles for Grok chat panel components.
    Organized by component/section for easier maintenance.
*/

import { css } from "../../../base/web-components";
import { grokMarkdownStyles } from "../../services/markdown-formatter";

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
        width: 380px;
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
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
    }

    /* Collapsible Controls Section */
    .controls-section {
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .controls-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 14px;
        background: rgba(255, 206, 84, 0.05);
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: background 0.15s ease;
        text-align: left;
    }

    .controls-toggle:hover {
        background: rgba(255, 206, 84, 0.1);
    }

    .toggle-icon {
        font-size: 8px;
        color: rgba(255, 206, 84, 0.7);
        transition: transform 0.2s ease;
    }

    .toggle-label {
        flex: 1;
    }

    .selection-badge {
        background: rgba(255, 206, 84, 0.25);
        color: rgba(255, 206, 84, 1);
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
    }

    .controls-content {
        overflow-x: hidden;
    }

    .controls-section.collapsed .controls-content {
        display: none;
    }

    .section {
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .section:last-child {
        border-bottom: none;
    }

    .section-label {
        font-size: 10px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.45);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
    }
`;

// =============================================================================
// Component Card Styles
// =============================================================================

export const componentCardStyles = css`
    .component-cards {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .component-card {
        display: inline-flex;
        align-items: center;
        padding: 3px 7px;
        background: rgba(255, 206, 84, 0.12);
        border: 1px solid rgba(255, 206, 84, 0.25);
        border-radius: 4px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        transition: all 0.12s ease;
        user-select: none;
    }

    .component-card:hover {
        background: rgba(255, 206, 84, 0.2);
        border-color: rgba(255, 206, 84, 0.4);
    }

    .component-card.hovered {
        background: rgba(255, 206, 84, 0.3);
        border-color: rgba(255, 206, 84, 0.6);
        box-shadow: 0 0 6px rgba(255, 206, 84, 0.35);
    }

    .component-card .ref {
        font-weight: 600;
        font-family: "JetBrains Mono", "SF Mono", monospace;
        font-size: 10px;
    }

    .more-indicator {
        padding: 3px 7px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        transition: all 0.12s ease;
    }

    .more-indicator:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
    }

    .no-selection {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.35);
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
        gap: 5px;
    }

    .preset-card {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 9px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 5px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.85);
        cursor: pointer;
        transition: all 0.12s ease;
    }

    .preset-card:hover:not(.disabled) {
        background: rgba(255, 206, 84, 0.12);
        border-color: rgba(255, 206, 84, 0.35);
        color: rgba(255, 255, 255, 1);
    }

    .preset-card.selected {
        background: rgba(255, 206, 84, 0.18);
        border-color: rgba(255, 206, 84, 0.5);
        color: rgba(255, 206, 84, 1);
    }

    .preset-card.disabled {
        opacity: 0.35;
        cursor: not-allowed;
    }

    .preset-card.disabled:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.12);
    }

    .preset-icon {
        font-size: 12px;
    }

    .preset-title {
        font-weight: 500;
        font-family: inherit;
    }
`;

// =============================================================================
// Query Input Styles
// =============================================================================

export const queryInputStyles = css`
    .query-section {
        flex-shrink: 0;
        padding: 10px 14px;
        background: rgba(20, 20, 20, 0.6);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .query-input-container {
        display: flex;
        gap: 8px;
        align-items: flex-end;
    }

    .query-input {
        flex: 1;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        font-family: inherit;
        outline: none;
        resize: none;
        min-height: 32px;
        max-height: 64px;
        transition: all 0.15s ease;
        box-sizing: border-box;
        line-height: 1.4;
    }

    .query-input:focus {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 206, 84, 0.4);
    }

    .query-input::placeholder {
        color: rgba(255, 255, 255, 0.3);
        font-size: 12px;
    }

    .send-button {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 32px;
        height: 32px;
        background: rgba(255, 206, 84, 0.15);
        border: 1px solid rgba(255, 206, 84, 0.3);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        color: rgba(255, 206, 84, 0.9);
        font-family: "Material Symbols Outlined";
        font-size: 16px;
        font-weight: normal;
        font-style: normal;
        line-height: 1;
        flex-shrink: 0;
    }

    .send-button:hover:not(:disabled) {
        background: rgba(255, 206, 84, 0.25);
        border-color: rgba(255, 206, 84, 0.5);
        color: rgba(255, 206, 84, 1);
    }

    .send-button:disabled {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.25);
        cursor: not-allowed;
    }
`;

// =============================================================================
// Response Styles
// =============================================================================

/** Markdown styles for response content - imported from shared formatter */
export const responseMarkdownStyles = grokMarkdownStyles;

export const responseStyles = css`
    .response-section {
        flex: 1;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.35) 100%);
        border-top: 1px solid rgba(255, 206, 84, 0.15);
        overflow: hidden;
    }

    .response-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        background: rgba(255, 206, 84, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        flex-shrink: 0;
    }

    .response-header-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 206, 84, 0.9);
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    .response-header-icon {
        font-size: 14px;
    }

    .response-scroll {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px 14px;
    }

    .response-content {
        font-size: 13px;
        line-height: 1.65;
        color: rgba(255, 255, 255, 0.88);
        word-wrap: break-word;
    }

    .cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: rgba(255, 206, 84, 0.9);
        animation: blink 1s step-end infinite;
        margin-left: 2px;
        vertical-align: text-bottom;
        border-radius: 1px;
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
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 13px;
    }

    .loading-dots {
        display: flex;
        gap: 6px;
    }

    .loading-dots span {
        width: 8px;
        height: 8px;
        background: rgba(255, 206, 84, 0.7);
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
            transform: scale(0.6);
            opacity: 0.4;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }

    .error-message {
        color: rgb(255, 120, 120);
        font-size: 13px;
        padding: 10px 14px;
        background: rgba(255, 100, 100, 0.1);
        border-radius: 8px;
        border: 1px solid rgba(255, 100, 100, 0.25);
        line-height: 1.5;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
    }

    .empty-state-icon {
        font-size: 32px;
        margin-bottom: 12px;
        opacity: 0.6;
    }

    .empty-state-text {
        font-size: 13px;
        line-height: 1.5;
    }
`;

// =============================================================================
// Scrollbar Styles
// =============================================================================

export const scrollbarStyles = css`
    .controls-content::-webkit-scrollbar,
    .response-scroll::-webkit-scrollbar,
    .search-results::-webkit-scrollbar {
        width: 5px;
    }

    .controls-content::-webkit-scrollbar-track,
    .response-scroll::-webkit-scrollbar-track,
    .search-results::-webkit-scrollbar-track {
        background: transparent;
    }

    .controls-content::-webkit-scrollbar-thumb,
    .response-scroll::-webkit-scrollbar-thumb,
    .search-results::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
    }

    .controls-content::-webkit-scrollbar-thumb:hover,
    .response-scroll::-webkit-scrollbar-thumb:hover,
    .search-results::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.25);
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
    responseMarkdownStyles,
    scrollbarStyles,
];
