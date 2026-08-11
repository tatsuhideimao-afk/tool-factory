import { describe, expect, it } from "vitest";
import {
  collectColumns,
  csvToJson,
  jsonTextToCsv,
  jsonToCsv,
  parseCsvRows,
} from "./core.ts";

describe("parseCsvRows", () => {
  it("基本的な行と列を分解する", () => {
    expect(parseCsvRows("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("CRLF を扱える", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("引用符の中の区切り文字を値として扱う", () => {
    expect(parseCsvRows('"x,y",z')).toEqual([["x,y", "z"]]);
  });

  it("引用符の中の改行を値として扱う", () => {
    expect(parseCsvRows('"1\n2",b')).toEqual([["1\n2", "b"]]);
  });

  it("二重引用符のエスケープを解く", () => {
    expect(parseCsvRows('"He said ""hi""",b')).toEqual([['He said "hi"', "b"]]);
  });

  it("末尾の空セルを保持する", () => {
    expect(parseCsvRows("a,\n")).toEqual([["a", ""]]);
  });

  it("空文字は空配列", () => {
    expect(parseCsvRows("")).toEqual([]);
  });

  it("BOM を落とす", () => {
    expect(parseCsvRows("﻿a,b")).toEqual([["a", "b"]]);
  });

  it("タブ区切りに対応する", () => {
    expect(parseCsvRows("a\tb", "\t")).toEqual([["a", "b"]]);
  });

  it("不正な区切り文字を拒否する", () => {
    expect(() => parseCsvRows("a,b", ",,")).toThrow();
    expect(() => parseCsvRows("a,b", '"')).toThrow();
  });
});

describe("csvToJson", () => {
  it("ヘッダをキーにしたオブジェクト配列を返す", () => {
    expect(csvToJson("name,age\nalice,30")).toEqual([
      { name: "alice", age: 30 },
    ]);
  });

  it("型推論を無効化できる", () => {
    expect(csvToJson("age\n30", { inferTypes: false })).toEqual([
      { age: "30" },
    ]);
  });

  it("true/false/null を推論する", () => {
    expect(csvToJson("a,b,c\ntrue,false,null")).toEqual([
      { a: true, b: false, c: null },
    ]);
  });

  it("先頭ゼロの文字列は数値化しない", () => {
    expect(csvToJson("zip\n01234")).toEqual([{ zip: "01234" }]);
  });

  it("ヘッダなしモードでは column1.. を割り当てる", () => {
    expect(csvToJson("1,2", { hasHeader: false })).toEqual([
      { column1: 1, column2: 2 },
    ]);
  });

  it("重複ヘッダを一意化する", () => {
    expect(csvToJson("a,a\n1,2")).toEqual([{ a: 1, a_2: 2 }]);
  });

  it("空ヘッダを補完する", () => {
    expect(csvToJson(",b\n1,2")).toEqual([{ column1: 1, b: 2 }]);
  });

  it("列が足りない行を空文字で埋める", () => {
    expect(csvToJson("a,b\n1")).toEqual([{ a: 1, b: "" }]);
  });

  it("空入力は空配列", () => {
    expect(csvToJson("")).toEqual([]);
  });
});

describe("jsonToCsv", () => {
  it("ヘッダ付きで出力する", () => {
    expect(jsonToCsv([{ a: 1, b: "x" }])).toBe("a,b\n1,x");
  });

  it("区切り文字・引用符・改行を含む値をクォートする", () => {
    expect(jsonToCsv([{ a: 'x,y"z\n' }])).toBe('a\n"x,y""z\n"');
  });

  it("欠けている列を空文字で埋める", () => {
    expect(jsonToCsv([{ a: 1 }, { b: 2 }])).toBe("a,b\n1,\n,2");
  });

  it("列の指定と順序を尊重する", () => {
    expect(jsonToCsv([{ a: 1, b: 2 }], { columns: ["b"] })).toBe("b\n2");
  });

  it("ヘッダなしにできる", () => {
    expect(jsonToCsv([{ a: 1 }], { header: false })).toBe("1");
  });

  it("null を空文字として出力する", () => {
    expect(jsonToCsv([{ a: null }], { header: false })).toBe("");
  });
});

describe("jsonTextToCsv", () => {
  it("JSONテキストから変換する", () => {
    expect(jsonTextToCsv('[{"a":1}]')).toBe("a\n1");
  });

  it("配列でない入力を拒否する", () => {
    expect(() => jsonTextToCsv('{"a":1}')).toThrow(/配列/);
  });

  it("要素がオブジェクトでない場合に位置付きで失敗する", () => {
    expect(() => jsonTextToCsv("[1]")).toThrow(/1件目/);
  });
});

describe("collectColumns", () => {
  it("初出順にキーを集める", () => {
    expect(collectColumns([{ b: 1 }, { a: 1, b: 2 }])).toEqual(["b", "a"]);
  });
});

describe("往復変換", () => {
  it("CSV→JSON→CSV で内容が保たれる", () => {
    const csv = 'name,note\nalice,"a,b"\nbob,"say ""hi"""';
    const json = csvToJson(csv);
    expect(jsonToCsv(json)).toBe(csv);
  });
});
