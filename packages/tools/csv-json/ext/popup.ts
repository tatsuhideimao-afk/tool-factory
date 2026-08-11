/**
 * 拡張版のポップアップ。Web版と同じ ../core.ts を import する（ロジックの二重実装を禁止）。
 */
import { csvToJson, jsonTextToCsv } from "../core.ts";

const input = document.querySelector<HTMLTextAreaElement>("#input")!;
const output = document.querySelector<HTMLTextAreaElement>("#output")!;
const direction = document.querySelector<HTMLSelectElement>("#direction")!;
const delimiter = document.querySelector<HTMLSelectElement>("#delimiter")!;
const header = document.querySelector<HTMLInputElement>("#header")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

function setStatus(text: string, isError: boolean): void {
  status.textContent = text;
  status.dataset.state = isError ? "error" : "ok";
}

document.querySelector("#convert")!.addEventListener("click", () => {
  try {
    if (direction.value === "csv2json") {
      const records = csvToJson(input.value, {
        delimiter: delimiter.value,
        hasHeader: header.checked,
        inferTypes: true,
      });
      output.value = JSON.stringify(records, null, 2);
      setStatus(`${records.length}件に変換しました`, false);
    } else {
      output.value = jsonTextToCsv(input.value, {
        delimiter: delimiter.value,
        header: header.checked,
        newline: "\n",
      });
      setStatus("CSVに変換しました", false);
    }
  } catch (err) {
    output.value = "";
    setStatus(`エラー: ${err instanceof Error ? err.message : String(err)}`, true);
  }
});

document.querySelector("#copy")!.addEventListener("click", async () => {
  if (output.value === "") return;
  await navigator.clipboard.writeText(output.value);
  setStatus("コピーしました", false);
});
