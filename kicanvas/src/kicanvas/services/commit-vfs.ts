/*
    Virtual file system that loads schematic files from a specific git commit
    via the groki backend API.
*/

import { initiate_download } from "../../base/dom/download";
import { basename } from "../../base/paths";
import { GrokiAPI, type SchematicFile } from "./api";
import { VirtualFileSystem } from "./vfs";

/**
 * Virtual file system for loading schematics from a specific git commit.
 * Uses the groki backend API to fetch file contents.
 */
export class CommitFileSystem extends VirtualFileSystem {
    private files: Map<string, SchematicFile> = new Map();
    private loaded: boolean = false;

    constructor(
        private repo: string,
        private commit: string,
    ) {
        super();
    }

    /**
     * Create a CommitFileSystem and load all files from the API
     */
    static async fromCommit(
        repo: string,
        commit: string,
    ): Promise<CommitFileSystem> {
        const vfs = new CommitFileSystem(repo, commit);
        await vfs.loadFiles();
        return vfs;
    }

    /**
     * Load all schematic files from the API for this commit
     */
    private async loadFiles(): Promise<void> {
        if (this.loaded) {
            return;
        }

        const files = await GrokiAPI.getCommitFiles(this.repo, this.commit);

        for (const file of files) {
            const name = basename(file.path) ?? file.path;
            this.files.set(name, file);
        }

        this.loaded = true;
    }

    public override *list(): Generator<string> {
        yield* this.files.keys();
    }

    public override async has(name: string): Promise<boolean> {
        return this.files.has(name);
    }

    public override async get(name: string): Promise<File> {
        const schematicFile = this.files.get(name);

        if (!schematicFile) {
            throw new Error(`File ${name} not found in commit ${this.commit}`);
        }

        // Convert the string content to a File object
        const blob = new Blob([schematicFile.content], {
            type: "application/octet-stream",
        });
        return new File([blob], name);
    }

    public override async download(name: string): Promise<void> {
        initiate_download(await this.get(name));
    }

    /**
     * Get the repository identifier
     */
    public getRepo(): string {
        return this.repo;
    }

    /**
     * Get the commit hash
     */
    public getCommit(): string {
        return this.commit;
    }
}
