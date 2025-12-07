/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { extractPackageFromFootprint } from "../../../base/paths";
import type { TooltipData } from "../../../kc-ui";
import { Footprint, Via, Zone } from "../../../kicad/board";
import { BoardViewer } from "../../../viewers/board/viewer";
import { KCViewerElement } from "../common/viewer";

export class KCBoardViewerElement extends KCViewerElement<BoardViewer> {
    protected override update_theme(): void {
        this.viewer.theme = this.themeObject.board;
    }

    protected override make_viewer(): BoardViewer {
        return new BoardViewer(
            this.canvas,
            !this.disableinteraction,
            this.themeObject.board,
        );
    }

    protected override getTooltipData(item: unknown): TooltipData | null {
        // Handle Footprint
        if (item instanceof Footprint) {
            return {
                type: "Footprint",
                reference: item.reference,
                value: item.value || undefined,
                package: extractPackageFromFootprint(item.library_link),
            };
        }

        // Handle Via
        if (item instanceof Via) {
            return {
                type: "Via",
                netName: item.netname,
            };
        }

        // Handle Zone
        if (item instanceof Zone) {
            return {
                type: "Zone",
                netName: item.net_name || item.name,
            };
        }

        return null;
    }
}

window.customElements.define("kc-board-viewer", KCBoardViewerElement);
