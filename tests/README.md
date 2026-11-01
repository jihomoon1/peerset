# PeerSet tests

| Folder          | What it checks                                                                                                            | Command                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `unit/`         | Pure logic: domain finance rules, SEC parsing, formatting, UI helpers                                                     | `npm test`                     |
| `golden/`       | Every financial value against the filing it came from (see `docs/reconciliation/`)                                        | `npm test`                     |
| `integration/`  | API route handlers, the peer index build, fixture mode                                                                    | `npm test`                     |
| `workbook/`     | The Excel export: cells, formats, formulas                                                                                | `npm test`                     |
| `../e2e/`       | The app in a real browser, in fixture mode (no live SEC calls)                                                            | `npm run build && npm run e2e` |
| `fixtures/sec/` | Frozen SEC responses, one folder per ticker and as-of quarter; `evidence/` holds the rendered statements cited by goldens | —                              |

CI never calls live SEC: every test reads `fixtures/sec/`.

## Tests that skip on purpose

Three tests run only when their requirement is present. Each one says why in its own code comment; this list is the summary.

| Test                                                                          | Skips when                                      | Why                                                                | Where it always runs                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `workbook/libreoffice.test.ts` (independent recalculation)                    | LibreOffice (`soffice`) isn't installed         | LibreOffice isn't a project dependency; most laptops don't have it | CI's `workbook-recalc` job installs it and sets `REQUIRE_LIBREOFFICE=1`, so a missing binary fails there |
| `integration/fixtureModeRefusal.test.ts` (fixture mode refused in production) | There is no production build (`.next/BUILD_ID`) | It starts `next start`, which needs a build                        | CI's e2e job, which runs it right after `npm run build`                                                  |
| `e2e/screenshot.spec.ts` (README and mobile images)                           | `SCREENSHOT=1` isn't set                        | It rewrites `docs/images/`, which should only change on purpose    | Run by hand: `SCREENSHOT=1 npm run e2e -- screenshot`                                                    |

So a local `npm test` without LibreOffice reports "2 skipped" (the LibreOffice file's two tests), and `npm run e2e` reports "2 skipped" (the screenshot file's two tests, until `SCREENSHOT=1`).

## Test-only switches (fixture mode only)

Fixture mode (`PEERSET_SEC_FIXTURES=1`) is refused in production (`src/lib/fixtureMode.ts`).

- `PEERSET_FIXTURE_ASOF="LII:2026Q2,…"` pins one saved filing per ticker (`tests/helpers/fixturePins.ts`).
- `PEERSET_FIXTURE_FAULTS="GM:429"` answers every SEC URL for that ticker's CIK with that HTTP status, for the "rate-limited" UX state. GM has no saved filing, so no other test reaches it.
