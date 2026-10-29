# PeerSet session prompts

Each milestone gets its own focused Claude Code session. A prompt is written only after the previous gate has passed, based on the repo's actual state and that session's final report, so each one reflects reality rather than the plan.

## How to start a session

```
cd ~/Developer/peerset
claude --permission-mode plan
```

Then type: `Read docs/prompts/M0.md and follow it.` (Change the file name for later sessions.)

When a session ends, paste its final report into the planning chat. The next prompt gets written from it.

## Roadmap

| Session | Objective | Starts from | Ends at |
| --- | --- | --- | --- |
| M0 (done, PR #1) | Environment, repo, CI, SEC-from-Vercel spike, LII and WSO fixtures | Empty folder plus blueprint | M0 gate |
| M1a (done, PR #2) | SEC client (User-Agent, pacing, retries, error classes), submissions, trimmed companyfacts, freshness check, bounded XBRL parser | Approved `methodology.md` v0; LII fixture | Parser and freshness tests green on the LII Q2 fixture |
| M1b (done, PR #3) | Fact selection, LTM, revenue / operating income / D&A / EBITDA / net income / EPS, minimal `/c/LII` page with provenance drawer, LII reconciliation | M1a merged | M1 gate (you confirm every LII row) |
| M2a (done, PR #4) | Methodology 0.3.0: debt and cash from the balance-sheet face (FilingSummary + rendered R file), EV-adjustment inputs, six balance-sheet goldens (LII, WSO, GGG, AAON, CARR, TT), LII and WSO EV-input reconciliation | M1 merged | M2a gate |
| M2b (done, PRs #5, #6) | Cover-page shares by class, quote adapter (user-entered; Alpha Vantage behind a flag), EV bridge, as-of strip, valuation UI | M2a merged | M2 gate |
| M3 (done, PR #7) | Connect Vercel to GitHub, production URL, environment variables, smoke workflow, README v1 | M2 merged | M3 gate: live URL |
| M4a (in progress) | Cache fix, peer-index script and monthly workflow, screening, exclusions | M3 live | Index PR merged; screening tests green |
| M4b | Peer panel, comps table, NM rules, statistics, lag flags, GGG and JCI fixtures, implied range if time allows | M4a merged | M4 gate |
| M5 | Three-sheet Excel export, formats, formulas with cached values, workbook tests, LibreOffice recalculation | M4 merged | M5 gate |
| M6 | UX states, accessibility, negative-EBITDA fixture, README and methodology page, interview pack | M5 merged | v1 release gate |

## Rules that hold for every session

- `docs/blueprint.md` and `docs/methodology.md` are the source of truth; `CLAUDE.md` points to them.
- Plan mode first; Jiho approves the plan.
- Every session ends with the 13-part report defined in `M0.md`, and stops at its gate.
- Pushes, merges to `main`, deploys and account changes need Jiho's yes.
