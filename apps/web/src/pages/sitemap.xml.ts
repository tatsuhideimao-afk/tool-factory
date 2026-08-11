import type { APIRoute } from "astro";
import { site } from "../lib/site.ts";
import { tools } from "../generated/tools.ts";

/**
 * sitemap.xml をビルドのたびに再生成する（仕様 5.5）。
 * retired にしたツールは registry の published が false になるので自動で外れる。
 */
export const GET: APIRoute = () => {
  const origin = site.origin.replace(/\/+$/, "");
  const entries: { loc: string; lastmod: string; priority: string }[] = [
    { loc: `${origin}/`, lastmod: today(), priority: "1.0" },
    ...tools
      .filter((t) => t.published)
      .map((t) => ({
        loc: `${origin}/t/${t.meta.slug}/`,
        lastmod: t.lastmod.slice(0, 10),
        priority: "0.8",
      })),
    { loc: `${origin}/privacy/`, lastmod: today(), priority: "0.1" },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <priority>${e.priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
