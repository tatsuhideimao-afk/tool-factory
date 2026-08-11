/**
 * 拡張版のポップアップ。Web版と同じ ../core.ts を import する（ロジックの二重実装を禁止）。
 */
import { formatJson, minifyJson, type FormatResult, type IndentStyle } from "../core.ts";

const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const output = document.querySelector<HTMLTextAreaElement>("#output")!;
const indent = document.querySelector<HTMLSelectElement>("#indent")!;
const sort = document.querySelector<HTMLInputElement>("#sort")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

function setStatus(text: string, isError: boolean): void {
  status.textContent = text;
  status.dataset.state = isError ? "error" : "ok";
}

function readIndent(): IndentStyle {
  return indent.value === "tab" ? "tab" : (Number(indent.value) as 2 | 4);
}

function apply(result: FormatResult): void {
  if (result.ok) {
    output.value = result.text;
    setStatus(`OK: ${result.text.length}文字`, false);
    return;
  }
  output.value = "";
  const where =
    result.error.line === null ? "" : `（${result.error.line}行目付近）`;
  setStatus(`エラー: ${result.error.message}${where}`, true);
}

document.querySelector("#format")!.addEventListener("click", () => {
  apply(formatJson(input.value, { indent: readIndent(), sortKeys: sort.checked }));
});

document.querySelector("#minify")!.addEventListener("click", () => {
  apply(minifyJson(input.value));
});

document.querySelector("#copy")!.addEventListener("click", async () => {
  if (output.value === "") return;
  await navigator.clipboard.writeText(output.value);
  setStatus("コピーしました", false);
});
