import type { SiteConfig } from "@tf/shared";
import raw from "../../../../config/site.json";

export const site = raw as SiteConfig;

/** origin 込みの絶対URLを作る。pathname は先頭スラッシュ付き。 */
export function absoluteUrl(pathname: string): string {
  return `${site.origin.replace(/\/+$/, "")}${pathname}`;
}
