# Alpha Vantage response fixtures

Bodies of `TIME_SERIES_DAILY` responses, used by `tests/unit/prices/alphaVantage.test.ts`
and the quotes-route integration test. No file contains an API key: recorded bodies
are written by `scripts/quote.ts --record`, which scrubs the key before writing.

| File | Origin |
| --- | --- |
| `synthetic-ok.json` | Hand-written in the documented shape (checked against the public demo response for IBM, 2026-10-26); three rows, prices invented |
| `synthetic-error.json` | Hand-written: the `"Error Message"` payload for an unknown symbol (HTTP 200) |
| `synthetic-rate-limit.json` | Hand-written: the `"Information"` payload sent when the daily limit is reached (HTTP 200) |
| `synthetic-note.json` | Hand-written: the older `"Note"` per-minute limit payload (HTTP 200) |
| `LII.json` | Recorded 2026-10-26 by `scripts/quote.ts --symbol LII --record` (latest 5 rows kept); close 376.01 on 2026-10-23 |
| `WSO.json` | Recorded 2026-10-26 the same way; close 322.98 on 2026-10-23 |
| `recorded-rate-limit-burst.json` | Recorded 2026-10-26: the reply to `WSO-B` sent seconds after the WSO call, the per-second burst notice (`"Information"`, HTTP 200) |
| `WSO-B.json` | Recorded 2026-10-26, retried after the burst notice with a pause; close 287.50 on 2026-10-23 (open, high, low and close all 287.50: Class B trades thinly). Confirms Alpha Vantage accepts SEC's spelling `WSO-B` |
