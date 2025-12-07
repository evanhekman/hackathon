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
import { GitHub } from "../services/github";
import { GitHubFileSystem } from "../services/github-vfs";
import { FetchFileSystem, type VirtualFileSystem } from "../services/vfs";
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
                const vfs = await GitHubFileSystem.fromURLs(...github_paths);
                await this.setup_project(vfs);
                return;
            }

            new DropTarget(this, async (fs) => {
                await this.setup_project(fs);
            });
        });

        this.link_input.addEventListener("input", async (e) => {
            const link = this.link_input.value;
            if (!GitHub.parse_url(link)) {
                return;
            }

            const vfs = await GitHubFileSystem.fromURLs(link);
            await this.setup_project(vfs);

            const location = new URL(window.location.href);
            location.searchParams.set("github", link);
            window.history.pushState(null, "", location);
        });
    }

    private async setup_project(vfs: VirtualFileSystem) {
        this.loaded = false;
        this.loading = true;

        try {
            await this.project.load(vfs);
            this.project.set_active_page(this.project.first_page);
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
                        <span class="logo-icon">⚡</span>
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
                            <span class="feature-icon">🧠</span>
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
                <main>${this.#schematic_app} ${this.#board_app}</main>
            </kc-ui-app>
        `;
    }
}

window.customElements.define("kc-kicanvas-shell", KiCanvasShellElement);
