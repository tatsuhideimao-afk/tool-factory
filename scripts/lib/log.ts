/** パイプラインの共通ログ。GitHub Actions のログで grep しやすい形にする。 */

const stamp = (): string => new Date().toISOString().replace("T", " ").slice(0, 19);

export function info(step: string, message: string): void {
  console.log(`[${stamp()}] [${step}] ${message}`);
}

export function warn(step: string, message: string): void {
  console.warn(`[${stamp()}] [${step}] WARN ${message}`);
}

export function error(step: string, message: string): void {
  console.error(`[${stamp()}] [${step}] ERROR ${message}`);
}

/** 必須の環境変数を読む。無ければ理由付きで落とす。 */
export function requireEnv(name: string, why: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`環境変数 ${name} が未設定です（${why}）。.env.example を参照。`);
  }
  return value;
}

/** 任意の環境変数。未設定なら null。 */
export function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : null;
}
