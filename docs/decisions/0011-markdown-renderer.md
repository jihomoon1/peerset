# 0011 — Markdown renderer for /methodology: marked

Date: November 1, 2026 · Status: accepted (M6; the M6 prompt pre-approves one markdown renderer)

## Context

The `/methodology` page shows `docs/methodology.md`, the single source of truth for PeerSet's definitions. A hand-copied page would drift from the file, so the page renders the file itself at build time. The file uses GFM (GitHub-flavored Markdown) tables, inline code and headings that the comps table's column headers deep-link to.

## Options

| Option         | Dependencies                       | GFM tables         | Heading ids             | Notes                                                          |
| -------------- | ---------------------------------- | ------------------ | ----------------------- | -------------------------------------------------------------- |
| **marked**     | none                               | built in           | a small custom renderer | One package, synchronous API, maintained                       |
| react-markdown | about 30 (remark/rehype ecosystem) | needs `remark-gfm` | needs `rehype-slug`     | Renders to React elements; several packages to approve and pin |
| markdown-it    | a few                              | built in           | needs a plugin          | Similar to marked, but heading ids need another package        |

## Decision

Use **marked**, pinned exactly at **18.1.1** (released October 12, 2026, about three weeks before adoption; 18.1.2 was six days old and was skipped on purpose). `npm ls marked` shows no transitive dependencies.

- Used only on the server, in `src/lib/methodologyDoc.ts`, from the statically generated page `src/app/methodology/page.tsx` (`dynamic = "force-static"`). No marked code ships to the browser.
- Heading ids follow GitHub's rule (lowercase, keep letters, digits, spaces and hyphens, spaces become `-`), so `#5-diluted-eps-and-pe` works on the site and in the GitHub file view. Headings are shifted down one level so the page has one `h1`.
- `src/lib/methodologyLinks.ts` maps each comps column to its section; `tests/unit/lib/methodologyDoc.test.ts` fails if a linked anchor disappears from the document.

## Security

marked does not sanitize HTML. That is acceptable here because the only input is `docs/methodology.md` from this repository, read at build time; no user input ever reaches the renderer. If that ever changes, add a sanitizer first.

## Consequences

- Editing `docs/methodology.md` updates the page on the next build.
- Renaming a linked section heading breaks the anchor test, not the site silently.
- `npm audit` reports existing moderate advisories (minimatch, uuid) from eslint and exceljs; marked adds none.
