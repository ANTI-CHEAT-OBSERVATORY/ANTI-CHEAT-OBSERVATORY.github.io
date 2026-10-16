import snapshot from "../data/discovery.json";

export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  state: "ok" | "blocked" | "error" | "pending";
  lastAttempt: string | null;
  lastSuccess: string | null;
  httpStatus: number | null;
  error: string | null;
  itemCount: number;
  backfill: {
    state: "pending" | "partial" | "complete" | "blocked";
    inspectedFrom: string | null;
    inspectedThrough: string | null;
    detail: string;
  };
}
export interface DiscoveryItem {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  sourceId: string;
  originId: string;
  systemIds: string[];
  topics: string[];
  published: string | null;
  firstSeen: string;
  lastSeen: string;
  review: "unreviewed" | "linked" | "dismissed";
  priority: "correction" | "fix" | "drift" | "research" | "background";
  recordIds: string[];
  claimIds: string[];
  mirrors: string[];
}
export interface TrackedRepo {
  id: string;
  name: string;
  url: string;
  recordId: string | null;
  headSha: string | null;
  headDate: string | null;
  headMessage: string | null;
  pushedAt: string | null;
  stars: number | null;
  language: string | null;
  license: string | null;
  description: string | null;
  archived: boolean;
  reviewedCommit: string | null;
  drift: boolean;
  stale: boolean;
}
export interface SourceChange {
  id: string;
  sourceId: string;
  date: string;
  kind: "content" | "upstream" | "availability";
  before: string;
  after: string;
  summary: string;
  recordIds: string[];
  claimIds: string[];
  review: "pending" | "reviewed";
  sourceUrl: string;
  compareUrl?: string;
  diff: { added: string[]; removed: string[] };
}
export interface Digest {
  generatedAt: string;
  from: string;
  to: string;
  addedIds: string[];
  changeIds: string[];
  blockedSourceIds: string[];
}
export interface DiscoverySnapshot {
  schemaVersion: "2.0.0";
  syncedAt: string;
  sources: SourceStatus[];
  items: DiscoveryItem[];
  repos: TrackedRepo[];
  changes: SourceChange[];
  digest: Digest;
}

export const discovery = snapshot as DiscoverySnapshot;
export const discoveryItems = discovery.items;
export const discoveryChanges = discovery.changes;
export const discoverySources = discovery.sources;
export const trackedRepos = discovery.repos;
export const pendingChanges = discoveryChanges.filter((change) => change.review === "pending");
export const recentDigest = discovery.digest;
