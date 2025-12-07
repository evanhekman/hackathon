/*
    Grok module - AI chat interface components for KiCanvas.

    This module provides the Grok AI chat panel and related components
    for querying an AI about schematic components.
*/

// Types
export type {
    SelectedComponent,
    QueryPreset,
    GrokChatState,
    GrokContext,
    GrokComponentEvents,
    GrokCustomEvent,
} from "./types";
export { createGrokEvent } from "./types";

// Presets
export { QUERY_PRESETS, PROJECT_PRESETS, COMPONENT_PRESETS } from "./presets";

// Styles
export {
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
    grokChatPanelStyles,
} from "./styles";

// API Service
export { GrokAPIService, grokAPI } from "./grok-api-service";
export type { StreamCallbacks, InitCallbacks, GrokStreamRequest } from "./grok-api-service";

// Components
export { KCGrokChatPanelElement } from "./grok-chat-panel";
