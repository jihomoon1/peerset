# 0007 — Mapping cover-page share classes to listed tickers

Date: October 26, 2026 · Status: decided in M2b (routine choices under methodology §6; no definition change)

## Problem

Methodology §6 says to take shares from the latest filing's cover page (`dei:EntityCommonStockSharesOutstanding`), sum classes only when each has a listed ticker and a price, and treat an unlisted class as Unsupported. It doesn't say how to tell which ticker belongs to which class. The six fixtures show the shapes this rule has to handle:

| Company        | Cover shares                                                    | Cover `dei:TradingSymbol`                                                                                      | SEC listings for the CIK |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| LII, AAON, GGG | one consolidated count                                          | one consolidated symbol                                                                                        | one ticker               |
| Carrier, Trane | one consolidated count                                          | per `StatementClassOfStockAxis` member: the common stock **and each listed senior note** (`CARR28`, `TT33`, …) | one ticker               |
| Watsco         | one count per class (`CommonStockMember`, `CommonClassBMember`) | per class: `WSO`, `WSOB ` (with a trailing space)                                                              | `WSO`, `WSO-B`           |

So cover symbols can't be used as they stand. Watsco's Class B is `WSOB` on the cover but `WSO-B` at SEC, and the notes' symbols aren't shares at all.

## Decision (`src/domain/capitalization.ts`)

- **Source.** Use cover facts from the latest periodic filing's own instance only: same accession, source `filing`. companyfacts drops class detail, so it is never used here. When the cover shows more than one date, the latest one is the shares-as-of date.
- **Normalizing.** Before matching, uppercase each symbol and strip `.`, `-`, `/` and whitespace. `WSOB`, `WSO-B` and `WSO.B` all become `WSOB`. The ticker we store is SEC's spelling (`WSO-B`), because that's the form users search for and the form price inputs show. The cover's own spelling is kept as `coverSymbol`.
- **SEC listings.** These are `identity.tickers`, built from the submissions file's `tickers` and `exchanges`. For both WSO and LII they are the same rows as `company_tickers_exchange.json` (checked 2026-10-26). Using them saves loading the 1 MB ticker file inside the domain.
- **Count per class.** Each class member's ticker is the cover symbol for that same member. A class with no cover symbol is **unlisted**, which makes market cap Unsupported: "unlisted share class: <member>".
- **One consolidated count.** The ticker is the one cover symbol, from any member, that SEC lists for the CIK. That drops note symbols such as `CARR28`. Three edge cases:
  - Several cover symbols are listed but there is only one share count: Unsupported ("share counts by class are needed"). Splitting one count across classes would be a guess.
  - None is listed: use the consolidated cover symbol, if one exists.
  - No symbol at all: unlisted, so Unsupported. The ticker the user typed isn't used as a fallback, because the cover is the source.
- **A cover symbol SEC doesn't list** is kept as the ticker, with the caution `W_TICKER_NOT_IN_SEC_LIST`. The company itself reports the class as registered, so calling it unlisted would be wrong. The warning lets a reviewer check it.
- **Conflicting counts** for a class within the filing make market cap Unsupported (`SOURCE_CONFLICT`). A class is never silently dropped.
- **No cover count** at all makes market cap Missing.
- **`W_SHARES_AFTER_BALANCE_SHEET`** (information only) is added whenever the cover date is after the balance-sheet date, which is the usual case (blueprint §15).
