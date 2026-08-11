import { describe, expect, it } from "vitest";
import {
  formatJson,
  isValidJson,
  locateJsonError,
  minifyJson,
  sortKeysDeep,
} from "./core.ts";

describe("formatJson", () => {
  it("2スペースで整形する", () => {
    const r = formatJson('{"b":1,"a":[1,2]}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it("インデント幅を4にできる", () => {
    const r = formatJson('{"a":1}', { indent: 4 });
    expect(r.ok && r.text).toBe('{\n    "a": 1\n}');
  });

  it("タブインデントにできる", () => {
    const r = formatJson('{"a":1}', { indent: "tab" });
    expect(r.ok && r.text).toBe('{\n\t"a": 1\n}');
  });

  it("sortKeys でキーを辞書順にする", () => {
    const r = formatJson('{"b":1,"a":{"d":1,"c":2}}', { sortKeys: true });
    expect(r.ok && r.text).toBe(
      '{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}',
    );
  });

  it("配列の順序は保つ", () => {
    const r = formatJson("[3,1,2]", { sortKeys: true });
    expect(r.ok && r.text).toBe("[\n  3,\n  1,\n  2\n]");
  });

  it("空入力はエラーになる", () => {
    const r = formatJson("   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("空");
  });

  it("壊れたJSONで行番号を返す", () => {
    const r = formatJson('{\n  "a": 1,\n  "b":\n}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.line).toBeGreaterThanOrEqual(3);
  });

  it("トップレベルのスカラーも通す", () => {
    expect(formatJson("42").ok).toBe(true);
    expect(formatJson('"x"').ok).toBe(true);
    expect(formatJson("null").ok).toBe(true);
  });

  it("Unicodeを壊さない", () => {
    const r = formatJson('{"k":"日本語😀"}');
    expect(r.ok && r.text).toContain("日本語😀");
  });
});

describe("locateJsonError", () => {
  it("妥当なJSONでは null", () => {
    expect(locateJsonError('{"a":[1,2,{"b":null}]}')).toBeNull();
    expect(locateJsonError(' "x" ')).toBeNull();
    expect(locateJsonError("-1.5e10")).toBeNull();
    expect(locateJsonError('{"a":"\\u00e9\\n"}')).toBeNull();
  });

  it("末尾のカンマを指摘する", () => {
    const e = locateJsonError('{"a":1,}');
    expect(e?.message).toContain("末尾のカンマ");
    expect(e?.line).toBe(1);
  });

  it("閉じ括弧の不足を指摘する", () => {
    expect(locateJsonError('{"a":1')?.message).toContain("}");
  });

  it("クォートされていないキーを指摘する", () => {
    expect(locateJsonError("{a:1}")?.message).toContain("ダブルクォート");
  });

  it("シングルクォート文字列を拒否する", () => {
    expect(locateJsonError("['x']")?.message).toContain("予期しない文字");
  });

  it("値の後ろの余分な文字を指摘する", () => {
    const e = locateJsonError("{} {}");
    expect(e?.message).toContain("余分");
    expect(e?.column).toBe(4);
  });

  it("複数行のうち壊れている行を指す", () => {
    const e = locateJsonError('{\n  "a": 1,\n  "b": ,\n  "c": 3\n}');
    expect(e?.line).toBe(3);
  });

  it("閉じられていない文字列を指摘する", () => {
    expect(locateJsonError('{"a":"x}')?.message).toContain("閉じられて");
  });

  it("不正なエスケープを指摘する", () => {
    expect(locateJsonError('"\\q"')?.message).toContain("エスケープ");
  });

  it("入れ子が深すぎる入力を止める", () => {
    const deep = "[".repeat(500) + "]".repeat(500);
    expect(locateJsonError(deep)?.message).toContain("深すぎ");
  });

  it("空入力を値なしとして扱う", () => {
    expect(locateJsonError("")?.message).toContain("値がありません");
  });
});

describe("minifyJson", () => {
  it("空白を落とす", () => {
    const r = minifyJson('{\n  "a": [1, 2]\n}');
    expect(r.ok && r.text).toBe('{"a":[1,2]}');
  });

  it("壊れた入力を拒否する", () => {
    expect(minifyJson("{oops}").ok).toBe(false);
  });
});

describe("sortKeysDeep", () => {
  it("ネストしたオブジェクトを再帰的に並べ替える", () => {
    expect(Object.keys(sortKeysDeep({ b: 1, a: 2 }) as object)).toEqual([
      "a",
      "b",
    ]);
  });

  it("null を保持する", () => {
    expect(sortKeysDeep(null)).toBeNull();
  });
});

describe("isValidJson", () => {
  it("妥当性のみ判定する", () => {
    expect(isValidJson("[]")).toBe(true);
    expect(isValidJson("[")).toBe(false);
  });
});
