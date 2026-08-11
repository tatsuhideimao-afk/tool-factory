import type { APIRoute } from "astro";
import { site } from "../lib/site.ts";

export const GET: APIRoute = () => {
  const origin = site.origin.replace(/\/+$/, "");
  const body = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
