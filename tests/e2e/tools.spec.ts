/**
 * 品質ゲート3（仕様 5.3）: 実際にページを開き、代表的な入力に対して
 * 期待した出力が得られることを確認する。
 * ここが落ちたらデプロイしない。
 */
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { listToolSlugs } from "@tf/shared/node";

const slugs = listToolSlugs();

test("トップページに全ツールへの導線がある", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("ツール");
  for (const slug of slugs) {
    await expect(page.locator(`a[href="/t/${slug}/"]`)).toHaveCount(1);
  }
});

test("sitemap.xml に全ツールのURLが載っている", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  for (const slug of slugs) {
    expect(xml).toContain(`/t/${slug}/`);
  }
});

test("robots.txt が sitemap を指している", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(await res.text()).toContain("Sitemap:");
});

for (const slug of slugs) {
  test(`${slug}: ページの基本要素が揃っている`, async ({ page }) => {
    await page.goto(`/t/${slug}/`);
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("h1")).toBeVisible();

    // 構造化データ（仕様 5.4）
    const ld = await page.locator('script[type="application/ld+json"]').innerText();
    const parsed = JSON.parse(ld) as { "@type": string };
    expect(parsed["@type"]).toBe("SoftwareApplication");

    // 使い方3ステップ
    await expect(page.locator(".steps li")).toHaveCount(3);

    // 外部送信しない旨の明記（仕様 5.3 の必須制約）
    await expect(
      page.getByText("サーバへ送信・保存されることはありません"),
    ).toBeVisible();

    // JS エラーが出ていないこと
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForTimeout(200);
    expect(errors).toEqual([]);
  });
}

test("json-format: 代表的な入力を整形できる", async ({ page }) => {
  await page.goto("/t/json-format/");
  await page.getByTestId("jf-input").fill('{"b":1,"a":[1,2]}');
  await page.getByTestId("jf-sort").check();
  await page.getByTestId("jf-format").click();
  await expect(page.getByTestId("jf-output")).toHaveValue(
    '{\n  "a": [\n    1,\n    2\n  ],\n  "b": 1\n}',
  );
  await expect(page.getByTestId("jf-status")).toHaveAttribute("data-state", "ok");
});

test("json-format: 壊れたJSONで行番号を示す", async ({ page }) => {
  await page.goto("/t/json-format/");
  await page.getByTestId("jf-input").fill('{\n  "a": 1,\n  "b": ,\n}');
  await page.getByTestId("jf-format").click();
  const status = page.getByTestId("jf-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("3行");
});

test("json-format: 圧縮できる", async ({ page }) => {
  await page.goto("/t/json-format/");
  await page.getByTestId("jf-input").fill('{\n  "a": 1\n}');
  await page.getByTestId("jf-minify").click();
  await expect(page.getByTestId("jf-output")).toHaveValue('{"a":1}');
});

test("csv-json: CSVをJSONに変換できる", async ({ page }) => {
  await page.goto("/t/csv-json/");
  await page.getByTestId("cj-input").fill("name,age\nalice,30");
  await page.getByTestId("cj-convert").click();
  await expect(page.getByTestId("cj-output")).toHaveValue(
    JSON.stringify([{ name: "alice", age: 30 }], null, 2),
  );
});

test("csv-json: JSONをCSVに変換できる", async ({ page }) => {
  await page.goto("/t/csv-json/");
  await page.getByTestId("cj-input").fill('[{"name":"alice","age":30}]');
  await page.getByTestId("cj-direction").selectOption("json2csv");
  await page.getByTestId("cj-convert").click();
  await expect(page.getByTestId("cj-output")).toHaveValue("name,age\nalice,30");
});

test("csv-json: 壊れた入力をエラー表示する", async ({ page }) => {
  await page.goto("/t/csv-json/");
  await page.getByTestId("cj-input").fill("{not json}");
  await page.getByTestId("cj-direction").selectOption("json2csv");
  await page.getByTestId("cj-convert").click();
  await expect(page.getByTestId("cj-status")).toHaveAttribute("data-state", "error");
});

test("pdf-merge: 2つのPDFを結合してダウンロードできる", async ({ page }) => {
  const makePdf = async (pages: number): Promise<Buffer> => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
    return Buffer.from(await doc.save());
  };

  await page.goto("/t/pdf-merge/");
  await page.getByTestId("pm-files").setInputFiles([
    { name: "a.pdf", mimeType: "application/pdf", buffer: await makePdf(2) },
    { name: "b.pdf", mimeType: "application/pdf", buffer: await makePdf(1) },
  ]);

  await expect(page.getByTestId("pm-status")).toContainText("合計3ページ");
  await expect(page.locator("[data-testid='pm-item']")).toHaveCount(2);

  const download = page.waitForEvent("download");
  await page.getByTestId("pm-merge").click();
  expect((await download).suggestedFilename()).toBe("merged.pdf");
  await expect(page.getByTestId("pm-status")).toHaveAttribute("data-state", "ok");
});

test("pdf-merge: PDF未選択でエラーを出す", async ({ page }) => {
  await page.goto("/t/pdf-merge/");
  await page.getByTestId("pm-merge").click();
  await expect(page.getByTestId("pm-status")).toHaveAttribute("data-state", "error");
});
