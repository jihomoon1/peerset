// The bounded XBRL parser (blueprint §8.4). Reads the instance EDGAR extracts from an
// inline-XBRL filing and returns whitelisted facts in the same shape companyfacts
// produces, so selection code never cares where a fact came from.
//
// Namespace-aware: every element and QName is resolved through the document's own
// xmlns declarations, never by a literal prefix. Filers write <context> with no prefix
// (LII, WSO) or as <xbrli:context>, and may bind us-gaap to any prefix.

import { XMLParser } from "fast-xml-parser";
import { CONCEPT_WHITELIST, isAcceptedUnit } from "@/domain/policy";
import type {
  FilingReference,
  ReportedFinancialFact,
  ReportedTextFact,
  ReportingPeriod,
} from "@/domain/types";
import { SecSchemaChangedError } from "@/lib/errors";
import { FilingIndexSchema, parseOrThrow } from "./schemas";

const NS = {
  xbrli: "http://www.xbrl.org/2003/instance",
  xbrldi: "http://xbrl.org/2006/xbrldi",
  iso4217: "http://www.xbrl.org/2003/iso4217",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
};

// Standard taxonomies by namespace family, for any release year.
const FAMILIES: [RegExp, string][] = [
  [/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/, "us-gaap"],
  [/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/, "dei"],
  [/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/, "srt"],
];

export type InstanceLocation =
  { kind: "found"; name: string } | { kind: "no-instance"; reason: string };

export interface ParseWarning {
  code: "W_DUPLICATE_FACT_CONFLICT" | "W_UNPARSEABLE_VALUE";
  message: string;
}

export interface ParsedInstance {
  facts: ReportedFinancialFact[];
  textFacts: ReportedTextFact[];
  warnings: ParseWarning[];
}

export function locateInstance(rawIndex: unknown): InstanceLocation {
  const index = parseOrThrow(FilingIndexSchema, rawIndex, "filing index");
  const names = index.directory.item
    .map((item) => item.name)
    .filter((name) => name.endsWith("_htm.xml"));
  if (names.length === 1) return { kind: "found", name: names[0] };
  return {
    kind: "no-instance",
    reason:
      names.length === 0
        ? "no *_htm.xml in the filing index"
        : `${names.length} *_htm.xml files in the filing index`,
  };
}

// ── XML plumbing ────────────────────────────────────────────────────────────

// Every element becomes an array of nodes; text is under "#text"; attributes keep
// their prefixes under "@_". Values stay strings so nothing is rounded early.
type XmlNode = { [key: string]: XmlNode[] | string | undefined };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  alwaysCreateTextNode: true,
  isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
});

interface Resolved {
  ns: string;
  local: string;
}

class Namespaces {
  private readonly byPrefix = new Map<string, string>();

  constructor(root: XmlNode) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value !== "string") continue;
      if (key === "@_xmlns") this.byPrefix.set("", value);
      else if (key.startsWith("@_xmlns:"))
        this.byPrefix.set(key.slice(8), value);
    }
  }

  resolve(qname: string): Resolved | null {
    const colon = qname.indexOf(":");
    const prefix = colon < 0 ? "" : qname.slice(0, colon);
    const ns = this.byPrefix.get(prefix);
    return ns === undefined ? null : { ns, local: qname.slice(colon + 1) };
  }

  // "us-gaap:Revenues" for standard taxonomies; the filer's own QName otherwise. A
  // filer prefix that collides with a standard one ("us-gaap" bound to some other
  // namespace) is spelled out as "namespace#local", so it can never pass as standard.
  standardName(qname: string): string | null {
    const r = this.resolve(qname);
    if (!r) return null;
    for (const [pattern, prefix] of FAMILIES)
      if (pattern.test(r.ns)) return `${prefix}:${r.local}`;
    const prefix = qname.slice(0, Math.max(qname.indexOf(":"), 0));
    if (FAMILIES.some(([, standard]) => standard === prefix))
      return `${r.ns}#${r.local}`;
    return qname;
  }

  // Child nodes of `node` whose name resolves to the given namespace and local name.
  children(node: XmlNode, ns: string, local: string): XmlNode[] {
    const out: XmlNode[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@_") || key === "#text" || !Array.isArray(value))
        continue;
      const r = this.resolve(key);
      if (r && r.ns === ns && r.local === local) out.push(...value);
    }
    return out;
  }

  child(node: XmlNode, ns: string, local: string): XmlNode | undefined {
    return this.children(node, ns, local)[0];
  }

  attr(node: XmlNode, ns: string, local: string): string | undefined {
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith("@_") || typeof value !== "string") continue;
      const r = this.resolve(key.slice(2));
      if (r && r.ns === ns && r.local === local) return value;
    }
    return undefined;
  }
}

