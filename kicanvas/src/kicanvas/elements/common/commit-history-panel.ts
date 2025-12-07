/*
    Commit history sidebar panel component.
    Shows a scrollable list of commits and allows selecting one to view that version.
*/

import { delegate } from "../../../base/events";
import { css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { GrokiAPI, type CommitInfo } from "../../services/api";

function formatDate(isoString: string | null): string {
    if (!isoString) {
        return "Unknown date";
    }

    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return "Today";
    } else if (days === 1) {
        return "Yesterday";
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
}

function truncateMessage(message: string | null, maxLength: number = 50): string {
    if (!message) {
        return "No commit message";
    }
    // Get first line only
    const firstLine = message.split("\n")[0] ?? message;
    if (firstLine.length <= maxLength) {
        return firstLine;
    }
    return firstLine.substring(0, maxLength - 3) + "...";
}

export class KCCommitHistoryPanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
                background: var(--panel-bg, #000);
                border-right: 1px solid rgba(255, 255, 255, 0.1);
            }

            .header {
                padding: 1em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: var(--panel-title-bg, #0a0a0a);
            }

            .header h2 {
                margin: 0;
                font-size: 0.9em;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.9);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .header .repo-name {
                margin-top: 0.5em;
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
                font-family: "JetBrains Mono", "SF Mono", monospace;
                word-break: break-all;
            }

            .commit-list {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
            }

            .commit-item {
                display: flex;
                flex-direction: column;
                padding: 0.75em 1em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                cursor: pointer;
                transition: background 0.15s ease;
                position: relative;
            }

            .commit-item:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .commit-item.selected {
                background: rgba(255, 206, 84, 0.15);
                border-left: 3px solid rgb(255, 206, 84);
            }

            .commit-item.selected:hover {
                background: rgba(255, 206, 84, 0.2);
            }

            .commit-header {
                display: flex;
                align-items: center;
                gap: 0.5em;
                margin-bottom: 0.35em;
            }

            .commit-hash {
                font-family: "JetBrains Mono", "SF Mono", monospace;
                font-size: 0.8em;
                color: rgb(255, 206, 84);
                background: rgba(255, 206, 84, 0.15);
                padding: 0.1em 0.4em;
                border-radius: 3px;
            }

            .commit-date {
                font-size: 0.75em;
                color: rgba(255, 255, 255, 0.4);
                margin-left: auto;
            }

            .commit-message {
                font-size: 0.85em;
                color: rgba(255, 255, 255, 0.85);
                line-height: 1.4;
            }

            .selected-badge {
                font-size: 0.65em;
                color: rgb(255, 206, 84);
                background: rgba(255, 206, 84, 0.2);
                padding: 0.15em 0.5em;
                border-radius: 3px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                font-weight: 600;
            }

            .loading,
            .error,
            .empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2em 1em;
                text-align: center;
                color: rgba(255, 255, 255, 0.5);
            }

            .loading-spinner {
                width: 24px;
                height: 24px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-top-color: rgb(255, 206, 84);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin-bottom: 1em;
            }

            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }

            .error {
                color: rgb(255, 100, 100);
            }

            .error-icon {
                font-size: 1.5em;
                margin-bottom: 0.5em;
            }

            .retry-button {
                margin-top: 1em;
                padding: 0.5em 1em;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .retry-button:hover {
                background: rgba(255, 255, 255, 0.15);
                border-color: rgba(255, 255, 255, 0.3);
            }

            .timeline {
                position: absolute;
                left: 0.5em;
                top: 0;
                bottom: 0;
                width: 2px;
                background: rgba(255, 255, 255, 0.1);
            }

            .commit-item:first-child .timeline {
                top: 50%;
            }

            .commit-item:last-child .timeline {
                bottom: 50%;
            }

            .timeline-dot {
                position: absolute;
                left: 0.35em;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                border: 2px solid var(--panel-bg, #000);
            }

            .commit-item.selected .timeline-dot {
                background: rgb(255, 206, 84);
                box-shadow: 0 0 8px rgba(255, 206, 84, 0.5);
            }

            .commit-content {
                margin-left: 1.5em;
            }
        `,
    ];

    private commits: CommitInfo[] = [];
    private selectedCommit: string | null = null;
    private loading = false;
    private error: string | null = null;
    private repo: string | null = null;

    /**
     * Set the repository and load commits
     */
    async setRepo(repo: string): Promise<void> {
        if (this.repo === repo) {
            return;
        }

        this.repo = repo;
        this.selectedCommit = null;
        await this.loadCommits();
    }

    /**
     * Get the currently selected commit hash
     */
    getSelectedCommit(): string | null {
        return this.selectedCommit;
    }

    /**
     * Set the selected commit (e.g., when loading initially)
     */
    setSelectedCommit(commit: string | null): void {
        this.selectedCommit = commit;
        this.update();
    }

    private async loadCommits(): Promise<void> {
        if (!this.repo) {
            return;
        }

        this.loading = true;
        this.error = null;
        this.update();

        try {
            this.commits = await GrokiAPI.getCommits(this.repo);

            // Select the first commit by default if none selected
            if (!this.selectedCommit && this.commits.length > 0) {
                this.selectedCommit = this.commits[0]!.commit_hash;
            }
        } catch (e) {
            console.error("Failed to load commits:", e);
            this.error = e instanceof Error ? e.message : "Failed to load commits";
        } finally {
            this.loading = false;
            this.update();
        }
    }

    private onCommitClick(commit: CommitInfo): void {
        if (this.selectedCommit === commit.commit_hash) {
            return;
        }

        this.selectedCommit = commit.commit_hash;
        this.update();

        // Dispatch event for parent to handle loading the new commit
        this.dispatchEvent(
            new CustomEvent("commit-select", {
                detail: {
                    repo: this.repo,
                    commit: commit.commit_hash,
                    commitInfo: commit,
                },
                bubbles: true,
                composed: true,
            }),
        );
    }

    override initialContentCallback(): void {
        super.initialContentCallback();

        // Handle commit clicks via event delegation
        delegate(this.renderRoot, ".commit-item", "click", (e, source) => {
            const hash = source.getAttribute("data-hash");
            const commit = this.commits.find((c) => c.commit_hash === hash);
            if (commit) {
                this.onCommitClick(commit);
            }
        });

        // Handle retry button
        delegate(this.renderRoot, ".retry-button", "click", () => {
            this.loadCommits();
        });
    }

    override render() {
        const header = html`
            <div class="header">
                <h2>Commit History</h2>
                ${this.repo
                    ? html`<div class="repo-name">${this.repo}</div>`
                    : null}
            </div>
        `;

        if (this.loading) {
            return html`
                ${header}
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div>Loading commits...</div>
                </div>
            `;
        }

        if (this.error) {
            return html`
                ${header}
                <div class="error">
                    <div class="error-icon">⚠️</div>
                    <div>${this.error}</div>
                    <button class="retry-button">Retry</button>
                </div>
            `;
        }

        if (!this.repo) {
            return html`
                ${header}
                <div class="empty">
                    <div>No repository loaded</div>
                </div>
            `;
        }

        if (this.commits.length === 0) {
            return html`
                ${header}
                <div class="empty">
                    <div>No commits found</div>
                </div>
            `;
        }

        const commitItems = this.commits.map((commit) => {
            const isSelected = this.selectedCommit === commit.commit_hash;
            const shortHash = commit.commit_hash.substring(0, 7);

            return html`
                <div
                    class="commit-item ${isSelected ? "selected" : ""}"
                    data-hash="${commit.commit_hash}">
                    <div class="timeline"></div>
                    <div class="timeline-dot"></div>
                    <div class="commit-content">
                        <div class="commit-header">
                            <span class="commit-hash">${shortHash}</span>
                            ${isSelected
                                ? html`<span class="selected-badge">Viewing</span>`
                                : null}
                            <span class="commit-date">
                                ${formatDate(commit.commit_date)}
                            </span>
                        </div>
                        <div class="commit-message">
                            ${truncateMessage(commit.message)}
                        </div>
                    </div>
                </div>
            `;
        });

        return html`
            ${header}
            <div class="commit-list">${commitItems}</div>
        `;
    }
}

window.customElements.define(
    "kc-commit-history-panel",
    KCCommitHistoryPanelElement,
);
