# 0010 — Excel library: exceljs 4.4.0, pinned

Date: November 1, 2026 · Status: approved by Jiho Moon in M5 planning (exceljs is on CLAUDE.md's approved list for M5)

## Context

M5 writes a three-sheet workbook (blueprint §17): formulas with cached results, number formats, fonts and fills, frozen panes, print setup, hyperlinks and a full recalculation on open. ExcelJS does all of that in plain JavaScript on the Node runtime, with no native code.

## Decision

- **`exceljs` 4.4.0, exact version, no caret** (`"exceljs": "4.4.0"`). 4.4.0 was published October 19, 2023 and is still the latest stable release; the only newer version is `4.4.1-prerelease.0` (December 20, 2024), which we don't use. With a slow-moving library, a caret range would let an untested release in silently, so upgrades are deliberate and go through the workbook tests.
- It is a **runtime** dependency, used only by `src/export/` and `/api/export` (Node runtime). It never reaches the browser bundle.
- **Buffer, not the streaming writer.** The workbook is built in memory and written with `workbook.xlsx.writeBuffer()`. The comps-golden file is about 30–60 KB (13 companies at most), far under Vercel's 4.5 MB response limit, so streaming gains nothing, and ExcelJS's streaming `WorkbookWriter` drops rows once committed, which would complicate formulas that point back at earlier rows.

## `npm audit` (November 1, 2026)

Before exceljs: 16 moderate, 0 high (all from the ESLint toolchain). After: **24 moderate, 0 high, 0 critical.** The new ones come through exceljs's own dependencies:

| Advisory                                                                                  | Path                                                                  | Why it doesn't reach PeerSet                                                                                                                           |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `minimatch` ReDoS via glob patterns (GHSA-g3hv-75wg-m249)                                 | exceljs → archiver → readdir-glob / archiver-utils → glob → minimatch | archiver's glob matching runs only when archiving a directory from disk. ExcelJS adds in-memory buffers to its zip; no pattern ever comes from a user. |
| `uuid` missing buffer bounds check in v3/v5/v6 when `buf` is passed (GHSA-w5hq-g745-h8pq) | exceljs → uuid 8                                                      | ExcelJS calls `uuid.v4()` without a buffer.                                                                                                            |

`npm audit fix --force` would "fix" these by downgrading to exceljs 3.4.0, a breaking change, so it is not applied. CI's audit check is for high severity (blueprint §15); these are moderate. Revisit on the next exceljs release.

## Formula injection (blueprint §15)

Every text cell is written as an explicit string through `src/export/sanitize.ts`. Text starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading apostrophe. ExcelJS doesn't document Excel's hidden `quotePrefix` style, so the apostrophe is part of the stored text and is visible. That is the plain, portable form of the rule: a string cell is never evaluated, and the apostrophe also survives copy-paste into CSV.

## Workbook layout decisions (M5)

- **Inputs live on Calculations** (Jiho, M5 planning). Every hardcoded number (blue) is on sheet 2, once per company. Sheet 1 is green links to sheet 2 plus black formulas (EBITDA margin, EV multiples, statistics, implied valuation). P/E is computed on sheet 2 next to the price and the LTM EPS, and linked.
- **Text never stands in for a number.** A cell holds a number or a formula only when the domain status is Reported or Derived. NM, "—" and Unsupported are grey right-aligned text, with the reason in a cell note. Excel's AVERAGE, MEDIAN, MAX, MIN, COUNT and PERCENTILE.INC skip text, so the workbook's statistics use exactly the values `stats.ts` uses. A statistic with no valid value is written as "—", because Excel's MAX and MIN of nothing would show 0.
- **Newer functions carry Excel's `_xlfn.` prefix in the file** (`_xlfn.PERCENTILE.INC`); without it Excel shows `#NAME?` until the cell is re-entered.
- Peers that failed to load are listed under the table, outside every statistics range.
- Values are stored in USD millions at full precision (÷ 1,000,000, never rounded); number formats do the rounding. Formula cells carry cached results equal to the domain values, and `fullCalcOnLoad` is set.
- Export prices are keyed by listed ticker per class (`WSO`, `WSO-B`), the same state the URL encodes.
- **The export treats every price as user-entered, at the one price date sent.** That is the production mode (blueprint §9). In local Alpha Vantage mode the screen can hold provider quotes with their own dates, which the export doesn't carry; if that mode ever reaches production, the request must send per-symbol dates and sources.
- **Two formats beyond blueprint §17's table:** a nonzero amount under 0.05M uses `#,##0.000_);(#,##0.000)` so it never reads 0.0 (AAON's $13,000 cash), and shares in millions use the same three decimals.
- **Totals tie out or say so.** Market cap, total debt and cash are a `SUM` of the lines above them when those lines add up to the domain's total within half a cent. If they don't (which no golden company does), the domain total is written as a blue input with the note "Total as computed by PeerSet", never as a formula that would give a different number.
- **A non-finite value fails the export.** If a Reported or Derived value is not a finite number (for example a cover share count of 0, making an implied price infinite), the writer throws and the route answers 500 rather than write a false number. The screen's statistics treat such a value as an exclusion, so in that rare case the screen shows a table and the export refuses.
- **Statistics rows:** Mean, Median, High, Low, 25th and 75th percentile, n and n excluded, always (methodology §11, matching the web table; blueprint §17 lists only the first five and n). "n excluded" counts peers in the range shown as NM, — or Unsupported; peers that failed to load are listed under the table and named in that cell's note.
- **ExcelJS quirk with a result of 0:** ExcelJS writes a cached result of 0 correctly (`<v>0</v>`), but its `cell.value` getter leaves out any falsy field, so a result of 0 is missing both in memory and after reading a file back. Tests that need such values, including both sides of the LibreOffice comparison, read cached values from the sheet XML (`tests/helpers/zip.ts`, `cachedValues`). Excel and LibreOffice are unaffected.

