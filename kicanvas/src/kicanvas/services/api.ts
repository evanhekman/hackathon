/*
    API service for communicating with the groki backend.
    Handles fetching commit history, schematic files at specific commits, etc.
*/

// Configure API base URL - can be overridden for different environments
// In development, the backend runs on port 443
// In production, it would be served from the same origin or proxied
const API_BASE_URL =
    (window as any).GROKI_API_URL ||
    (window.location.port === "8001" ? "http://localhost:443/api" : "/api");

export interface CommitInfo {
    commit_hash: string;
    commit_date: string | null;
    message: string | null;
}

export interface RepoCommitsResponse {
    repo: string;
    commits: CommitInfo[];
}

export interface SchematicFile {
    path: string;
    content: string;
}

export interface CommitFilesResponse {
    repo: string;
    commit: string;
    files: SchematicFile[];
}

export interface CommitInfoResponse {
    repo: string;
    commit: string;
    commit_date: string | null;
    message: string | null;
    blurb: string | null;
    description: string | null;
    changed_files: string[];
}

export class GrokiAPI {
    private static baseUrl = API_BASE_URL;

    /**
     * Set the API base URL (useful for testing or different environments)
     */
    static setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    /**
     * Get all commits that modified .kicad_sch files in a repository
     */
    static async getCommits(repo: string): Promise<CommitInfo[]> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commits`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commits: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            const data: RepoCommitsResponse = await response.json();
            return data.commits;
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Get all .kicad_sch files at a specific commit
     */
    static async getCommitFiles(
        repo: string,
        commit: string,
    ): Promise<SchematicFile[]> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commit/files`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo, commit }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commit files: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            const data: CommitFilesResponse = await response.json();
            return data.files;
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Get detailed information about a specific commit
     */
    static async getCommitInfo(
        repo: string,
        commit: string,
    ): Promise<CommitInfoResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commit/info`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo, commit }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commit info: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            return await response.json();
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Extract repo identifier from a GitHub URL
     * e.g., "https://github.com/owner/repo" -> "owner/repo"
     */
    static extractRepoFromUrl(url: string): string | null {
        try {
            const parsed = new URL(url, "https://github.com");
            const pathParts = parsed.pathname.split("/").filter(Boolean);

            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
            return null;
        } catch {
            return null;
        }
    }
}
