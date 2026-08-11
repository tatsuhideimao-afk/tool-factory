import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANDIDATES_JSON,
  SITE_CONFIG,
  TOOLS_JSON,
  TOOLS_SRC_DIR,
} from "./paths.ts";
import type { Candidate, SiteConfig, ToolLedgerEntry } from "./types.ts";

export * from "./paths.ts";

/** packages/tools/ 配下に実在するツールの slug 一覧（meta.ts を持つものだけ） */
export function listToolSlugs(): string[] {
  if (!existsSync(TOOLS_SRC_DIR)) return [];
  return readdirSync(TOOLS_SRC_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(resolve(TOOLS_SRC_DIR, name, "meta.ts")))
    .sort();
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, "utf8").trim();
  if (raw === "") return fallback;
  return JSON.parse(raw) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadLedger(): ToolLedgerEntry[] {
  return readJson<ToolLedgerEntry[]>(TOOLS_JSON, []);
}

export function saveLedger(entries: ToolLedgerEntry[]): void {
  const sorted = [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(TOOLS_JSON, sorted);
}

export function loadCandidates(): Candidate[] {
  return readJson<Candidate[]>(CANDIDATES_JSON, []);
}

export function saveCandidates(candidates: Candidate[]): void {
  writeJson(CANDIDATES_JSON, candidates);
}

export function loadSiteConfig(): SiteConfig {
  const cfg = readJson<SiteConfig | null>(SITE_CONFIG, null);
  if (!cfg) throw new Error(`config/site.json がありません: ${SITE_CONFIG}`);
  return cfg;
}
