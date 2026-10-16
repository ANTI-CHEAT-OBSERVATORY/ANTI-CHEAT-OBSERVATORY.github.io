import { withBase } from "./paths";

export interface FeedEntry {
  title: string;
  path: string;
  date: string;
  summary: string;
  category: string;
}

const escape = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Configure SITE_URL for absolute subscription links on the published static site. */
export function feedXml(
  origin: string | undefined,
  meta: { title: string; description: string; path: string },
  entries: FeedEntry[],
): string {
  const self = origin ? new URL(withBase(meta.path), origin).href : undefined;
  const items = entries
    .filter((entry) => !Number.isNaN(Date.parse(entry.date)))
    .map((entry) => {
      const link = origin ? new URL(withBase(entry.path), origin).href : withBase(entry.path);
      return [
        "    <item>",
        `      <title>${escape(entry.title)}</title>`,
        `      <link>${escape(link)}</link>`,
        `      <guid isPermaLink="false">${escape(`${entry.path}@${entry.date}`)}</guid>`,
        `      <category>${escape(entry.category)}</category>`,
        `      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>`,
        `      <description>${escape(entry.summary)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escape(meta.title)}</title>`,
    `    <description>${escape(meta.description)}</description>`,
    `    <link>${escape(origin ? new URL(withBase("/"), origin).href : withBase("/"))}</link>`,
    self ? `    <atom:link href="${escape(self)}" rel="self" type="application/rss+xml" />` : "",
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
