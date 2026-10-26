# PeerSet — Claude Code session M2b: shares, prices, market cap, EV and the target's multiples

M2a is merged: methodology 0.3.x reads debt and cash from the balance-sheet face, six balance-sheet goldens pass, and the LII and WSO EV inputs are confirmed. This session completes one company's valuation:

- shares by class
- a price input (user-entered by default; Alpha Vantage behind a flag)
- market cap
- the EV bridge
- EV/Revenue, EV/EBITDA and P/E for the target, with the NM policy

Peers and statistics are M4. Deployment is M3, next.

Sources of truth: `docs/methodology.md` §5–§10 and §14, blueprint §6, §9, §11, §13–§16, and `CLAUDE.md`. If anything conflicts, stop and ask Jiho.

## Session setup

1. `git switch main && git pull`, then `git switch -c m2b-valuation`.
2. This file is at `docs/prompts/M2b.md`. Mark M2a done in `docs/prompts/README.md`. Commit.
3. Plan mode:
    - Read `CLAUDE.md`, the methodology, and the M1/M2a code.
    - Check the WSO cover-page facts in the fixture (class members, `dei:TradingSymbol`, `dei:SecurityExchangeName`).
    - Check Alpha Vantage's current docs for `TIME_SERIES_DAILY` and how it names class shares (e.g. `BRK-B` vs `BRK.B`).
    - Name your tools and skills: TDD for domain, systematic-debugging, verification-before-completion, the methodology-reviewer agent at the end.
4. Present the plan, then wait.

## Working mode

May run unattended in auto mode after approval. Decide routine choices and record them. Stop only for `CLAUDE.md` stopping conditions.

**Ask first:**

- `git push` and the PR
- new dependencies (none expected)
- methodology changes
- `vercel` commands

**Alpha Vantage limits.** Live calls only from a dev script, using Jiho's key in `.env.local` (`ALPHAVANTAGE_API_KEY`). There is a 25-calls-a-day free limit, so use at most 8 calls this session. Never commit the key, a response containing it, or anything derived from it. Recorded responses for tests get the key scrubbed.

## Scope — in this order

