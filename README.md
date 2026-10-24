# PeerSet

PeerSet is a free, open-source, non-commercial web app that will turn a U.S. stock ticker into a first-pass trading-comparables analysis built from SEC filings, where every number links back to the filing, period and XBRL concept it came from. It is a student portfolio project; its output is unadjusted and not a substitute for analyst review.

**Status: in development (M0: setup and feasibility).** No analysis features exist yet. The plan is in [`docs/blueprint.md`](docs/blueprint.md) and the financial definitions in [`docs/methodology.md`](docs/methodology.md).

## Run it locally

Requires Node.js 24 (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # then set SEC_USER_AGENT="PeerSet (Your Name) <your email>"
npm run dev                  # open http://localhost:3000
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Passing CI means the code builds and the tests pass; it is not proof the numbers are right.

## License

[MIT](LICENSE) © 2026 Jiho Moon
