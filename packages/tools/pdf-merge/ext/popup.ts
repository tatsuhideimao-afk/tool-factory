/**
 * 拡張版のポップアップ。Web版と同じ ../core.ts を import する（ロジックの二重実装を禁止）。
 */
import { countPages, mergePdfs, type PdfSource } from "../core.ts";

const filesInput = document.querySelector<HTMLInputElement>("#files")!;
const list = document.querySelector<HTMLOListElement>("#list")!;
const nameInput = document.querySelector<HTMLInputElement>("#name")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

type Entry = { name: string; bytes: Uint8Array; pages: number };
let entries: Entry[] = [];

function setStatus(text: string, isError: boolean): void {
  status.textContent = text;
  status.dataset.state = isError ? "error" : "ok";
}

function render(): void {
  list.replaceChildren();
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name}（${entry.pages}ページ）`;
    list.append(li);
  });
}

filesInput.addEventListener("change", async () => {
  const picked = Array.from(filesInput.files ?? []);
  if (picked.length === 0) return;
  try {
    for (const file of picked) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      entries.push({ name: file.name, bytes, pages: await countPages(bytes) });
    }
    render();
    setStatus(`${entries.length}ファイルを読み込みました`, false);
  } catch (err) {
    setStatus(`読み込み失敗: ${err instanceof Error ? err.message : String(err)}`, true);
  } finally {
    filesInput.value = "";
  }
});

document.querySelector("#merge")!.addEventListener("click", async () => {
  if (entries.length === 0) {
    setStatus("PDFを選んでください", true);
    return;
  }
  const sources: PdfSource[] = entries.map((e) => ({ name: e.name, bytes: e.bytes }));
  try {
    const filename = nameInput.value.trim() || "merged.pdf";
    const merged = await mergePdfs(sources, { title: filename });
    const url = URL.createObjectURL(
      new Blob([merged as BlobPart], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("結合しました", false);
  } catch (err) {
    setStatus(`エラー: ${err instanceof Error ? err.message : String(err)}`, true);
  }
});

document.querySelector("#clear")!.addEventListener("click", () => {
  entries = [];
  render();
  setStatus("", false);
});
