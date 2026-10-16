import type { APIRoute } from "astro";
import { discovery, discoveryItems, discoveryChanges, discoverySources } from "../lib/discovery";
import { feedXml, type FeedEntry } from "../lib/rss";

/** The scheduled weekly digest: what discovery added, what changed, and what stayed blocked. */
export const GET: APIRoute = ({ site }) => {
  const digest = discovery.digest;
  const itemById = new Map(discoveryItems.map((item) => [item.id, item]));
  const changeById = new Map(discoveryChanges.map((change) => [change.id, change]));
  const sourceById = new Map(discoverySources.map((source) => [source.id, source]));
  const blocked = digest.blockedSourceIds.map((id) => sourceById.get(id)?.name ?? id);
  const entries: FeedEntry[] = [
    {
      title: `Weekly digest ${digest.from.slice(0, 10)} → ${digest.to.slice(0, 10)}`,
      path: "/updates#digest",
      date: digest.generatedAt,
      summary: `${digest.addedIds.length} newly discovered item(s), ${digest.changeIds.length} source change(s), ${digest.blockedSourceIds.length} blocked source(s)${blocked.length ? `: ${blocked.join(", ")}` : ""}. Discovery metadata is never promoted to a reviewed claim automatically.`,
      category: "digest",
    },
    ...digest.addedIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [{
        title: `Discovered: ${item.title}`,
        path: `/feed#item-${item.id}`,
        date: item.firstSeen,
        summary: `${item.summary ?? "No summary available."} Priority: ${item.priority}. Review state: ${item.review}. Source: ${sourceById.get(item.sourceId)?.name ?? item.sourceId}.`,
        category: `discovery (${item.priority})`,
      }] : [];
    }),
    ...digest.changeIds.flatMap((id) => {
      const change = changeById.get(id);
      return change ? [{
        title: `Changed: ${sourceById.get(change.sourceId)?.name ?? change.sourceId}`,
        path: `/updates#change-${change.id}`,
        date: change.date,
        summary: `${change.summary} Review: ${change.review}.`,
        category: "source change",
      }] : [];
    }),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return new Response(
    feedXml(site?.origin, {
      title: "Anti-Cheat Observatory — weekly digest",
      description: "Weekly discovery digest. Items are unreviewed metadata until a claim is revised with cited evidence.",
      path: "/digest.xml",
    }, entries),
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
};