## LibreOffice recalculation (CI)

Cached results only prove PeerSet stored the right numbers; they don't prove the formulas next to them compute those numbers. So CI's `workbook-recalc` job recalculates the workbook in a second, independent spreadsheet engine.

- The job installs `libreoffice-calc` from Ubuntu's packages on the CI runner only (`sudo apt-get install -y --no-install-recommends libreoffice-calc`). It is not a project dependency and nothing is installed on a developer machine.
- `tests/workbook/libreoffice.test.ts` builds the comps-golden workbook, writes a copy with **every cached formula result removed**, and converts it headlessly with a throwaway LibreOffice profile set to "Recalculation on file load: Always" (`OOXMLRecalcMode = 0`):

  ```bash
  soffice -env:UserInstallation=file:///tmp/peerset-recalc-…/profile \
    --headless --norestore --convert-to xlsx --outdir out in/comps-golden.xlsx
  ```

- It reads the converted file back with ExcelJS and requires every formula on all three sheets (about 357) to equal PeerSet's cached result, to 1e-9 relative (text results such as `HYPERLINK`'s exactly). Because the input had no cached values, any number in the output was computed by LibreOffice.
- The job sets `REQUIRE_LIBREOFFICE=1`, so a missing `soffice` fails there. Elsewhere (`npm test` locally and in the main CI job) the test is skipped when `soffice` isn't installed.
- To run it by hand: install LibreOffice, then `REQUIRE_LIBREOFFICE=1 npx vitest run tests/workbook/libreoffice.test.ts` (set `SOFFICE` to the binary's path if it isn't on `PATH`; on macOS `/Applications/LibreOffice.app/Contents/MacOS/soffice`). `npx tsx scripts/export-golden-workbook.ts --out output/comps-golden.xlsx [--strip-results]` writes the same file to open by hand.
