import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** リポジトリルート（packages/shared/src から 3 階層上） */
export const REPO_ROOT = resolve(here, "..", "..", "..");

export const TOOLS_SRC_DIR = resolve(REPO_ROOT, "packages", "tools");
export const DATA_DIR = resolve(REPO_ROOT, "data");
export const CONFIG_DIR = resolve(REPO_ROOT, "config");
export const WEB_APP_DIR = resolve(REPO_ROOT, "apps", "web");
export const WEB_DIST_DIR = resolve(WEB_APP_DIR, "dist");
export const BUILD_DIR = resolve(REPO_ROOT, "build");

export const CANDIDATES_JSON = resolve(DATA_DIR, "candidates.json");
export const TOOLS_JSON = resolve(DATA_DIR, "tools.json");
export const METRICS_DB = resolve(DATA_DIR, "metrics.sqlite");
export const METRICS_SCHEMA = resolve(DATA_DIR, "schema.sql");
export const SITE_CONFIG = resolve(CONFIG_DIR, "site.json");
export const SEEDS_YML = resolve(CONFIG_DIR, "seeds.yml");
