import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { parse } from "parse5";

export const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const tracking = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id|igshid|ref_src|spm)$/i;
export function canonicalUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`Only HTTPS URLs are permitted: ${value}`);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of [...parsed.searchParams.keys()]) if (tracking.test(key)) parsed.searchParams.delete(key);
  parsed.searchParams.sort();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.href;
}
/** Exclude known profile/taxonomy URLs; an eligible URL is still only an unreviewed lead. */
export function isPublicationCandidate(value) {
  try {
    const url = new URL(value), path = url.pathname.replace(/\/+$/, "");
    if (url.protocol !== "https:") return false;
    if (/(?:^|\.)github\.com$/.test(url.hostname)) return path.split("/").filter(Boolean).length >= 2;
    if (/(?:^|\.)(?:x|twitter|vxtwitter|fxtwitter)\.com$/.test(url.hostname) || /^nitter\./.test(url.hostname)) return /\/status\/\d+(?:\/|$)/.test(path);
    if (/^\/(?:(?:blog|forum)\/)?(?:authors?|researchers?|profiles?|members?|users?|tags?|categor(?:y|ies)|about|contact)(?:\.(?:php|html?))?(?:\/|$)/i.test(path)) return false;
    return !/^\/(?:blog|archive|archives|posts|page)(?:\/(?:page\/)?\d+)?$/i.test(path);
  } catch { return false; }
}
export const identity = (url) => `item-${hash(canonicalUrl(url))}`;
export const short = (value, length = 280) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, length);
export function text(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return short(String(value).replace(/<[^>]*>/g, " "), 500);
  if (Array.isArray(value)) return text(value[0]);
  return text(value["#text"] ?? value.__cdata ?? value.content ?? "");
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", cdataPropName: "__cdata", processEntities: true, removeNSPrefix: true, parseTagValue: false });
export function xml(body) { return parser.parse(body); }
export function feedItems(body, base) {
  const doc = xml(body);
  const entries = doc.rss?.channel?.item ?? doc.feed?.entry ?? doc.RDF?.item ?? [];
  if (!doc.rss && !doc.feed && !doc.RDF) throw new Error("Response is not RSS or Atom");
  return (Array.isArray(entries) ? entries : [entries]).map((entry) => {
    const links = Array.isArray(entry.link) ? entry.link : [entry.link];
    const link = links.find((candidate) => candidate?.["@_rel"] === "alternate") ?? links.find((candidate) => !candidate?.["@_rel"]);
    const guid = entry.guid?.["@_isPermaLink"] !== "false" && /^https:\/\//i.test(text(entry.guid)) ? text(entry.guid) : "";
    const url = (typeof link === "string" ? link : link?.["@_href"] || text(link)) || guid;
    const date = entry.pubDate ?? entry.published ?? entry.updated ?? entry.date;
    const parsedDate = date ? new Date(text(date)) : null;
    try {
      if (!url) return null;
      const resolved = canonicalUrl(new URL(url, base).href);
      return { url: resolved, title: text(entry.title), summary: short(text(entry.summary ?? entry.description ?? entry.encoded ?? entry.content), 350) || null, published: parsedDate && !Number.isNaN(+parsedDate) ? parsedDate.toISOString().slice(0, 10) : null };
    } catch { return null; }
  }).filter((item) => item?.title);
}
export function sitemapUrls(body, base) {
  const doc = xml(body);
  const root = doc.urlset?.url ?? doc.sitemapindex?.sitemap ?? [];
  if (!doc.urlset && !doc.sitemapindex) throw new Error("Response is not a sitemap");
  const values = Array.isArray(root) ? root : [root];
  return { index: Boolean(doc.sitemapindex), urls: values.map((item) => {
    try { const location = text(item.loc); return location ? { url: canonicalUrl(new URL(location, base).href), modified: text(item.lastmod) || null } : null; }
    catch { return null; }
  }).filter(Boolean) };
}
/** Approved dated article indexes only; never collect author profiles or follow article links. */
export function archiveItems(body, base) {
  const host = new URL(base).hostname;
  const items = new Map();
  const visit = (node, fn) => { fn(node); for (const child of node.childNodes ?? []) visit(child, fn); };
  const content = (node) => node.nodeName === "#text" ? node.value : ["script", "style"].includes(node.tagName) ? "" : (node.childNodes ?? []).map(content).join("");
  visit(parse(body), (node) => {
    if (node.tagName !== "article") return;
    let item = null, date = null;
    visit(node, (child) => {
      if (child.tagName === "time" && !date) date = child.attrs.find((attr) => attr.name === "datetime")?.value ?? null;
      if (child.tagName !== "a" || item) return;
      const href = child.attrs.find((attr) => attr.name === "href")?.value;
      if (!href) return;
      try {
        const url = canonicalUrl(new URL(href, base).href);
        const target = new URL(url), title = short(content(child), 160);
        if (target.hostname === host && /^\/(?:19|20)\d{2}\/\d{2}\/\d{2}\/[^/]+/.test(target.pathname) && title) item = { url, title, summary: null, published: null };
      } catch { /* Non-public or malformed locations are not discovery entries. */ }
    });
    if (item) {
      const published = date ? new Date(date) : null;
      item.published = published && !Number.isNaN(+published) ? published.toISOString().slice(0, 10) : null;
      items.set(item.url, item);
    }
  });
  return [...items.values()];
}
export function pageMetadata(body) {
  const scrub = (value) => short(value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|nbsp|quot|#39|lt|gt);/g, " "), 220);
  const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].slice(0, 14).map((match) => scrub(match[1])).filter(Boolean);
  const title = scrub(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = body.match(/<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i)?.[1] ?? body.match(/<meta\b(?=[^>]*\bproperty=["']og:description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i)?.[1] ?? "";
  return [...new Set([title, scrub(description), ...headings].filter(Boolean))].slice(0, 16);
}
export function linesDiff(before, after) {
  const old = new Set(before);
  const next = new Set(after);
  return { added: after.filter((line) => !old.has(line)).slice(0, 16), removed: before.filter((line) => !next.has(line)).slice(0, 16) };
}
export function priorityFor(item, records) {
  const title = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  if (/\b(corrections?|corrected|errata|retract(?:ed|ions?)?|disput(?:e|ed|es|ing)|incorrect|inaccurate)\b/.test(title)) return "correction";
  if (/\b(fix(?:ed|es)?|patch(?:ed|es)?|vulnerabilit(?:y|ies)|cve-\d{4}-\d+|advisor(?:y|ies))\b/.test(title)) return "fix";
  if (/\b(update|revision|release|changed|drift)\b/.test(title) && item.recordIds.length) return "drift";
  if (item.recordIds.length || item.claimIds.length || item.systemIds.length || /anti.?cheat|devirtualiz|kernel|driver|hypervisor|reverse.engineer|virtualiz|protect|obfuscat/i.test(title)) return "research";
  const productNames = records.filter((record) => record.kind === "product").map((record) => record.title.toLowerCase());
  if (productNames.some((name) => name.length > 5 && title.includes(name))) return "research";
  return "background";
}