1. **Share classes (`src/domain/capitalization.ts`).**
    - **Source:** cover-page shares from the latest filing's instance: `dei:EntityCommonStockSharesOutstanding`, either consolidated or per `StatementClassOfStockAxis` member. Record the shares-as-of date.
    - **Class → ticker mapping:**
        - Read the cover-page `dei:TradingSymbol` and `dei:SecurityExchangeName` per class member.
        - Normalize symbols for matching by uppercasing and stripping `.`, `-`, `/` and spaces, so `WSOB`, `WSO-B` and `WSO.B` all match.
        - Cross-check against the SEC ticker file rows for the CIK.
    - **A class with no listed ticker** makes market cap Unsupported: "unlisted share class: <member>" (methodology §6).
    - **Build** `ShareClassCapitalization[]` (blueprint §11).
    - **Tests:**
        - LII: one class, 34,560,675 shares as of 2026-07-22, per the planning read of the instance. Verify against the 10-Q cover page.
        - WSO: Common 35,588,756 and Class B 5,663,438 as of 2026-08-04, mapped to `WSO` and `WSO-B` (as SEC's ticker file spells it).
        - Synthetic: unlisted class; a symbol that's missing from the cover.
2. **Quotes (`src/prices/`).**
    - `provider.ts`: the `QuoteProvider` interface and `QuoteSnapshot` (blueprint §11).
    - `userEntered.ts`: validate price > 0 and < 1,000,000, and that the date is a real ISO date not after the analysis date. Source `user_entered`.
    - `alphaVantage.ts`:
        - `TIME_SERIES_DAILY`, compact; take the latest row's close and date.
        - Handle error and rate-limit payloads that come back with HTTP 200 → `PRICE_RATE_LIMITED` / `PRICE_UNAVAILABLE`.
        - Allowed host `www.alphavantage.co` only.
        - Symbol mapping for class shares from the docs check.
        - Tests use recorded, scrubbed responses.
    - **`PRICE_PROVIDER` env:** `user` (the default, and production's setting until written approval exists in `docs/licensing.md`) or `alpha_vantage` (dev).
    - **Dev script `scripts/quote.ts --symbol LII`** prints the snapshot. Run it for LII, WSO, and the Class B symbol, and report what Alpha Vantage returns for Class B.
3. **Market cap and EV (`src/domain/enterpriseValue.ts`).**
    - Market cap = Σ price × shares over classes. Every class needs a price; otherwise market cap is Missing ("price needed for <ticker>").
    - EV bridge per methodology §9 using M2a's debt, cash and EV-adjustment metrics:
        - `notInEv` warnings for preferred > 0, and for NCI > 5% of market cap. WSO's NCI of 478.8M is the test case: compute at a test price and assert the warning fires or not exactly per the threshold.
    - Show all three dates: price date, balance-sheet date, shares-as-of date.
    - Add `W_PRICE_STALE` when the price date is more than 7 calendar days before the analysis date. This is a new warning code, not a methodology threshold. If you think it needs a methodology entry, include it in the plan for Jiho's approval.
4. **Multiples and NM (`src/domain/multiples.ts`, `nm.ts`).**
    - Methodology §10 exactly: EV/Revenue, EV/EBITDA, P/E.
    - NM rules: revenue ≤ 0; EBITDA ≤ 0; EPS ≤ 0; EV ≤ 0 withheld; above 100.0x NM.
    - Missing input → "—"; Unsupported passes through.
    - P/E: single-class companies only, and Unsupported when M1b's `splitSinceLastAnnual` is set.
    - Full NM-matrix unit tests.
5. **Golden valuation tests.** Prices are inputs, so the goldens use a documented test price, not market data:
    - LII at 500.00 USD as of 2026-10-23.
    - WSO Common at 450.00 and Class B at 450.00.

    Assert market cap, EV and each multiple to the dollar or to 0.01x, with the arithmetic written out in the golden file from the confirmed reconciliation inputs.
6. **Fundamentals, API and quotes route.**
    - `CompanyFundamentals` gains `shareClasses`.
    - Pricing is applied by a pure function shared by server and browser (blueprint §13: isomorphic).
    - `/api/quotes?symbols=` exists only for `alpha_vantage` mode, returning 404 in `user` mode. Cache until the next close (blueprint §14).
    - Methodology version stays in cache keys.
7. **UI on `/c/[ticker]`.**
    - **Valuation block:**
        - one price input per listed class, plus one price date;
        - paste support for "ticker, price" lines;
        - instant client-side recompute of market cap, EV and the three multiples;
        - the "Needs price" state before entry.
    - **EV-bridge drawer:** market cap by class, each debt and cash line (from M2a), not-in-EV items, EV, and all dates.
    - **As-of strip (blueprint §6):** prices as of plus source; financials LTM through; shares as of; data pulled at.
    - NM cells show "NM" with the reason as a tooltip.
    - Accessibility: labeled inputs, keyboard-only flow works, numbers in `<table>`s.
    - **Run locally:**
        - LII with a price you enter.
        - WSO with two class prices.
        - In `alpha_vantage` mode, LII autofilled (within the call budget).

        Include rendered text of the valuation block and the open EV drawer in the report.
8. **Reconciliation.** Add a "Valuation at test price" section to `docs/reconciliation/LII.md` and `WSO.md`: shares (cover page), market cap, EV, multiples, with the math, all Awaiting Jiho.
9. **Methodology-reviewer agent** over the branch. Address its findings.

## Notes

- LII files its Q3 10-Q around 2026-10-28. Keep the Q2 goldens; a Q3 fixture is a separate step after M3.
- Production stays `PRICE_PROVIDER=user` until Alpha Vantage's written approval is filed in `docs/licensing.md`.

## Out of scope

Peers, statistics and the comps table (M4); Excel (M5); deployment and Playwright (M3).

## Gate — M2 (blueprint §22)

- [ ] LII debt ties to the inclusive total; finance leases counted once *(met in M2a; keep green)*
- [ ] WSO shows both classes, each priced; its P/E is Unsupported with the reason
- [ ] The as-of strip shows price date, LTM end, cover date and pull time
- [ ] EV-bridge rows written for reconciliation (Jiho confirms)
- [ ] Alpha Vantage parser tested on recorded responses; production defaults to user-entered prices
- [ ] NM matrix tested; valuation goldens pass
- [ ] typecheck, lint, test and build pass; no key, User-Agent or email in the repo

## Finishing

1. Run the full check.
2. Ask before pushing, then push and open the PR "M2b: shares, prices, EV and target multiples".
3. Check `gh pr checks`.
4. Run the code-review plugin.
5. Don't merge.

Final report: the same 13 parts. Part 6 includes the LII and WSO valuation tables at the test prices, and what Alpha Vantage returned for LII, WSO and the Class B symbol.
