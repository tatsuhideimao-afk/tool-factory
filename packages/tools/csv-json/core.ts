/**
 * CSV⇄JSON変換のコアロジック。
 * 副作用なし・DOM非依存。Web版と拡張版の両方がこのファイルを import する。
 * RFC 4180 のうち実務で必要な範囲（引用符・エスケープ・セル内改行・CRLF）を扱う。
 */

export interface CsvParseOptions {
  /** 1文字。"," や "\t" など */
  delimiter: string;
  /** 先頭行をヘッダとして扱うか */
  hasHeader: boolean;
  /** 値を数値・真偽値・null に推論するか */
  inferTypes: boolean;
}

export interface CsvStringifyOptions {
  delimiter: string;
  /** 出力する列と順序。省略時は全レコードのキー和集合（初出順） */
  columns?: string[];
  /** ヘッダ行を出力するか */
  header: boolean;
  /** 改行コード */
  newline: "\n" | "\r\n";
}

export type JsonRecord = Record<string, string | number | boolean | null>;

const DEFAULT_PARSE: CsvParseOptions = {
  delimiter: ",",
  hasHeader: true,
  inferTypes: true,
};

const DEFAULT_STRINGIFY: CsvStringifyOptions = {
  delimiter: ",",
  header: true,
  newline: "\n",
};

function assertDelimiter(delimiter: string): void {
  if (delimiter.length !== 1) {
    throw new Error("区切り文字は1文字で指定してください");
  }
  if (delimiter === '"' || delimiter === "\n" || delimiter === "\r") {
    throw new Error("区切り文字にダブルクォートや改行は使えません");
  }
}

/** CSV本文を2次元配列に分解する。引用符内の区切り文字・改行はそのまま値になる。 */
export function parseCsvRows(
  text: string,
  delimiter = ",",
): string[][] {
  assertDelimiter(delimiter);
  // 先頭 BOM を落とす
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false;

  const endField = () => {
    row.push(field);
    field = "";
    touched = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      touched = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
      touched = true;
    }
  }
  if (touched || field !== "" || row.length > 0) endRow();

  // 末尾の空行は落とす
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === "") rows.pop();
    else break;
  }
  return rows;
}

function inferValue(raw: string): string | number | boolean | null {
  const t = raw.trim();
  if (t === "") return "";
  if (t === "null" || t === "NULL") return null;
  if (t === "true" || t === "TRUE") return true;
  if (t === "false" || t === "FALSE") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

/** ヘッダが空・重複していても列を失わないように一意な名前を割り当てる */
function normalizeHeader(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((name, index) => {
    const base = name.trim() === "" ? `column${index + 1}` : name.trim();
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

/** CSVテキストをオブジェクト配列に変換する。 */
export function csvToJson(
  text: string,
  options: Partial<CsvParseOptions> = {},
): JsonRecord[] {
  const opts: CsvParseOptions = { ...DEFAULT_PARSE, ...options };
  const rows = parseCsvRows(text, opts.delimiter);
  if (rows.length === 0) return [];

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const header = opts.hasHeader
    ? normalizeHeader(
        Array.from({ length: width }, (_, i) => rows[0]![i] ?? ""),
      )
    : Array.from({ length: width }, (_, i) => `column${i + 1}`);
  const body = opts.hasHeader ? rows.slice(1) : rows;

  return body.map((r) => {
    const record: JsonRecord = {};
    header.forEach((key, i) => {
      const raw = r[i] ?? "";
      record[key] = opts.inferTypes ? inferValue(raw) : raw;
    });
    return record;
  });
}

function escapeCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuote =
    s.includes(delimiter) ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r");
  return needsQuote ? `"${s.replaceAll('"', '""')}"` : s;
}

/** 全レコードのキーを初出順に集める（列が欠けているレコードがあっても落とさない） */
export function collectColumns(records: readonly object[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

/** オブジェクト配列をCSVテキストに変換する。 */
export function jsonToCsv(
  records: readonly Record<string, unknown>[],
  options: Partial<CsvStringifyOptions> = {},
): string {
  const opts: CsvStringifyOptions = { ...DEFAULT_STRINGIFY, ...options };
  assertDelimiter(opts.delimiter);
  const columns = opts.columns ?? collectColumns(records);
  const lines: string[] = [];
  if (opts.header) {
    lines.push(columns.map((c) => escapeCell(c, opts.delimiter)).join(opts.delimiter));
  }
  for (const rec of records) {
    lines.push(
      columns
        .map((c) => escapeCell(rec[c], opts.delimiter))
        .join(opts.delimiter),
    );
  }
  return lines.join(opts.newline);
}

/** JSONテキスト（配列であること）を受け取ってCSVにする。UI から呼ぶ入口。 */
export function jsonTextToCsv(
  text: string,
  options: Partial<CsvStringifyOptions> = {},
): string {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("トップレベルが配列のJSONを入力してください");
  }
  const records = parsed.map((row, i) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`${i + 1}件目がオブジェクトではありません`);
    }
    return row as Record<string, unknown>;
  });
  return jsonToCsv(records, options);
}
