// Renders the fixture companies once before the specs run, so the first tests
// don't all pay the cold parse at the same time (fixture mode caches in memory).
export default async function warmup() {
  for (const path of [
    "/c/LII",
    "/c/WSO",
    // LII's fixture-index peers and the ticker the specs add.
    ...["AAON", "CARR", "GGG", "JCI", "TT"].map(
      (t) => `/api/fundamentals?ticker=${t}`,
    ),
  ]) {
    const res = await fetch(`http://localhost:3000${path}`);
    if (!res.ok) throw new Error(`warm-up ${path} returned ${res.status}`);
  }
}
