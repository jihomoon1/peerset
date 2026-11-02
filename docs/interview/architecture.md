# Architecture

```mermaid
flowchart LR
  subgraph SEC["SEC EDGAR (server only)"]
    T[ticker list]
    S[submissions]
    CF[companyfacts]
    FI[filing XBRL instance]
    BS["FilingSummary + rendered balance sheet (R page)"]
    BULK[monthly bulk files]
  end
  subgraph Adapter["src/sec: adapter (I/O)"]
    CL["client: User-Agent, ≤ 4 req/s, retries, errors"]
    FR["freshness: is companyfacts behind the latest filing?"]
  end
  subgraph Domain["src/domain: pure finance logic, no I/O"]
    LTM["fact selection → LTM bridge"]
    BAL["debt and cash from face lines"]
    VAL["market cap → EV → multiples → NM → stats → implied price"]
  end
  subgraph Peers["src/peers"]
    IDX["data/peer-index.json (built monthly)"]
    SCR["screening: SIC tiers + 0.2x–5x revenue"]
  end
  P["prices: entered by the user"]
  SNAP["one computed snapshot"]
  WEB["web: comps table + provenance drawers"]
  XLS["Excel workbook (recomputed on the server)"]

  T & S & CF --> CL
  FI & BS --> CL
  CL --> FR --> LTM
  CL --> BAL
  BULK --> IDX --> SCR
  LTM & BAL --> VAL
  SCR --> VAL
  P --> VAL
  VAL --> SNAP --> WEB
  SNAP --> XLS
```

One Next.js app with three layers. The **adapter** (`src/sec`) does all network work: it resolves the ticker, reads the company's submissions to find its latest 10-K or 10-Q, and pulls SEC's companyfacts. When companyfacts hasn't caught up with that filing yet, it parses the filing's own XBRL instance and marks those values. For debt and cash, it reads the balance sheet the company actually presents (the FilingSummary's rendered statement) to learn which lines are on the face, then takes their values from the XBRL instance. The **domain** (`src/domain`) is pure TypeScript with no network, clock or environment access, so every rule is unit-tested by feeding it facts and dates: LTM construction, EBITDA, the EV bridge, the NM policy and the statistics. Peers come from a committed index built monthly from SEC's bulk files, so screening a ticker makes no SEC calls. Prices come from the user, so no vendor license is involved. The web table and the Excel export render the same snapshot, and the export route recomputes it on the server instead of trusting numbers sent by the browser. The browser never calls SEC.
