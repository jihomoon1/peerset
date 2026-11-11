# Methodology 0.5.0: version field in existing goldens

Date: November 11, 2026 · Type: **definition change, no value change**

Methodology 0.5.0 (M7: banks and digital-asset companies, §13B–§13E) bumped `METHODOLOGY_VERSION` from 0.4.3 to 0.5.0. Every golden file records the version it was checked under, so the field `"methodologyVersion"` changed from `"0.4.3"` to `"0.5.0"` in these 19 files and in nothing else:

`AAON-2026Q2-balance`, `CARR-2026Q2-balance`, `GGG-2026Q3`, `GGG-2026Q3-balance`, `JCI-2026Q2`, `LCID-2026Q2`, `LCID-2026Q2-balance`, `LCID-2026Q2-valuation`, `LII-2026Q2`, `LII-2026Q2-balance`, `LII-2026Q2-valuation`, `LII-2026Q3`, `LII-2026Q3-balance`, `LII-2026Q3-valuation`, `TT-2026Q2-balance`, `WSO-2026Q2`, `WSO-2026Q2-balance`, `WSO-2026Q2-valuation`, `comps-LII-2026Q2` (all `.json` in `tests/golden/`).

**Why no value changed.** All of these companies are operating companies (SIC outside 6000–6799). For them 0.5.0 changes nothing: the comps columns, EV, debt, cash and every multiple follow the same rules. The one §9 change that could touch them (preferred-stock look-alike lines that are share counts, dividends or empty no longer block the item) moved no golden value. Evidence: after changing only the version field, the full golden suite passed with every expected value untouched (`git diff tests/golden` shows one line per file, the version).

The text notes in LCID's goldens that say "since 0.4.3" describe when a rule began and stay as written.
