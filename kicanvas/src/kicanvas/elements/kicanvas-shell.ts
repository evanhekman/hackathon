/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { later } from "../../base/async";
import { DropTarget } from "../../base/dom/drag-drop";
import { CSS, attribute, html, query } from "../../base/web-components";
import { KCUIElement, KCUIIconElement } from "../../kc-ui";
import { sprites_url } from "../icons/sprites";
import { Project } from "../project";
import { FetchFileSystem, type VirtualFileSystem } from "../services/vfs";
import { CommitFileSystem } from "../services/commit-vfs";
import { GrokiAPI } from "../services/api";
import { KCBoardAppElement } from "./kc-board/app";
import { KCSchematicAppElement } from "./kc-schematic/app";
import { KCCommitHistoryPanelElement } from "./common/commit-history-panel";

import kc_ui_styles from "../../kc-ui/kc-ui.css";
import shell_styles from "./kicanvas-shell.css";

import "../icons/sprites";
import "./common/project-panel";
import "./common/commit-history-panel";

// Setup KCUIIconElement to use icon sprites.
KCUIIconElement.sprites_url = sprites_url;

/**
 * <kc-kicanvas-shell> is the main entrypoint for the standalone KiCanvas
 * application- it's the thing you see when you go to kicanvas.org.
 *
 * The shell is responsible for managing the currently loaded Project and
 * switching between the different viewer apps (<kc-schematic-app>,
 * <kc-board-app>).
 *
 * This is a simplified version of the subtree:
 *
 * <kc-kicanvas-shell>
 *   <kc-ui-app>
 *     <kc-commit-history-panel>
 *     <kc-project-panel>
 *     <kc-schematic-app>
 *       <kc-schematic-viewer>
 *       <kc-ui-activity-side-bar>
 *     <kc-board-app>
 *       <kc-board-viewer>
 *       <kc-ui-activity-side-bar>
 *
 */
class KiCanvasShellElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        // TODO: Figure out a better way to handle these two styles.
        new CSS(kc_ui_styles),
        new CSS(shell_styles),
    ];

    project: Project = new Project();

    #schematic_app: KCSchematicAppElement;
    #board_app: KCBoardAppElement;
    #commit_history_panel: KCCommitHistoryPanelElement | null = null;
    #current_repo: string | null = null;
    #current_commit: string | null = null;

    constructor() {
        super();
        this.provideContext("project", this.project);
    }

    @attribute({ type: Boolean })
    public loading: boolean;

    @attribute({ type: Boolean })
    public loaded: boolean;

    @attribute({ type: String })
    public src: string;

    @query(`input[name="link"]`, true)
    public link_input: HTMLInputElement;

    @query("kc-commit-history-panel", true)
    public commit_panel: KCCommitHistoryPanelElement;

    override initialContentCallback() {
        const url_params = new URLSearchParams(document.location.search);
        const github_paths = url_params.getAll("github");

        later(async () => {
            if (this.src) {
                const vfs = new FetchFileSystem([this.src]);
                await this.setup_project(vfs);
                return;
            }

            if (github_paths.length) {
                // Extract repo from the first GitHub URL
                const repo = GrokiAPI.extractRepoFromUrl(github_paths[0]!);
                if (repo) {
                    this.#current_repo = repo;
                    // Load via backend API (avoids GitHub rate limits)
                    await this.loadViaBackendAPI(repo);
                } else {
                    console.error("Could not extract repo from GitHub URL");
                }
                return;
            }

            new DropTarget(this, async (fs) => {
                // For drag+drop, we don't have commit history
                this.#current_repo = null;
                this.#current_commit = null;
                await this.setup_project(fs);
            });
        });

        this.link_input.addEventListener("input", async (e) => {
            const link = this.link_input.value;

            // Extract repo from the link
            const repo = GrokiAPI.extractRepoFromUrl(link);
            if (!repo) {
                return;
            }

            this.#current_repo = repo;
            await this.loadViaBackendAPI(repo);

            const location = new URL(window.location.href);
            location.searchParams.set("github", link);
            window.history.pushState(null, "", location);
        });

        // Listen for commit selection events from the history panel
        this.addEventListener("commit-select", async (e: Event) => {
            const detail = (e as CustomEvent).detail;
            await this.loadCommit(detail.repo, detail.commit);
        });
    }

    /**
     * Load repository via the backend API
     */
    private async loadViaBackendAPI(repo: string): Promise<void> {
        this.loaded = false;
        this.loading = true;

        try {
            // Get commits from our API
            const commits = await GrokiAPI.getCommits(repo);

            if (commits.length > 0) {
                // Load the most recent commit
                const latestCommit = commits[0]!.commit_hash;
                this.#current_commit = latestCommit;

                // Load the schematic files for this commit via backend
                const vfs = await CommitFileSystem.fromCommit(
                    repo,
                    latestCommit,
                );
                await this.setup_project(vfs);

                // Update the commit history panel
                if (this.#commit_history_panel) {
                    await this.#commit_history_panel.setRepo(repo);
                    this.#commit_history_panel.setSelectedCommit(latestCommit);
                }
            } else {
                throw new Error("No commits with schematic files found");
            }
        } catch (e) {
            console.error("Backend API failed:", e);
            this.loading = false;
            alert(
                "Failed to load schematic. Please ensure the backend is running and the repository exists.",
            );
        }
    }

    /**
     * Load a specific commit
     */
    private async loadCommit(repo: string, commit: string): Promise<void> {
        if (this.#current_commit === commit) {
            return;
        }

        this.loaded = false;
        this.loading = true;
        this.#current_commit = commit;

        try {
            const vfs = await CommitFileSystem.fromCommit(repo, commit);
            await this.setup_project(vfs);
        } catch (e) {
            console.error("Failed to load commit:", e);
            this.loading = false;
        }
    }

    private async setup_project(vfs: VirtualFileSystem) {
        this.loaded = false;
        this.loading = true;

        try {
            await this.project.load(vfs);
            // Prefer schematic pages over board pages
            const schematicPage =
                this.project.root_schematic_page ?? this.project.first_page;
            this.project.set_active_page(schematicPage);
            this.loaded = true;
        } catch (e) {
            console.error(e);
        } finally {
            this.loading = false;
        }
    }

    override render() {
        this.#schematic_app = html`
            <kc-schematic-app controls="full"></kc-schematic-app>
        ` as KCSchematicAppElement;
        this.#board_app = html`
            <kc-board-app controls="full"></kc-board-app>
        ` as KCBoardAppElement;
        this.#commit_history_panel = html`
            <kc-commit-history-panel></kc-commit-history-panel>
        ` as KCCommitHistoryPanelElement;

        return html`
            <kc-ui-app>
                <section class="overlay">
                    <div class="hero-glow"></div>
                    <div class="circuit-pattern"></div>
                    <h1>
                        <img
                            class="logo-icon"
                            src="images/Grok_Logomark_Light.png"
                            alt="Grok" />
                        <span class="logo-text">groki</span>
                    </h1>
                    <p class="tagline">
                        <strong>AI-powered</strong> schematic intelligence
                    </p>
                    <p class="description">
                        An <strong>interactive</strong> viewer for KiCAD
                        schematics with <strong>Grok-powered</strong> component
                        analysis. Get instant summaries, understand circuit
                        blocks, and explore your designs like never before.
                    </p>
                    <div class="features">
                        <div class="feature">
                            <span class="feature-icon">🔍</span>
                            <span>Component Analysis</span>
                        </div>
                        <div class="feature">
                            <span class="feature-icon">💡</span>
                            <span>Circuit Summaries</span>
                        </div>
                        <div class="feature">
                            <img
                                class="feature-icon"
                                src="images/xAI_Logomark_Light.png"
                                alt="xAI" />
                            <span>Powered by Grok</span>
                        </div>
                    </div>
                    <input
                        name="link"
                        type="text"
                        placeholder="Paste a GitHub link to your schematic..."
                        autofocus />
                    <p class="drop-hint">or drag & drop your KiCAD files</p>
                    <p class="note">
                        Your files are processed locally in your browser.
                        Nothing ever leaves your machine.
                    </p>
                </section>
                ${this.#commit_history_panel}
                <main>${this.#schematic_app} ${this.#board_app}</main>
            </kc-ui-app>
        `;
    }

    override renderedCallback() {
        // After render, update the commit history panel if we have a repo
        if (this.#current_repo && this.#commit_history_panel) {
            later(async () => {
                await this.#commit_history_panel!.setRepo(this.#current_repo!);
                if (this.#current_commit) {
                    this.#commit_history_panel!.setSelectedCommit(
                        this.#current_commit,
                    );
                }
            });
        }
    }
}

window.customElements.define("kc-kicanvas-shell", KiCanvasShellElement);