const text = (node: XmlNode | undefined): string =>
  typeof node?.["#text"] === "string" ? node["#text"] : "";

const plainAttr = (node: XmlNode, name: string): string | undefined => {
  const v = node[`@_${name}`];
  return typeof v === "string" ? v : undefined;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

// ── Parse ───────────────────────────────────────────────────────────────────

interface Context {
  period: ReportingPeriod;
  dimensions: Record<string, string>;
  key: string;
}

export function parseInstance(
  xml: string,
  filing: FilingReference,
): ParsedInstance {
  const doc = parser.parse(xml) as XmlNode;
  const rootEntry = Object.entries(doc).find(
    ([key, value]) => !key.startsWith("?") && Array.isArray(value),
  );
  const root = rootEntry ? (rootEntry[1] as XmlNode[])[0] : undefined;
  if (!rootEntry || !root)
    throw new SecSchemaChangedError("filing instance: no root element");
  const nsx = new Namespaces(root);
  const rootName = nsx.resolve(rootEntry[0]);
  if (!rootName || rootName.ns !== NS.xbrli || rootName.local !== "xbrl")
    throw new SecSchemaChangedError(
      `filing instance: root element is ${rootEntry[0]}, not xbrli:xbrl`,
    );

  const contexts = readContexts(root, nsx);
  const units = readUnits(root, nsx);
  const warnings: ParseWarning[] = [];

  type Numeric = Omit<ReportedFinancialFact, "filing" | "source">;
  const numeric = new Map<string, Numeric[]>();
  const textual = new Map<
    string,
    Omit<ReportedTextFact, "filing" | "source">[]
  >();

  for (const [key, value] of Object.entries(root)) {
    if (key.startsWith("@_") || !Array.isArray(value)) continue;
    const concept = nsx.standardName(key);
    if (!concept || !CONCEPT_WHITELIST.has(concept)) continue;

    for (const node of value) {
      if (nsx.attr(node, NS.xsi, "nil") === "true") continue;
      const context = contexts.get(plainAttr(node, "contextRef") ?? "");
      if (!context) continue; // unknown context, or one with a typed dimension
      const raw = text(node);
      const unitRef = plainAttr(node, "unitRef");

      if (unitRef === undefined) {
        const factKey = `${concept}|${context.key}`;
        const list = textual.get(factKey) ?? [];
        list.push({
          concept,
          value: raw,
          period: context.period,
          dimensions: context.dimensions,
        });
        textual.set(factKey, list);
        continue;
      }

      const unit = units.get(unitRef);
      if (!unit || !isAcceptedUnit(concept, unit)) continue;
      if (!DECIMAL.test(raw)) {
        warnings.push({
          code: "W_UNPARSEABLE_VALUE",
          message: `${concept} ${describePeriod(context.period)}: value "${raw.slice(0, 40)}" is not a decimal number`,
        });
        continue;
      }
      const decimalsAttr = plainAttr(node, "decimals");
      const decimals =
        decimalsAttr !== undefined && /^-?\d+$/.test(decimalsAttr)
          ? Number(decimalsAttr)
          : undefined; // "INF" or absent
      const factKey = `${concept}|${context.key}|${unit}`;
      const list = numeric.get(factKey) ?? [];
      list.push({
        concept,
        value: Number(raw),
        unit: unit as ReportedFinancialFact["unit"],
        period: context.period,
        ...(decimals !== undefined ? { decimals } : {}),
        dimensions: context.dimensions,
      });
      numeric.set(factKey, list);
    }
  }

  // Duplicates (same concept, period, dimensions and unit) collapse when values agree.
  // When they disagree, neither is kept: picking one would be a guess.
  const facts: ReportedFinancialFact[] = [];
  for (const list of numeric.values()) {
    const values = new Set(list.map((f) => f.value));
    if (values.size > 1) {
      warnings.push({
        code: "W_DUPLICATE_FACT_CONFLICT",
        message: `${list[0].concept} ${describePeriod(list[0].period)}${describeDims(list[0].dimensions)}: filing reports conflicting values ${[...values].join(", ")}; none used`,
      });
      continue;
    }
    // Keep the most precise copy's decimals.
    const best = list.reduce((a, b) =>
      (b.decimals ?? Infinity) > (a.decimals ?? Infinity) ? b : a,
    );
    facts.push({ ...best, filing, source: "filing" });
  }

  const textFacts: ReportedTextFact[] = [];
  for (const list of textual.values()) {
    const values = new Set(list.map((f) => f.value));
    if (values.size > 1) {
      warnings.push({
        code: "W_DUPLICATE_FACT_CONFLICT",
        message: `${list[0].concept} ${describePeriod(list[0].period)}${describeDims(list[0].dimensions)}: filing reports conflicting values; none used`,
      });
      continue;
    }
    textFacts.push({ ...list[0], filing, source: "filing" });
  }

  return { facts, textFacts, warnings };
}

function readContexts(root: XmlNode, nsx: Namespaces): Map<string, Context> {
  const out = new Map<string, Context>();
  for (const ctx of nsx.children(root, NS.xbrli, "context")) {
    const id = plainAttr(ctx, "id");
    const periodNode = nsx.child(ctx, NS.xbrli, "period");
    const entity = nsx.child(ctx, NS.xbrli, "entity");
    if (!id || !periodNode || !entity) continue;

    const instant = text(nsx.child(periodNode, NS.xbrli, "instant"));
    const start = text(nsx.child(periodNode, NS.xbrli, "startDate"));
    const end = text(nsx.child(periodNode, NS.xbrli, "endDate"));
    let period: ReportingPeriod;
    if (ISO_DATE.test(instant)) period = { kind: "instant", end: instant };
    else if (ISO_DATE.test(start) && ISO_DATE.test(end))
      period = { kind: "duration", start, end };
    else continue; // "forever" or date-times: not used by PeerSet

    // Dimensions may sit in the entity's segment or in the context's scenario.
    const containers = [
      ...nsx.children(entity, NS.xbrli, "segment"),
      ...nsx.children(ctx, NS.xbrli, "scenario"),
    ];
    if (
      containers.some((c) => nsx.children(c, NS.xbrldi, "typedMember").length)
    )
      continue; // typed dimensions are out of scope (blueprint §8.4)

    const dimensions: Record<string, string> = {};
    let unresolved = false;
    for (const c of containers)
      for (const m of nsx.children(c, NS.xbrldi, "explicitMember")) {
        const axis = nsx.standardName(plainAttr(m, "dimension") ?? "");
        const member = nsx.standardName(text(m));
        if (!axis || !member) unresolved = true;
        else dimensions[axis] = member;
      }
    if (unresolved) continue;

    const dimKey = Object.keys(dimensions)
      .sort()
      .map((k) => `${k}=${dimensions[k]}`)
      .join(",");
    const key = `${period.kind}|${period.start ?? ""}|${period.end}|${dimKey}`;
    out.set(id, { period, dimensions, key });
  }
  return out;
}

// unit id → "USD" | "shares" | "USD/shares" | "pure" | other (an unaccepted unit)
function readUnits(root: XmlNode, nsx: Namespaces): Map<string, string> {
  const measureName = (node: XmlNode | undefined): string => {
    const r = nsx.resolve(text(node));
    if (!r) return "?";
    if (r.ns === NS.iso4217 && r.local === "USD") return "USD";
    if (r.ns === NS.xbrli && r.local === "shares") return "shares";
    if (r.ns === NS.xbrli && r.local === "pure") return "pure";
    return `${r.ns}#${r.local}`;
  };
  const out = new Map<string, string>();
  for (const unit of nsx.children(root, NS.xbrli, "unit")) {
    const id = plainAttr(unit, "id");
    if (!id) continue;
    const measures = nsx.children(unit, NS.xbrli, "measure");
    const divide = nsx.child(unit, NS.xbrli, "divide");
    if (measures.length === 1) out.set(id, measureName(measures[0]));
    else if (divide) {
      const num = nsx.children(
        nsx.child(divide, NS.xbrli, "unitNumerator") ?? {},
        NS.xbrli,
        "measure",
      );
      const den = nsx.children(
        nsx.child(divide, NS.xbrli, "unitDenominator") ?? {},
        NS.xbrli,
        "measure",
      );
      if (num.length === 1 && den.length === 1)
        out.set(id, `${measureName(num[0])}/${measureName(den[0])}`);
    }
  }
  return out;
}

function describePeriod(p: ReportingPeriod): string {
  return p.kind === "instant" ? `at ${p.end}` : `${p.start}..${p.end}`;
}

function describeDims(d: Record<string, string>): string {
  const entries = Object.entries(d);
  return entries.length
    ? ` [${entries.map(([k, v]) => `${k}=${v}`).join(", ")}]`
    : "";
}
