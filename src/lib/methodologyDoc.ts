// Renders docs/methodology.md for the /methodology page (M6, ADR 0011). The input is
// the repo's own file, read at build time, never user input, so the HTML is trusted.

import { Marked } from "marked";

// GitHub-style heading id, so a link works on the site and in the repo view:
// lowercase, drop everything but letters, digits, spaces and hyphens, spaces → "-".
export function headingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

export function renderMethodology(markdown: string): {
  html: string;
  ids: string[];
} {
  const ids: string[] = [];
  const uses = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const base = headingId(text.replace(/`/g, ""));
        const n = uses.get(base) ?? 0; // a count of headings, not a financial value
        uses.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        ids.push(id);
        // One level down: the page's own h1 is "How PeerSet calculates".
        const level = Math.min(depth + 1, 6);
        return `<h${level} id="${id}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
    },
  });
  const html = marked.parse(markdown, { async: false });
  return { html, ids };
}
