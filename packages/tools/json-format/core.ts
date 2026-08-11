/**
 * JSON整形のコアロジック。
 * 副作用なし・DOM非依存。Web版と拡張版の両方がこのファイルを import する。
 */

export type IndentStyle = 2 | 4 | "tab";

export interface FormatOptions {
  indent: IndentStyle;
  /** オブジェクトのキーを再帰的に辞書順へ並べ替える */
  sortKeys: boolean;
}

export interface ParseErrorInfo {
  message: string;
  /** 1始まり。位置が特定できない場合は null */
  line: number | null;
  column: number | null;
}

export type FormatResult =
  | { ok: true; text: string }
  | { ok: false; error: ParseErrorInfo };

const DEFAULT_OPTIONS: FormatOptions = { indent: 2, sortKeys: false };

/**
 * エラー位置の特定を JSON.parse のメッセージに頼らないための自前スキャナ。
 *
 * V8 のメッセージ書式は版によって変わり、短い入力では
 * `Unexpected token '}', "..." is not valid JSON` のように
 * 文字オフセットを含まないことがある。
 * 「何行目が原因か」を出すのがこのツールの主目的なので、位置は自分で求める。
 */
class ScanError extends Error {
  readonly offset: number;
  constructor(offset: number, message: string) {
    super(message);
    this.name = "ScanError";
    this.offset = offset;
  }
}

const MAX_DEPTH = 200;

function scanJson(src: string): void {
  let i = 0;
  const n = src.length;

  const fail = (message: string, at: number = i): never => {
    throw new ScanError(Math.min(at, n), message);
  };
  const peek = (): string => (i < n ? src[i]! : "");
  const skipWs = (): void => {
    while (i < n) {
      const c = src[i]!;
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
      else break;
    }
  };

  const scanString = (): void => {
    i++; // opening quote
    for (;;) {
      if (i >= n) fail("文字列が閉じられていません", n);
      const c = src[i]!;
      if (c === '"') {
        i++;
        return;
      }
      if (c === "\\") {
        const escapeAt = i;
        i++;
        const e = src[i];
        if (e === undefined) fail("エスケープが終わっていません", n);
        if (!'"\\/bfnrtu'.includes(e!)) {
          fail(`使用できないエスケープ \\${e}`, escapeAt);
        }
        if (e === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 1, i + 5))) {
            fail("\\u のあとは16進4桁が必要です", escapeAt);
          }
          i += 4;
        }
        i++;
        continue;
      }
      if (c.charCodeAt(0) < 0x20) {
        fail("文字列の中に生の制御文字は書けません（\\n などでエスケープしてください）");
      }
      i++;
    }
  };

  const NUMBER_RE = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
  const scanNumber = (): void => {
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(src);
    if (!m || m[0] === "") fail("数値として解釈できません");
    i += m![0].length;
  };

  const scanValue = (depth: number): void => {
    if (depth > MAX_DEPTH) fail("入れ子が深すぎます");
    skipWs();
    if (i >= n) fail("値がありません", n);
    const c = src[i]!;

    if (c === "{") {
      i++;
      skipWs();
      if (peek() === "}") {
        i++;
        return;
      }
      for (;;) {
        skipWs();
        if (peek() !== '"') fail("キーはダブルクォートで囲む必要があります");
        scanString();
        skipWs();
        if (peek() !== ":") fail("キーのあとに : が必要です");
        i++;
        scanValue(depth + 1);
        skipWs();
        if (peek() === ",") {
          i++;
          skipWs();
          if (peek() === "}") fail("末尾のカンマは書けません");
          continue;
        }
        if (peek() === "}") {
          i++;
          return;
        }
        fail(i >= n ? "} が閉じられていません" : ", または } が必要です");
      }
    }

    if (c === "[") {
      i++;
      skipWs();
      if (peek() === "]") {
        i++;
        return;
      }
      for (;;) {
        scanValue(depth + 1);
        skipWs();
        if (peek() === ",") {
          i++;
          skipWs();
          if (peek() === "]") fail("末尾のカンマは書けません");
          continue;
        }
        if (peek() === "]") {
          i++;
          return;
        }
        fail(i >= n ? "] が閉じられていません" : ", または ] が必要です");
      }
    }

    if (c === '"') return scanString();
    if (c === "-" || (c >= "0" && c <= "9")) return scanNumber();
    if (src.startsWith("true", i)) {
      i += 4;
      return;
    }
    if (src.startsWith("false", i)) {
      i += 5;
      return;
    }
    if (src.startsWith("null", i)) {
      i += 4;
      return;
    }
    fail(`予期しない文字 ${JSON.stringify(c)}`);
  };

  scanValue(0);
  skipWs();
  if (i < n) fail("値のあとに余分な文字があります");
}

/** 壊れたJSONの最初の問題箇所を返す。妥当なら null。 */
export function locateJsonError(src: string): ParseErrorInfo | null {
  try {
    scanJson(src);
    return null;
  } catch (err) {
    if (err instanceof ScanError) {
      const { line, column } = offsetToLineColumn(src, err.offset);
      return { message: err.message, line, column };
    }
    throw err;
  }
}

function offsetToLineColumn(
  source: string,
  offset: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < clamped; i++) {
    if (source[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: clamped - lastNewline };
}

function toParseError(source: string, err: unknown): ParseErrorInfo {
  // まず自前スキャナで位置を出す。取れなければ元のメッセージをそのまま返す。
  const located = locateJsonError(source);
  if (located) return located;
  return {
    message: err instanceof Error ? err.message : String(err),
    line: null,
    column: null,
  };
}

/** 配列は順序を保ったまま、オブジェクトのキーだけ辞書順に並べ替える */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortKeysDeep(v);
    return out;
  }
  return value;
}

function indentToken(indent: IndentStyle): string | number {
  return indent === "tab" ? "\t" : indent;
}

/** 入力文字列を検証して整形済みJSONを返す。壊れていれば行・列付きのエラーを返す。 */
export function formatJson(
  input: string,
  options: Partial<FormatOptions> = {},
): FormatResult {
  const opts: FormatOptions = { ...DEFAULT_OPTIONS, ...options };
  if (input.trim() === "") {
    return {
      ok: false,
      error: { message: "入力が空です", line: null, column: null },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return { ok: false, error: toParseError(input, err) };
  }
  const value = opts.sortKeys ? sortKeysDeep(parsed) : parsed;
  return { ok: true, text: JSON.stringify(value, null, indentToken(opts.indent)) };
}

/** 空白を落として1行にする。 */
export function minifyJson(input: string): FormatResult {
  if (input.trim() === "") {
    return {
      ok: false,
      error: { message: "入力が空です", line: null, column: null },
    };
  }
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(input)) };
  } catch (err) {
    return { ok: false, error: toParseError(input, err) };
  }
}

/** 整形せず妥当性だけ見る（拡張版のバッジ表示用）。 */
export function isValidJson(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}
