/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

export function dirname(path: string | URL) {
    if (path instanceof URL) {
        path = path.pathname;
    }
    return path.split("/").slice(0, -1).join("/");
}

export function basename(path: string | URL) {
    if (path instanceof URL) {
        path = path.pathname;
    }
    return path.split("/").at(-1)!;
}

export function extension(path: string) {
    return path.split(".").at(-1) ?? "";
}

/**
 * Extract a human-readable package name from a KiCad footprint string.
 * E.g., "Resistor_SMD:R_0603_1608Metric" -> "0603"
 */
export function extractPackageFromFootprint(
    footprint: string,
): string | undefined {
    if (!footprint) return undefined;

    // Split by colon to get the footprint name (after the library prefix)
    const parts = footprint.split(":");
    const name = parts.length > 1 ? parts[1] : parts[0];
    if (!name) return undefined;

    // Common SMD package patterns - extract size codes
    const smdMatch = name.match(
        /[RC]_(\d{4})|\b(\d{4})\b|SOIC-?(\d+)|QFN-?(\d+)|TSSOP-?(\d+)|SOP-?(\d+)|SOT-?(\d+)/i,
    );
    if (smdMatch) {
        const match = smdMatch[1] || smdMatch[2] || smdMatch[0];
        return match || undefined;
    }

    // Return the name if it's short enough to be readable
    if (name.length <= 20) {
        return name;
    }

    return undefined;
}
