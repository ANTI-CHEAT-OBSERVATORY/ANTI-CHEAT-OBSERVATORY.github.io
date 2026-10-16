import type { APIRoute } from "astro";
import { corrections } from "../lib/knowledge";
import { posts } from "../lib/research";
import { discovery, discoverySources, discoveryChanges } from "../lib/discovery";
import { feedXml, type FeedEntry } from "../lib/rss";

/** Substantive reference changes: corrections, editorial revisions and reviewed/pending source changes. */
export const GET: APIRoute = ({ site }) => {
  const nameOf = new Map(discoverySources.map((source) => [source.id, source.name]));
  const entries: FeedEntry[] = [
    ...corrections.map((correction) => ({
      title: `${correction.kind === "dispute" ? "Dispute" : "Correction"}: ${correction.title}`,
      path: `/updates#correction-${correction.id}`,
      date: correction.date,
      summary: `${correction.summary} Status: ${correction.status}. Before: ${correction.before} After: ${correction.after}`,
      category: `${correction.kind} (${correction.status})`,
    })),
    ...posts.map((post) => ({
      title: `Note: ${post.title}`,
      path: `/blog/${post.id}`,
      date: post.updated,
      summary: post.summary,
      category: "editorial note",
    })),
    ...discoveryChanges.map((change) => ({
      title: `Source change: ${nameOf.get(change.sourceId) ?? change.sourceId}`,
      path: `/updates#change-${change.id}`,
      date: change.date,
      summary: `${change.summary} Review: ${change.review}. Added ${change.diff.added.length}, removed ${change.diff.removed.length} tracked line(s). A pending change does not modify any claim or reviewed commit.`,
      category: `source change (${change.review})`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return new Response(
    feedXml(site?.origin, {
      title: "Anti-Cheat Observatory — updates",
      description: `Corrections, editorial revisions and external source changes. Snapshot ${discovery.syncedAt}.`,
      path: "/updates.xml",
    }, entries),
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
};
