/*
    Grok API Service - handles streaming communication with the Grok AI backend.
    Extracted from grok-chat-panel.ts for better separation of concerns.
*/

import { GrokiAPI, type DistilledSchematic, type RepoInitResponse, type RepoClearCacheResponse } from "../../services/api";
import type { SelectedComponent, GrokContext } from "./types";

// Configure API base URL
const BACKEND_URL = process.env["BACKEND_URL"];
const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

/** Callback types for streaming events */
export interface StreamCallbacks {
    onStart?: () => void;
    onChunk?: (content: string) => void;
    onComplete?: (fullContent: string) => void;
    onError?: (error: string) => void;
}

/** Callback types for initialization events */
export interface InitCallbacks {
    onStart?: () => void;
    onComplete?: (response: RepoInitResponse) => void;
    onError?: (error: string) => void;
}

/** Request payload for the Grok selection stream endpoint */
export interface GrokStreamRequest {
    repo: string;
    commit: string;
    component_ids: string[];
    query: string;
    distilled: DistilledSchematic;
    thinking_mode: boolean;
}

/**
 * Service for interacting with the Grok AI backend.
 * Handles repository initialization, distilled schematics, and streaming AI responses.
 */
export class GrokAPIService {
    private _distilledSchematic: DistilledSchematic | null = null;
    private _initResponse: RepoInitResponse | null = null;
    private _currentRepo: string | null = null;
    private _currentCommit: string | null = null;
    private _abortController: AbortController | null = null;

    /**
     * Initialize a repository by distilling its schematic files.
     * This prepares the semantic representation for AI analysis.
     * Results are cached for the repo/commit combination.
     */
    async initRepository(
        repo: string,
        commit: string,
        callbacks?: InitCallbacks,
    ): Promise<RepoInitResponse> {
        // Return cached if same repo/commit
        if (
            this._initResponse &&
            this._currentRepo === repo &&
            this._currentCommit === commit
        ) {
            return this._initResponse;
        }

        callbacks?.onStart?.();

        try {
            const response = await GrokiAPI.initRepository(repo, commit);
            this._initResponse = response;
            this._distilledSchematic = response.distilled;
            this._currentRepo = repo;
            this._currentCommit = commit;
            callbacks?.onComplete?.(response);
            return response;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to initialize repository";
            callbacks?.onError?.(message);
            throw err;
        }
    }

    /**
     * Fetches and caches the distilled schematic for a repo/commit.
     * Uses the init endpoint if not already initialized.
     */
    async getDistilledSchematic(
        repo: string,
        commit: string,
    ): Promise<DistilledSchematic> {
        // If we already have it cached for this repo/commit
        if (
            this._distilledSchematic &&
            this._currentRepo === repo &&
            this._currentCommit === commit
        ) {
            return this._distilledSchematic;
        }

        // Use init endpoint to get distilled data (also caches on server)
        const response = await this.initRepository(repo, commit);
        return response.distilled;
    }

    /**
     * Clears the local cached distilled schematic and init response.
     * Call this when the repo/commit changes.
     */
    clearCache(): void {
        this._distilledSchematic = null;
        this._initResponse = null;
        this._currentRepo = null;
        this._currentCommit = null;
    }

    /**
     * Clears both local and server-side cache for the current repo.
     * Forces a complete re-distillation on the next init call.
     */
    async clearServerCache(
        repo: string,
        commit?: string,
    ): Promise<RepoClearCacheResponse> {
        // Clear local cache first
        this.clearCache();

        // Clear server-side cache
        return GrokiAPI.clearCache(repo, commit);
    }

    /**
     * Get the current initialization response if available.
     */
    getInitResponse(): RepoInitResponse | null {
        return this._initResponse;
    }

    /**
     * Aborts any in-progress streaming request.
     */
    abort(): void {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }

    /**
     * Streams a query to the Grok AI backend and processes the response.
     *
     * @param context - Repository context (repo and commit)
     * @param components - Selected components to query about
     * @param query - The user's question
     * @param callbacks - Callbacks for streaming events
     * @param thinkingMode - Whether to enable reasoning/thinking mode
     * @returns Promise that resolves when streaming is complete
     */
    async streamQuery(
        context: GrokContext,
        components: SelectedComponent[],
        query: string,
        callbacks: StreamCallbacks,
        thinkingMode: boolean = false,
    ): Promise<void> {
        const { repo, commit } = context;

        if (!repo || !commit) {
            callbacks.onError?.(
                "Repository context not available. Please load a schematic from GitHub.",
            );
            return;
        }

        // Abort any existing request
        this.abort();
        const abortController = new AbortController();
        this._abortController = abortController;

        callbacks.onStart?.();

        try {
            // Fetch distilled schematic if needed
            const distilled = await this.getDistilledSchematic(repo, commit);

            // Check if we were aborted during the async operation
            if (abortController.signal.aborted) {
                return;
            }

            const componentIds = components.map((c) => c.reference);

            const response = await fetch(
                `${API_BASE_URL}/grok/selection/stream`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({
                        repo,
                        commit,
                        component_ids: componentIds,
                        query,
                        distilled,
                        thinking_mode: thinkingMode,
                    } satisfies GrokStreamRequest),
                    signal: abortController.signal,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";

            if (reader) {
                let done = false;
                while (!done) {
                    const result = await reader.read();
                    done = result.done;

                    if (result.value) {
                        const chunk = decoder.decode(result.value);
                        const lines = chunk.split("\n");

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const data = line.slice(6);

                                if (data === "[DONE]") {
                                    done = true;
                                    break;
                                } else if (data.startsWith("[ERROR:")) {
                                    callbacks.onError?.(data);
                                    done = true;
                                    break;
                                } else {
                                    fullContent += data;
                                    callbacks.onChunk?.(fullContent);
                                }
                            }
                        }
                    }
                }
            }

            callbacks.onComplete?.(fullContent);
        } catch (err) {
            // Don't report abort errors
            if (err instanceof Error && err.name === "AbortError") {
                return;
            }

            console.error("[GrokAPIService] Stream error:", err);
            callbacks.onError?.(
                err instanceof Error
                    ? err.message
                    : "Failed to connect to Grok AI",
            );
        } finally {
            this._abortController = null;
        }
    }
}

/** Singleton instance for convenience */
export const grokAPI = new GrokAPIService();
