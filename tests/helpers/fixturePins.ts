// One frozen filing per ticker for the e2e suite, the export tests and the fixture
// peer index, so saving a newer fixture (LII 2026Q3 in M6) never changes what they
// see. The LII Q3 goldens load LII/2026Q3 directly.
export const FIXTURE_PINS =
  "AAON:2026Q2,CARR:2026Q2,GGG:2026Q3,JCI:2026Q2,LII:2026Q2,TT:2026Q2,WSO:2026Q2";
