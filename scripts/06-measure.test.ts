import { describe, expect, it } from "vitest";
import { pickSiteTag, previousDate, slugFromPath } from "./06-measure.ts";

describe("previousDate", () => {
  it("前日のUTC日付を返す", () => {
    expect(previousDate(new Date("2026-08-11T09:00:00Z"))).toBe("2026-08-10");
  });

  it("月をまたぐ", () => {
    expect(previousDate(new Date("2026-09-01T00:30:00Z"))).toBe("2026-08-31");
  });
});

describe("slugFromPath", () => {
  it("ツールページの slug を取り出す", () => {
    expect(slugFromPath("/t/json-format/")).toBe("json-format");
  });

  it("末尾スラッシュ無しでも取り出す", () => {
    expect(slugFromPath("/t/json-format")).toBe("json-format");
  });

  it("ツールページ以外は null", () => {
    expect(slugFromPath("/")).toBeNull();
    expect(slugFromPath("/privacy/")).toBeNull();
    expect(slugFromPath("/t/")).toBeNull();
    expect(slugFromPath("/t/a/b/")).toBeNull();
  });
});

describe("pickSiteTag", () => {
  const sites = [
    { host: "example.com", site_tag: "aaa" },
    { host: "toolsbako.com", site_tag: "bbb" },
  ];

  it("ホスト名が一致するサイトのタグを返す", () => {
    expect(pickSiteTag(sites, "toolsbako.com")).toBe("bbb");
  });

  it("大文字小文字を無視する", () => {
    expect(pickSiteTag(sites, "ToolsBako.com")).toBe("bbb");
  });

  it("www の有無を無視する", () => {
    expect(pickSiteTag(sites, "www.toolsbako.com")).toBe("bbb");
    expect(pickSiteTag([{ host: "www.a.com", site_tag: "x" }], "a.com")).toBe("x");
  });

  it("キャメルケースのフィールド名も受ける", () => {
    expect(pickSiteTag([{ hostname: "a.com", siteTag: "x" }], "a.com")).toBe("x");
  });

  it("一致しなければ null", () => {
    expect(pickSiteTag(sites, "other.com")).toBeNull();
  });

  it("空配列では null", () => {
    expect(pickSiteTag([], "a.com")).toBeNull();
  });

  it("タグが欠けていれば null", () => {
    expect(pickSiteTag([{ host: "a.com" }], "a.com")).toBeNull();
  });
});
