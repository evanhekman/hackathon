/*
    Shared Markdown Formatter - Converts markdown text to styled HTML.
    
    Supports:
    - Headers (h1-h4)
    - Bold text (**text**)
    - Inline code (`code`)
    - Code blocks (```)
    - Bullet lists (-)
    - Numbered lists (1.)
    - Links [text](url)
    - Citation links [[1]](url)
    - Plain URLs
*/

import { css } from "../../base/web-components";

/**
 * Configuration options for the markdown formatter
 */
export interface MarkdownFormatterOptions {
    /** Prefix for CSS class names (default: "md") */
    classPrefix?: string;
    /** Whether to escape HTML in input (default: true) */
    escapeHtml?: boolean;
    /** Whether to add line breaks between paragraphs (default: true) */
    addLineBreaks?: boolean;
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format markdown text to HTML string
 */
export function formatMarkdown(
    text: string,
    options: MarkdownFormatterOptions = {},
): string {
    const { classPrefix = "md", escapeHtml: shouldEscape = true, addLineBreaks = true } = options;

    let formatted = shouldEscape ? escapeHtml(text) : text;

    // Handle code blocks first (before other processing)
    formatted = formatted.replace(
        /```(\w*)\n?([\s\S]*?)```/g,
        (_, lang, code) => {
            const langClass = lang ? ` ${classPrefix}-lang-${lang}` : "";
            return `<pre class="${classPrefix}-code-block${langClass}"><code>${code.trim()}</code></pre>`;
        },
    );

    // Handle headers (must do before other processing)
    formatted = formatted
        .replace(/^#### (.+)$/gm, `<h4 class="${classPrefix}-h4">$1</h4>`)
        .replace(/^### (.+)$/gm, `<h3 class="${classPrefix}-h3">$1</h3>`)
        .replace(/^## (.+)$/gm, `<h2 class="${classPrefix}-h2">$1</h2>`)
        .replace(/^# (.+)$/gm, `<h1 class="${classPrefix}-h1">$1</h1>`);

    // Handle bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Handle italic
    formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Handle inline code (but not inside code blocks)
    formatted = formatted.replace(/`([^`]+)`/g, `<code class="${classPrefix}-inline-code">$1</code>`);

    // Handle citation-style links first: [[1]](url) -> superscript link
    formatted = formatted.replace(
        /\[\[(\d+)\]\]\(([^)]+)\)/g,
        `<sup><a href="$2" target="_blank" rel="noopener noreferrer" class="${classPrefix}-citation">[$1]</a></sup>`,
    );

    // Handle standard markdown links: [text](url)
    formatted = formatted.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        `<a href="$2" target="_blank" rel="noopener noreferrer" class="${classPrefix}-link">$1</a>`,
    );

    // Handle plain URLs (but not already in href)
    formatted = formatted.replace(
        /(?<!href=")(https?:\/\/[^\s<>"]+)/g,
        `<a href="$1" target="_blank" rel="noopener noreferrer" class="${classPrefix}-link">$1</a>`,
    );

    // Handle bullet points and numbered lists with proper wrapping
    const lines = formatted.split("\n");
    let inList = false;
    let listType = "";
    const processedLines: string[] = [];

    for (const line of lines) {
        const bulletMatch = line.match(/^(\s*)[-•] (.+)$/);
        const numberMatch = line.match(/^(\s*)(\d+)\. (.+)$/);

        if (bulletMatch) {
            if (!inList || listType !== "ul") {
                if (inList) processedLines.push(`</${listType}>`);
                processedLines.push(`<ul class="${classPrefix}-list">`);
                inList = true;
                listType = "ul";
            }
            processedLines.push(`<li>${bulletMatch[2]}</li>`);
        } else if (numberMatch) {
            if (!inList || listType !== "ol") {
                if (inList) processedLines.push(`</${listType}>`);
                processedLines.push(`<ol class="${classPrefix}-list">`);
                inList = true;
                listType = "ol";
            }
            processedLines.push(`<li>${numberMatch[3]}</li>`);
        } else {
            if (inList) {
                processedLines.push(`</${listType}>`);
                inList = false;
                listType = "";
            }
            // Don't add <br> after headers, code blocks, or empty lines
            const isSpecialLine =
                line.trim() === "" ||
                line.includes(`<h1 class="${classPrefix}`) ||
                line.includes(`<h2 class="${classPrefix}`) ||
                line.includes(`<h3 class="${classPrefix}`) ||
                line.includes(`<h4 class="${classPrefix}`) ||
                line.includes(`<pre class="${classPrefix}`) ||
                line.includes("</pre>");

            if (isSpecialLine || !addLineBreaks) {
                processedLines.push(line);
            } else {
                processedLines.push(line + "<br>");
            }
        }
    }
    if (inList) processedLines.push(`</${listType}>`);

    formatted = processedLines.join("\n");

    // Clean up extra <br> tags
    formatted = formatted.replace(/<br>\s*<br>/g, "<br>");
    formatted = formatted.replace(/<br>\s*<\/ul>/g, "</ul>");
    formatted = formatted.replace(/<br>\s*<\/ol>/g, "</ol>");
    formatted = formatted.replace(/<br>\s*<ul/g, "<ul");
    formatted = formatted.replace(/<br>\s*<ol/g, "<ol");
    formatted = formatted.replace(/<br>\s*<pre/g, "<pre");
    formatted = formatted.replace(/<\/pre>\s*<br>/g, "</pre>");

    return formatted;
}

/**
 * Format markdown text and return as HTMLElement
 */
export function formatMarkdownToElement(
    text: string,
    options: MarkdownFormatterOptions = {},
): HTMLElement {
    const container = document.createElement("div");
    container.innerHTML = formatMarkdown(text, options);
    return container;
}

// =============================================================================
// Shared Markdown Styles - Static definitions for known prefixes
// =============================================================================

/**
 * Markdown styles using "grok" prefix (for Grok AI responses)
 * Accent: golden yellow
 */
export const grokMarkdownStyles = css`
    /* Headers */
    .grok-h1 {
        color: rgba(255, 206, 84, 0.95);
        margin: 0.8em 0 0.4em 0;
        font-size: 1.2em;
        font-weight: 700;
        border-bottom: 1px solid rgba(255, 206, 84, 0.4);
        padding-bottom: 0.25em;
        line-height: 1.3;
    }

    .grok-h2 {
        color: rgba(255, 206, 84, 0.9);
        margin: 0.7em 0 0.35em 0;
        font-size: 1.1em;
        font-weight: 600;
        line-height: 1.3;
    }

    .grok-h3 {
        color: rgba(255, 255, 255, 0.95);
        margin: 0.6em 0 0.3em 0;
        font-size: 1em;
        font-weight: 600;
        line-height: 1.3;
    }

    .grok-h4 {
        color: rgba(255, 255, 255, 0.8);
        margin: 0.5em 0 0.25em 0;
        font-size: 0.95em;
        font-weight: 600;
        line-height: 1.3;
    }

    .grok-h1:first-child,
    .grok-h2:first-child,
    .grok-h3:first-child {
        margin-top: 0;
    }

    /* Links */
    .grok-link {
        color: #60a5fa;
        text-decoration: none;
        border-bottom: 1px dotted rgba(96, 165, 250, 0.5);
        transition: all 0.15s;
    }

    .grok-link:hover {
        color: #93c5fd;
        border-bottom-color: #93c5fd;
    }

    .grok-citation {
        color: #22c55e;
        text-decoration: none;
        font-size: 0.8em;
    }

    .grok-citation:hover {
        color: #4ade80;
    }

    /* Lists */
    .grok-list {
        margin: 0.4em 0;
        padding-left: 1.4em;
    }

    .grok-list li {
        margin: 0.2em 0;
        line-height: 1.5;
    }

    .grok-list li::marker {
        color: rgba(255, 206, 84, 0.6);
    }

    /* Inline Code */
    .grok-inline-code {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.1em 0.35em;
        border-radius: 3px;
        font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
        font-size: 0.88em;
        color: #f0abfc;
    }

    /* Code Blocks */
    .grok-code-block {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 0.6em 0.8em;
        margin: 0.6em 0;
        overflow-x: auto;
    }

    .grok-code-block code {
        font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
        font-size: 0.85em;
        color: rgba(255, 255, 255, 0.9);
        background: none;
        padding: 0;
    }

    /* Text formatting in response content */
    .response-content strong {
        color: rgba(255, 206, 84, 0.95);
        font-weight: 600;
    }

    .response-content em {
        font-style: italic;
        color: rgba(255, 255, 255, 0.85);
    }
`;

/**
 * Markdown styles using "md" prefix (general purpose)
 * Accent: blue
 */
export const markdownStyles = css`
    /* Headers */
    .md-h1 {
        color: #60a5fa;
        margin: 1em 0 0.5em 0;
        font-size: 1.3em;
        font-weight: 700;
        border-bottom: 1px solid rgba(96, 165, 250, 0.4);
        padding-bottom: 0.3em;
        line-height: 1.3;
    }

    .md-h2 {
        color: #60a5fa;
        margin: 0.9em 0 0.4em 0;
        font-size: 1.15em;
        font-weight: 600;
        line-height: 1.3;
    }

    .md-h3 {
        color: rgba(255, 255, 255, 0.95);
        margin: 0.7em 0 0.35em 0;
        font-size: 1.05em;
        font-weight: 600;
        line-height: 1.3;
    }

    .md-h4 {
        color: rgba(255, 255, 255, 0.8);
        margin: 0.5em 0 0.25em 0;
        font-size: 1em;
        font-weight: 600;
        line-height: 1.3;
    }

    .md-h1:first-child,
    .md-h2:first-child,
    .md-h3:first-child {
        margin-top: 0;
    }

    /* Links */
    .md-link {
        color: #60a5fa;
        text-decoration: none;
        border-bottom: 1px dotted rgba(96, 165, 250, 0.5);
        transition: all 0.15s;
    }

    .md-link:hover {
        color: #93c5fd;
        border-bottom-color: #93c5fd;
    }

    .md-citation {
        color: #22c55e;
        text-decoration: none;
        font-size: 0.8em;
    }

    .md-citation:hover {
        color: #4ade80;
    }

    /* Lists */
    .md-list {
        margin: 0.5em 0;
        padding-left: 1.5em;
    }

    .md-list li {
        margin: 0.25em 0;
        line-height: 1.5;
    }

    .md-list li::marker {
        color: rgba(96, 165, 250, 0.7);
    }

    /* Inline Code */
    .md-inline-code {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.15em 0.4em;
        border-radius: 3px;
        font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
        font-size: 0.9em;
        color: #f0abfc;
    }

    /* Code Blocks */
    .md-code-block {
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 0.75em 1em;
        margin: 0.75em 0;
        overflow-x: auto;
    }

    .md-code-block code {
        font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
        font-size: 0.85em;
        color: rgba(255, 255, 255, 0.9);
        background: none;
        padding: 0;
    }

    /* Text formatting */
    strong {
        color: #60a5fa;
        font-weight: 600;
    }

    em {
        font-style: italic;
        color: rgba(255, 255, 255, 0.85);
    }
`;
