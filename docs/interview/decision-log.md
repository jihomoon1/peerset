# Decision log

Each decision has a full record in `docs/decisions/`.

| ADR                                                      | Decision                                                      | Why, in one line                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [0001](../decisions/0001-caching-model.md)               | Cache Components off for v1; blueprint §14's fetch Data Cache | Its entries persist across deploys; `'use cache'` entries are keyed by build ID                      |
| [0002](../decisions/0002-sec-access-from-vercel.md)      | SEC is reachable from Vercel                                  | Checked before building on it (M0)                                                                   |
| [0003](../decisions/0003-sec-bulk-files.md)              | SEC bulk-file locations                                       | The peer index is built from bulk files, not thousands of API calls                                  |
| [0004](../decisions/0004-negative-ebitda-candidate.md)   | Lucid (LCID) as the negative-EBITDA fixture                   | A recognizable operating business, so the NM path is easy to explain                                 |
| [0005](../decisions/0005-companyfacts-history-window.md) | Keep facts whose period ends within 730 days of the newest    | Small cache entries (LII: 116 KB) without hiding restatements: the window is on periods, not filings |
| [0006](../decisions/0006-balance-sheet-face.md)          | Debt and cash from the balance-sheet face                     | Tag lists missed lines and double-counted subtotals for four of six HVAC peers                       |
| [0007](../decisions/0007-share-class-mapping.md)         | Map cover-page share classes to listed tickers                | Multi-class market cap needs each class's own price                                                  |
| [0008](../decisions/0008-peer-index-format.md)           | Peer index: one company per line, NYSE/Nasdaq/Cboe universe   | One committed file, byte-identical for the same SEC files; screening makes no SEC calls              |
| [0009](../decisions/0009-peer-load-budget.md)            | Load 3 peers at a time, 2.5 SEC requests/s per instance       | Stays well under SEC's fair-access limit                                                             |
| [0010](../decisions/0010-excel-library.md)               | exceljs 4.4.0, pinned                                         | Formulas, formats and print setup in plain JavaScript on the server; never reaches the browser       |
| [0011](../decisions/0011-markdown-renderer.md)           | marked 18.1.1 for /methodology                                | No dependencies; renders the repo's own methodology file at build time                               |
