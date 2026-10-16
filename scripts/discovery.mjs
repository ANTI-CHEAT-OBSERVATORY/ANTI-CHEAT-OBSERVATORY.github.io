import { readFile, readdir, writeFile } from "node:fs/promises";
import { archiveItems, canonicalUrl, feedItems, hash, identity, isPublicationCandidate, linesDiff, pageMetadata, priorityFor, short, sitemapUrls } from "./discovery-helpers.mjs";

const root = new URL("../src/data/", import.meta.url);
const file = (name) => new URL(name, root);
const load = async (name, fallback) => readFile(file(name), "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return fallback; throw error; });
const save = async (name, data) => writeFile(file(name), `${JSON.stringify(data, null, 2)}\n`);
const force = process.argv.includes("--force");
const backfill = process.argv.includes("--backfill");
if (process.argv.slice(2).some((flag) => !["--force", "--backfill"].includes(flag))) throw new Error("Supported options: --force, --backfill");
const now = new Date().toISOString();
const emptyDigest = { generatedAt: now, from: now, to: now, addedIds: [], changeIds: [], blockedSourceIds: [] };
const config = await load("discovery-sources.json", []);
if (!config.length) throw new Error("Discovery source registry must not be empty");
const initialStatus = (source) => ({ id: source.id, name: source.name, url: source.url, state: "pending", lastAttempt: null, lastSuccess: null, httpStatus: null, error: null, itemCount: 0, backfill: { state: "pending", inspectedFrom: null, inspectedThrough: null, detail: "No historical endpoint inspected; latest feed is not historical coverage." } });
const snapshot = await load("discovery.json", { schemaVersion: "2.0.0", syncedAt: now, sources: [], items: [], repos: [], changes: [], digest: emptyDigest });
const state = await load("discovery-state.json", { pages: {} });
state.publications ??= {};
/** Older snapshots recorded a never-attempted source as an error with an empty date; keep that meaning honest on load. */
for (const entry of snapshot.sources) {
  if (entry.lastAttempt === "") entry.lastAttempt = null;
  if (entry.lastAttempt === null && entry.httpStatus === null && entry.state === "error") { entry.state = "pending"; entry.error = null; }
}
const oldItems = new Map();
for (const item of snapshot.items) {
  if (!isPublicationCandidate(item.canonicalUrl) || (item.url !== item.canonicalUrl && !isPublicationCandidate(item.url))) continue;
  if (item.mirrors.length) item.mirrors = item.mirrors.filter(isPublicationCandidate);
  oldItems.set(item.canonicalUrl, item);
}
const sourceStatuses = new Map(snapshot.sources.map((entry) => [entry.id, entry]));
const repos = new Map(snapshot.repos.map((repo) => [repo.id, repo]));
const changes = new Map(snapshot.changes.map((change) => [change.id, change]));
const records = await Promise.all((await readdir(file("records"))).filter((name) => name.endsWith(".json")).map((name) => load(`records/${name}`, null)));
const knowledgeSources = await load("knowledge/sources.json", []);
const claims = await load("knowledge/claims.json", []);
const normalized = new Map();
function indexUrl(url, source) {
  if (!url) return;
  try { const key = canonicalUrl(url); if (!normalized.has(key)) normalized.set(key, []); normalized.get(key).push(source); }
  catch { /* Inaccessible/non-HTTPS citations cannot be polled. */ }
}
for (const source of knowledgeSources) { indexUrl(source.url, source); indexUrl(source.retrievalUrl, source); }
const refs = new Map();
for (const claim of claims) for (const citation of claim.citations ?? []) {
  const ids = [citation.sourceId];
  const source = knowledgeSources.find((entry) => entry.id === citation.sourceId);
  if (source) ids.push(source.originId);
  for (const id of ids) {
    if (!refs.has(id)) refs.set(id, { claimIds: new Set(), recordIds: new Set() });
    const ref = refs.get(id); ref.claimIds.add(claim.id);
    for (const recordId of claim.recordIds ?? []) ref.recordIds.add(recordId);
  }
}
function affected(url, sourceId, recordId = null) {
  const urls = normalized.get(canonicalUrl(url)) ?? [];
  const group = new Set([sourceId, ...urls.flatMap((source) => [source.id, source.originId])]);
  const recordIds = new Set(recordId ? [recordId] : []), claimIds = new Set();
  for (const id of group) { const ref = refs.get(id); if (!ref) continue; for (const entry of ref.claimIds) claimIds.add(entry); for (const entry of ref.recordIds) recordIds.add(entry); }
  for (const record of records) {
    if (!record?.repoUrl || canonicalUrl(record.repoUrl) !== canonicalUrl(url)) continue;
    recordIds.add(record.id);
    for (const claim of claims) if (claim.recordIds.includes(record.id)) claimIds.add(claim.id);
  }
  return { recordIds: [...recordIds].sort(), claimIds: [...claimIds].sort() };
}
function origin(url) {
  const sources = normalized.get(canonicalUrl(url)) ?? [];
  const source = sources.find((entry) => entry.transport !== "mirror") ?? sources[0] ?? null;
  if (source?.transport === "mirror") return knowledgeSources.find((entry) => entry.transport !== "mirror" && entry.originId === source.originId) ?? source;
  return source;
}
const productAliases = new Map([
  ["easy-anti-cheat", ["easy anti cheat", "easyanticheat", "eac"]],
  ["vanguard", ["riot vanguard", "vanguard"]],
  ["ea-javelin", ["ea javelin", "ea anticheat"]],
  ["anti-cheat-expert", ["tencent ace", "anti cheat expert"]],
  ["ricochet", ["ricochet anti cheat"]],
]);
function mentionedProducts(entry) {
  const haystack = ` ${`${entry.title} ${entry.summary ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return records.filter((record) => record?.kind === "product" && [
    ...(productAliases.get(record.id) ?? []),
    record.title.replace(/\([^)]*\)/g, "").trim().toLowerCase(),
    ...(record.aliases ?? []).map((alias) => alias.toLowerCase()),
  ].some((alias) => alias.length >= 3 && haystack.includes(` ${alias.replace(/[^a-z0-9]+/g, " ").trim()} `))).map((record) => record.id);
}
function registerItem(entry, source, refreshMetadata = true) {
  const observed = canonicalUrl(entry.url);
  const knownSource = origin(observed);
  const canonical = knownSource ? canonicalUrl(knownSource.url) : observed;
  if (!isPublicationCandidate(observed) || (canonical !== observed && !isPublicationCandidate(canonical))) return;
  const current = oldItems.get(canonical) ?? oldItems.get(observed);
  const refs = affected(canonical, knownSource?.id ?? source.id, source.kind === "github" ? source.id : null);
  const item = current ?? { id: identity(canonical), url: observed, canonicalUrl: canonical, title: entry.title, summary: entry.summary ?? null, sourceId: source.id, originId: knownSource?.originId ?? identity(canonical), systemIds: source.systemIds, topics: source.topics, published: entry.published ?? null, firstSeen: now, lastSeen: now, review: "unreviewed", priority: "background", recordIds: [], claimIds: [], mirrors: [] };
  item.lastSeen = now;
  if (refreshMetadata && observed === canonical) {
    const before = state.publications[canonical];
    const title = entry.title || item.title;
    const summary = short(entry.summary ?? item.summary, 350) || null;
    const after = [title, summary ?? ""].filter(Boolean);
    const next = hash(after.join("\n"));
    // A new fingerprint is a baseline, not proof that an upstream publication changed.
    if (before) addChange({ sourceId: knownSource?.id ?? source.id, kind: "content", before: before.hash, after: next, summary: "Publication metadata changed against its previously collected fingerprint; inspect linked claims before relying on their previous interpretation.", sourceUrl: canonical, diff: linesDiff(before.lines, after) });
    state.publications[canonical] = { hash: next, lines: after };
    item.title = title;
    item.summary = summary;
  }
  if (!item.published && entry.published) item.published = entry.published;
  const products = mentionedProducts(item);
  item.recordIds = [...new Set([...item.recordIds, ...refs.recordIds, ...products])].sort();
  item.claimIds = [...new Set([...item.claimIds, ...refs.claimIds])].sort();
  item.systemIds = [...new Set([...item.systemIds, ...source.systemIds, ...products])].sort();
  item.topics = [...new Set([...item.topics, ...source.topics])].sort();
  if (observed !== canonical) item.mirrors = [...new Set([...item.mirrors, observed])].sort();
  item.priority = priorityFor(item, records);
  oldItems.set(canonical, item);
  if (observed !== canonical) oldItems.delete(observed);
}
function addChange({ sourceId, date = now, kind, before, after, summary, sourceUrl, compareUrl, diff, recordId }) {
  if (before === after || (!diff.added.length && !diff.removed.length)) return;
  const id = `change-${hash(`${sourceId}|${kind}|${before}|${after}${kind === "availability" ? `|${date}` : ""}`)}`;
  if (changes.has(id)) return;
  const linked = affected(sourceUrl, sourceId, recordId);
  changes.set(id, { id, sourceId, date, kind, before, after, summary, ...linked, review: "pending", sourceUrl, ...(compareUrl ? { compareUrl } : {}), diff });
}
for (const source of config) {
  if (!source.id || !["rss", "github", "page"].includes(source.kind) || !source.originId || !Array.isArray(source.systemIds) || !Array.isArray(source.topics) || !Array.isArray(source.backfillEndpoints) || !source.scope || !(source.intervalHours > 0)) throw new Error(`Invalid registry source ${source.id}`);
  for (const value of [source.url, source.endpoint, ...source.backfillEndpoints]) canonicalUrl(value);
  if (!sourceStatuses.has(source.id)) sourceStatuses.set(source.id, initialStatus(source));
}
function refreshReviewedCommits() {
  for (const source of config.filter((candidate) => candidate.kind === "github")) {
    const repo = repos.get(source.id); if (!repo) continue;
    const record = records.find((entry) => entry?.repoUrl && canonicalUrl(entry.repoUrl) === canonicalUrl(source.url));
    repo.recordId = record?.id ?? null;
    repo.reviewedCommit = record?.reviewedCommit ?? null;
    repo.drift = Boolean(repo.reviewedCommit && repo.headSha && repo.reviewedCommit !== repo.headSha);
  }
}
// Only explicitly configured public HTTPS endpoints can be requested; sitemap descendants stay on the configured host.
function allowed(url, endpoint) {
  const parsed = new URL(canonicalUrl(url)), base = new URL(endpoint);
  if (parsed.hostname !== base.hostname || /^(localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) throw new Error(`Endpoint outside configured public host: ${url}`);
}
async function request(url, endpoint, accept = "text/plain", limit = 2_000_000, method = "GET") {
  allowed(url, endpoint);
  let target = url;
  for (let redirects = 0; redirects < 3; redirects++) {
    const response = await fetch(target, { method, redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "anti-cheat-observatory/2.0 (metadata research discovery)", Accept: accept, ...(process.env.GITHUB_TOKEN && new URL(target).hostname === "api.github.com" ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { target = new URL(response.headers.get("location"), target).href; allowed(target, endpoint); continue; }
    if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.httpStatus = response.status; throw error; }
    if (method === "HEAD") return { body: "", status: response.status, headers: response.headers };
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response has no body");
    const chunks = [];
    let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        count += value.length;
        if (count > limit) { await reader.cancel(); throw new Error("Response exceeds metadata size limit"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { body: new TextDecoder().decode(bytes), status: response.status, headers: response.headers };
  }
  throw new Error("Too many redirects");
}
async function getJson(url, endpoint) { const response = await request(url, endpoint, "application/vnd.github+json"); return { value: JSON.parse(response.body), status: response.status }; }
const inspectedDate = (dates) => dates.map((date) => date?.slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
async function inspectBackfill(source, status) {
  if (!source.backfillEndpoints.length) { status.backfill = { state: "blocked", inspectedFrom: null, inspectedThrough: null, detail: "No approved historical endpoint; recent feed only, not a historical archive." }; return; }
  try {
    let count = 0, archiveCount = 0, complete = true;
    const dates = [];
    if (source.kind === "github") {
      const first = source.backfillEndpoints[0];
      for (let page = 1; page <= 3; page++) {
        const target = new URL(first); target.searchParams.set("per_page", "100"); target.searchParams.set("page", String(page));
        const { value } = await getJson(target.href, source.endpoint);
        if (!Array.isArray(value)) throw new Error("Expected GitHub commit history");
        for (const commit of value) {
          const date = commit.commit?.author?.date ?? null;
          dates.push(date);
          registerItem({ url: commit.html_url, title: short(commit.commit?.message?.split("\n")[0] ?? "Commit", 160), summary: null, published: date?.slice(0, 10) ?? null }, source);
          count++;
        }
        if (value.length < 100) break;
        if (page === 3) complete = false;
      }
    } else {
      const queue = source.backfillEndpoints.map((url) => ({ url, depth: 0 }));
      let inspected = 0;
      while (queue.length && inspected < 8 && count < 300) {
        const { url, depth } = queue.shift();
        const { body, headers } = await request(url, source.endpoint, "application/xml,text/xml,text/html"); inspected++;
        if (headers.get("content-type")?.toLowerCase().includes("text/html")) {
          const entries = archiveItems(body, source.url);
          if (!entries.length) throw new Error("Approved HTML index contained no dated article links");
          complete = false;
          for (const entry of entries) {
            allowed(entry.url, source.endpoint);
            registerItem(entry, source, false);
            dates.push(entry.published); count++; archiveCount++;
            if (count >= 300) break;
          }
          continue;
        }
        const sitemap = sitemapUrls(body, source.url);
        for (const entry of sitemap.urls) {
          allowed(entry.url, source.endpoint);
          if (sitemap.index) { if (depth < 1) queue.push({ url: entry.url, depth: depth + 1 }); else complete = false; }
          else if (new URL(entry.url).pathname !== "/" && isPublicationCandidate(entry.url)) {
            const path = new URL(entry.url).pathname.split("/").filter(Boolean).pop() ?? "";
            registerItem({ url: entry.url, title: short(decodeURIComponent(path).replace(/[-_]/g, " "), 160) || entry.url, summary: null, published: null }, source, false);
            count++;
            if (count >= 300) break;
          }
        }
      }
      if (queue.length || count >= 300) complete = false;
    }
    const range = inspectedDate(dates);
    status.backfill = { state: complete ? "complete" : "partial", inspectedFrom: range[0] ?? null, inspectedThrough: range.at(-1) ?? null, detail: source.kind === "github" ? `Inspected ${count} public commits, up to 3 pages; ${complete ? "API history ended" : "older history remains uninspected"}. Dates describe returned commits, not coverage of unpublished work.` : `Inspected ${count} URLs from approved indexes, including ${archiveCount} dated HTML article links; ${complete ? "declared sitemap exhausted" : "other archive pages or URLs remain uninspected"}. Dates, where present, are index-reported publication dates; sitemap lastmod is not publication evidence. Article bodies were not inspected.` };
  } catch (error) {
    status.backfill = { ...status.backfill, state: [401, 403, 429].includes(error.httpStatus) ? "blocked" : "partial", detail: `${status.backfill.detail} Historical inspection failed: ${short(error.message, 140)}` };
  }
}
async function poll(source) {
  if (source.kind === "rss") {
    const { body, status: code } = await request(source.endpoint, source.endpoint, "application/rss+xml,application/atom+xml,application/xml,text/xml", 8_000_000);
    const items = feedItems(body, source.url);
    if (!items.length) throw new Error("Feed returned no parseable entries");
    for (const item of items.slice(0, 100)) registerItem(item, source);
    return { status: code, count: items.length };
  }
  if (source.kind === "page") {
    const path = new URL(source.endpoint).pathname;
    const pdf = /\.pdf$/i.test(path);
    const json = /\.json$/i.test(path);
    const response = await request(source.endpoint, source.endpoint, pdf ? "application/pdf" : json ? "application/json" : "text/html", 1_000_000, pdf ? "HEAD" : "GET");
    const lines = pdf
      ? ["etag", "last-modified", "content-length"].map((key) => response.headers.get(key) ? `${key}: ${short(response.headers.get(key), 120)}` : "").filter(Boolean)
      : json
        ? (() => { const value = JSON.parse(response.body); return [short(value.cveMetadata?.cveId ?? value.title ?? "", 120), ...(value.containers?.cna?.descriptions ?? []).slice(0, 3).map((entry) => short(entry.value, 220))].filter(Boolean); })()
        : pageMetadata(response.body);
    if (!lines.length) throw new Error(pdf ? "Document provides no public version headers; binary not downloaded" : "No bounded text metadata could be inspected");
    const previous = state.pages[source.id];
    const next = hash([...lines].sort().join("\n"));
    if (previous && previous.hash !== next) addChange({ sourceId: source.id, kind: "content", before: previous.hash, after: next, summary: pdf ? "Document HTTP version headers changed; binary was not downloaded or examined." : "Publisher title, description or headings changed; inspect linked claims against the source.", sourceUrl: source.url, diff: linesDiff(previous.lines, lines) });
    state.pages[source.id] = { hash: next, lines };
    return { status: response.status, count: 0 };
  }
  const { value: repo, status: code } = await getJson(source.endpoint, source.endpoint);
  const { value: commit } = await getJson(`${source.endpoint}/commits/${encodeURIComponent(repo.default_branch ?? "HEAD")}`, source.endpoint);
  if (!commit.sha || !repo.html_url) throw new Error("Missing repository head metadata");
  const record = records.find((entry) => entry?.repoUrl && canonicalUrl(entry.repoUrl) === canonicalUrl(source.url));
  const previous = repos.get(source.id);
  const reviewedCommit = record?.reviewedCommit ?? null;
  const next = { id: source.id, name: source.name, url: source.url, recordId: record?.id ?? null, headSha: commit.sha, headDate: commit.commit?.author?.date ?? null, headMessage: short(commit.commit?.message?.split("\n")[0] ?? "", 220) || null, pushedAt: repo.pushed_at ?? null, stars: Number.isInteger(repo.stargazers_count) ? repo.stargazers_count : null, language: repo.language ?? null, license: repo.license?.spdx_id ?? null, description: short(repo.description, 300) || null, archived: Boolean(repo.archived), reviewedCommit, drift: Boolean(reviewedCommit && reviewedCommit !== commit.sha), stale: false };
  repos.set(source.id, next);
  if (previous?.headSha && previous.headSha !== next.headSha) {
    const compareUrl = `${source.url}/compare/${previous.headSha}...${next.headSha}`;
    let lines = { added: [`Head commit subject (not a patch): ${next.headMessage ?? next.headSha}`], removed: [`Previous commit subject (not a patch): ${previous.headMessage ?? previous.headSha}`] };
    try {
      const { value } = await getJson(`${source.endpoint}/compare/${previous.headSha}...${next.headSha}`, source.endpoint);
      const patches = (value.files ?? []).slice(0, 12).flatMap((entry) => (entry.patch ?? "").split("\n").filter((line) => /^[+-](?![+-])/.test(line)).slice(0, 6).map((line) => `${entry.filename}: ${short(line, 160)}`));
      if (patches.length) lines = { added: patches.filter((line) => /: \+/.test(line)).slice(0, 16), removed: patches.filter((line) => /: -/.test(line)).slice(0, 16) };
    } catch (error) { lines.added.push(`Compare unavailable: ${short(error.message, 90)}; inspect linked source`); }
    addChange({ sourceId: source.id, kind: "upstream", before: previous.headSha, after: next.headSha, summary: `Repository head changed from ${previous.headSha.slice(0, 12)} to ${next.headSha.slice(0, 12)}; unreviewed upstream change, not an updated reviewed commit.`, sourceUrl: source.url, compareUrl, diff: lines, recordId: record?.id });
  }
  let count = 0;
  for (const resource of ["releases?per_page=30", "issues?state=all&sort=updated&direction=desc&per_page=30"]) {
    const { value: entries } = await getJson(`${source.endpoint}/${resource}`, source.endpoint);
    if (!Array.isArray(entries)) throw new Error(`Expected a public repository ${resource.split("?")[0]} list`);
    for (const entry of entries.slice(0, 30)) {
      if (!entry.html_url || entry.draft || entry.pull_request) continue;
      const release = resource.startsWith("releases");
      const title = release ? `Release: ${entry.name || entry.tag_name}` : `Public issue: ${entry.title}`;
      if (!release && !entry.title) continue;
      registerItem({ url: entry.html_url, title: short(title, 160), summary: short(entry.body, 350) || null, published: (entry.published_at ?? entry.created_at)?.slice(0, 10) ?? null }, source);
      count++;
    }
  }
  return { status: code, count };
}
for (const source of config) {
  const status = sourceStatuses.get(source.id);
  const due = force || !status.lastAttempt || !Number.isFinite(+new Date(status.lastAttempt)) || Date.now() - +new Date(status.lastAttempt) >= source.intervalHours * 3_600_000;
  const previousState = status.state;
  const previouslyAttempted = Boolean(status.lastAttempt);
  if (due) {
    try {
      const result = await poll(source);
      Object.assign(status, { name: source.name, url: source.url, state: "ok", httpStatus: result.status, lastAttempt: now, lastSuccess: now, error: null, itemCount: result.count });
    } catch (error) {
      const code = error.httpStatus ?? null;
      Object.assign(status, { name: source.name, url: source.url, state: [401, 403, 429].includes(code) ? "blocked" : "error", httpStatus: code, lastAttempt: now, error: short(error.message, 200) });
      if (repos.has(source.id)) repos.set(source.id, { ...repos.get(source.id), stale: true });
      console.warn(`${source.id}: ${status.state} (${status.error}); retaining earlier discoveries`);
    }
    if (previouslyAttempted && previousState !== status.state) {
      addChange({ sourceId: source.id, kind: "availability", before: previousState, after: status.state, summary: `Source access changed from ${previousState} to ${status.state}; previously retained material remains subject to re-review.`, sourceUrl: source.url, diff: { added: [status.state === "ok" ? `Reachable as of ${now}` : `${status.state}: ${status.error}`], removed: [previousState] } });
    }
  }
  if (backfill) await inspectBackfill(source, status);
}
refreshReviewedCommits();
snapshot.syncedAt = now;
snapshot.sources = [...sourceStatuses.values()];
snapshot.items = [...new Set(oldItems.values())].sort((a, b) => (b.published ?? b.firstSeen).localeCompare(a.published ?? a.firstSeen) || a.id.localeCompare(b.id));
const retainedIds = new Set(snapshot.items.map((item) => item.id));
snapshot.digest.addedIds = snapshot.digest.addedIds.filter((id) => retainedIds.has(id));
snapshot.repos = [...repos.values()];
snapshot.changes = [...changes.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
await save("discovery-state.json", state);
await save("discovery.json", snapshot);
console.log(`Discovery: ${snapshot.items.length} retained items, ${snapshot.changes.length} changes, ${snapshot.sources.filter((entry) => entry.state !== "ok").length} unavailable sources.`);
