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
import kc_ui_styles from "../../kc-ui/kc-ui.css";
import shell_styles from "./kicanvas-shell.css";

import "../icons/sprites";
import "./common/project-panel";

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
 *     <kc-project-panel>
 *     <kc-schematic-app>
 *       <kc-schematic-viewer>
 *       <kc-ui-activity-side-bar>
 *         <kc-schematic-git-panel> (commit history)
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
    #current_repo: string | null = null;
    #current_commit: string | null = null;

    constructor() {
        super();
        this.provideContext("project", this.project);
        this.provideLazyContext("repoInfo", () => ({
            repo: this.#current_repo,
            commit: this.#current_commit,
        }));
    }

    @attribute({ type: Boolean })
    public loading: boolean;

    @attribute({ type: Boolean })
    public loaded: boolean;

    @attribute({ type: String })
    public error: string;

    @attribute({ type: String })
    public src: string;

    @query(`input[name="link"]`, true)
    public link_input: HTMLInputElement;

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
                this.clearError();
                await this.setup_project(fs);
            });
        });

        // Clear error when user types
        this.link_input.addEventListener("input", () => {
            this.clearError();
        });

        // Load on Enter key
        this.link_input.addEventListener("keydown", async (e) => {
            if (e.key !== "Enter") {
                return;
            }
            e.preventDefault();

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
        this.removeAttribute("error");

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
            } else {
                throw new Error("No commits with schematic files found");
            }
        } catch (e) {
            console.error("Backend API failed:", e);
            this.loading = false;
            this.showError(
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
        this.removeAttribute("error");
        this.#current_commit = commit;

        try {
            const vfs = await CommitFileSystem.fromCommit(repo, commit);
            await this.setup_project(vfs);
        } catch (e) {
            console.error("Failed to load commit:", e);
            this.loading = false;
            this.showError(
                `Failed to load commit ${commit.substring(
                    0,
                    7,
                )}. The commit may not exist or the backend may be unavailable.`,
            );
        }
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        const errorBar = this.renderRoot.querySelector(".error-bar");
        if (errorBar) errorBar.textContent = message;
        this.error = message;
    }

    /**
     * Clear error state
     */
    private clearError(): void {
        const errorBar = this.renderRoot.querySelector(".error-bar");
        if (errorBar) errorBar.textContent = "";
        this.removeAttribute("error");
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
                    <div class="error-bar">${this.error}</div>
                    <p class="drop-hint">or drag & drop your KiCAD files</p>
                    <p class="note">
                        Your files are processed locally in your browser.
                        Nothing ever leaves your machine.
                    </p>
                </section>
                <section class="loading-overlay">
                    <div class="hero-glow"></div>
                    <div class="circuit-pattern"></div>
                    <div class="loading-content">
                        <div class="loading-spinner">
                            <img
                                class="loading-logo"
                                src="images/Grok_Logomark_Light.png"
                                alt="Grok" />
                        </div>
                        <h2 class="loading-title">Loading Repository</h2>
                        <p class="loading-message">
                            Cloning and parsing your schematic files...
                        </p>
                        <div class="loading-progress">
                            <div class="loading-progress-bar"></div>
                        </div>
                        <p class="loading-hint">
                            This may take a moment for larger repositories
                        </p>
                    </div>
                </section>
                <main>${this.#schematic_app} ${this.#board_app}</main>
            </kc-ui-app>
        `;
    }
}

window.customElements.define("kc-kicanvas-shell", KiCanvasShellElement);
