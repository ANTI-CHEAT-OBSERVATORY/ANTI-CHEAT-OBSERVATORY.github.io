import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, symlink, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archiveItems, canonicalUrl, identity, isPublicationCandidate, feedItems, sitemapUrls, priorityFor } from "../scripts/discovery-helpers.mjs";

const exec = promisify(execFile);
const project = fileURLToPath(new URL("../", import.meta.url));

test("canonical identity removes tracking without merging meaningful query variants", () => {
  assert.equal(canonicalUrl("https://RESEARCH.test/paper/?utm_source=rss&source=original&v=2#section"), "https://research.test/paper?source=original&v=2");
  assert.equal(identity("https://research.test/paper/?fbclid=tracking#section"), identity("https://research.test/paper"));
  assert.notEqual(identity("https://research.test/paper?v=1"), identity("https://research.test/paper?v=2"));
  assert.throws(() => canonicalUrl("http://research.test/paper"), /HTTPS/);
});

test("RSS, Atom and RDF preserve article links and reject missing or opaque locations", () => {
  const rss = feedItems(`<rss><channel>
    <item><title>GUID permalink</title><guid>https://research.test/a</guid><content:encoded xmlns:content="urn:content"><![CDATA[<p>Bounded description</p>]]></content:encoded></item>
    <item><title>No URL</title></item>
    <item><title>Opaque GUID</title><guid isPermaLink="false">opaque-id</guid></item>
    <item><title>Relative article</title><link>/b</link></item>
  </channel></rss>`, "https://research.test/feed.xml");
  assert.deepEqual(rss.map((item) => item.url), ["https://research.test/a", "https://research.test/b"]);
  assert.equal(rss[0].summary, "Bounded description");
  const atom = feedItems(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Article</title><link rel="self" href="/entry.xml"/><link rel="alternate" href="/article"/></entry><entry><title>Self only</title><link rel="self" href="/other.xml"/></entry></feed>`, "https://research.test/");
  assert.deepEqual(atom.map((item) => item.url), ["https://research.test/article"]);
  const rdf = feedItems(`<rdf:RDF xmlns:rdf="urn:rdf"><item><title>RDF article</title><link>https://research.test/rdf</link></item></rdf:RDF>`, "https://research.test/");
  assert.equal(rdf[0].url, "https://research.test/rdf");
  assert.deepEqual(sitemapUrls("<urlset><url><loc>https://research.test/a</loc></url><url/></urlset>", "https://research.test/").urls.map((item) => item.url), ["https://research.test/a"]);
});

test("dated HTML archives preserve index metadata without importing profiles or external links", () => {
  const html = `<main><article><time datetime="2020-07-06T12:00:00Z">July 6</time><a href="/author/researcher">Author</a><a href="/2020/07/06/paper.html?utm_source=index">Kernel &amp; <em>client</em> analysis</a></article>
    <article><a href="https://external.test/2020/07/06/paper.html">External copy</a></article>
    <article><a href="javascript:alert(1)">Invalid</a></article>
    <script>const example = '<article><a href="/2020/07/06/fake.html">Not an index entry</a></article>';</script></main>`;
  assert.deepEqual(archiveItems(html, "https://research.test/"), [{ url: "https://research.test/2020/07/06/paper.html", title: "Kernel & client analysis", summary: null, published: "2020-07-06" }]);
});

test("discovery excludes researcher profiles and taxonomy indexes while retaining research and specific public posts", () => {
  for (const url of ["https://publisher.test/authors/researcher", "https://publisher.test/tags/kernel", "https://publisher.test/blog", "https://forum.test/forum/member.php?u=123", "https://github.com/researcher", "https://x.com/researcher"]) assert.equal(isPublicationCandidate(url), false, url);
  for (const url of ["https://publisher.test/2020/07/06/research.html", "https://github.com/researcher/analysis", "https://x.com/researcher/status/1234567890", "https://publisher.test/blog/technical-analysis"]) assert.equal(isPublicationCandidate(url), true, url);
});

test("triage prioritizes disputed results and vulnerability fixes over routine releases", () => {
  const item = { title: "", summary: null, recordIds: ["system-a"], claimIds: [], systemIds: [] };
  assert.equal(priorityFor({ ...item, title: "Disputed recovered output" }, []), "correction");
  assert.equal(priorityFor({ ...item, title: "Vulnerability advisory" }, []), "fix");
  assert.equal(priorityFor({ ...item, title: "Release update" }, []), "drift");
  assert.equal(priorityFor({ ...item, title: "Unrelated event", recordIds: [] }, []), "background");
});

// Fetch is intercepted only inside isolated child processes. The real collector,
// persisted JSON, canonicalization, diffs and repository scope all run unchanged.
const transport = `
const stage = Number(process.env.DISCOVERY_FIXTURE_STAGE);
const a = 'a'.repeat(40), b = 'b'.repeat(40);
const item = (title, url) => '<item><title>' + title + '</title><link>' + url + '</link><description>' + 'Legacy abstract '.repeat(30) + '</description></item>';
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (url.hostname === 'research.test') {
    if (url.pathname === '/feed.xml') {
      if (stage === 3) return new Response('Forbidden', {status:403});
      const entries = stage === 1 ? item('FixtureGuard report', 'https://research.test/article') + item('Mirror title', 'https://mirror.test/article') : stage === 2 ? item('FixtureGuard second report', 'https://research.test/second') : item('FixtureGuard report retracted', 'https://research.test/article');
      const padding = stage === 1 ? '<!--' + 'x'.repeat(4_000_000) + '-->' : stage === 5 ? '<!--' + 'x'.repeat(8_000_001) + '-->' : '';
      return new Response('<rss>' + padding + '<channel>' + entries + '</channel></rss>');
    }
    if (url.pathname === '/sitemap.xml') return new Response('<urlset><url><loc>https://research.test/article</loc></url><url><loc>https://research.test/historical-paper</loc></url></urlset>');
    if (url.pathname === '/archive') return new Response('<article><time datetime="2018-06-01T00:00:00Z">June 1</time><a href="/2018/06/01/archive-paper.html">FixtureGuard historical analysis</a><a href="/author/person">Profile</a></article>', {headers:{'content-type':'text/html'}});
    if (url.pathname === '/article') return new Response('<title>FixtureGuard analysis</title><h1>' + (stage === 1 ? 'Original conclusion' : 'Revised conclusion') + '</h1>');
  }
  if (url.hostname === 'api.github.com') {
    const root = '/repos/acme/research';
    if (url.pathname === root) return Response.json({html_url:'https://github.com/acme/research', default_branch:'main', archived:false});
    if (url.pathname === root + '/commits/main') return Response.json({sha:stage === 1 ? a : b, commit:{author:{date:'2026-01-02T00:00:00Z'},message:'Bounded revision'}});
    if (url.pathname.startsWith(root + '/compare/')) return Response.json({files:[{filename:'README.md',patch:'@@ -1 +1 @@\\n-old conclusion\\n+corrected conclusion'}]});
    if (url.pathname === root + '/releases') return Response.json(stage === 1 ? [{html_url:'https://github.com/acme/research/releases/tag/v1',name:'FixtureGuard report',published_at:'2026-01-01T00:00:00Z'}] : []);
    if (url.pathname === root + '/issues') return Response.json(stage === 1 ? [{html_url:'https://github.com/acme/research/issues/1',title:'FixtureGuard disputed result',created_at:'2026-01-01T00:00:00Z'},{html_url:'https://github.com/acme/research/pull/2',title:'Not an issue',pull_request:{}}] : []);
    if (url.pathname === root + '/commits') return Response.json([{html_url:'https://github.com/acme/research/commit/' + a,commit:{author:{date:'2026-01-01T00:00:00Z'},message:'Reviewed revision'}},{html_url:'https://github.com/acme/research/commit/' + 'c'.repeat(40),commit:{author:{date:'2019-01-01T00:00:00Z'},message:'Historical revision'}}]);
  }
  throw new Error('Unexpected fixture request: ' + url.href);
};
`;

test("collection retains rotated and blocked research, deduplicates mirrors and flags scoped revisions without promoting claims", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aco-discovery-"));
  const data = path.join(root, "src", "data");
  const json = async (name, value) => writeFile(path.join(data, name), JSON.stringify(value));
  const snapshot = async () => JSON.parse(await readFile(path.join(data, "discovery.json"), "utf8"));
  try {
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await mkdir(path.join(data, "records"), { recursive: true });
    await mkdir(path.join(data, "knowledge"), { recursive: true });
    await symlink(path.join(project, "node_modules"), path.join(root, "node_modules"), "junction");
    for (const name of ["discovery.mjs", "discovery-helpers.mjs"]) await copyFile(path.join(project, "scripts", name), path.join(root, "scripts", name));
    await writeFile(path.join(root, "transport.mjs"), transport);
    const policy = { originId: "https://research.test/", systemIds: [], topics: [], intervalHours: 24, backfillEndpoints: [], scope: "Isolated test fixture" };
    await json("discovery-sources.json", [
      { ...policy, id: "publisher", name: "Publisher", url: "https://research.test/", kind: "rss", endpoint: "https://research.test/feed.xml", backfillEndpoints: ["https://research.test/sitemap.xml", "https://research.test/archive"] },
      { ...policy, id: "source-a", name: "Source", url: "https://research.test/article", kind: "page", endpoint: "https://research.test/article" },
      { ...policy, id: "repository", name: "Repository", url: "https://github.com/acme/research", kind: "github", endpoint: "https://api.github.com/repos/acme/research", systemIds: ["fixture-guard"], backfillEndpoints: ["https://api.github.com/repos/acme/research/commits"] },
    ]);
    await json("records/fixture-guard.json", { id: "fixture-guard", kind: "product", title: "FixtureGuard", aliases: [] });
    await json("records/project-fixture.json", { id: "project-fixture", kind: "project", title: "Project", repoUrl: "https://github.com/acme/research", reviewedCommit: "a".repeat(40) });
    await json("knowledge/sources.json", [
      { id: "source-a", url: "https://research.test/article", transport: "direct", originId: "https://research.test/article" },
      { id: "source-mirror", url: "https://mirror.test/article", transport: "mirror", originId: "https://research.test/article" },
      { id: "source-project", url: "https://github.com/acme/research/blob/pinned/README.md", transport: "direct", originId: "https://github.com/acme/research" },
    ]);
    const claims = [
      { id: "claim-page", recordIds: ["fixture-guard"], citations: [{ sourceId: "source-a" }], state: "asserted" },
      { id: "claim-project", recordIds: ["project-fixture"], citations: [{ sourceId: "source-project" }], state: "disputed" },
    ];
    await json("knowledge/claims.json", claims);
    await json("discovery.json", { schemaVersion: "2.0.0", syncedAt: "2026-01-01T00:00:00Z", sources: [], repos: [], changes: [], digest: { generatedAt: "2026-01-01T00:00:00Z", from: "2026-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z", addedIds: [], changeIds: [], blockedSourceIds: [] }, items: [{ id: identity("https://research.test/article"), url: "https://research.test/article", canonicalUrl: "https://research.test/article", title: "FixtureGuard report", summary: "Legacy abstract ".repeat(30), sourceId: "publisher", originId: "https://research.test/article", systemIds: [], topics: [], published: null, firstSeen: "2026-01-01T00:00:00Z", lastSeen: "2026-01-01T00:00:00Z", review: "unreviewed", priority: "research", recordIds: [], claimIds: [], mirrors: [] }] });
    const collect = async (stage, flags = ["--force"]) => exec(process.execPath, ["--import", pathToFileURL(path.join(root, "transport.mjs")).href, path.join(root, "scripts", "discovery.mjs"), ...flags], { cwd: root, env: { ...process.env, GITHUB_TOKEN: "", DISCOVERY_FIXTURE_STAGE: String(stage) } });
    await collect(1);
    let current = await snapshot();
    assert.equal(current.sources.find((source) => source.id === "publisher").state, "ok", "A bounded four-megabyte publisher feed must remain collectable");
    assert.ok(!current.changes.some((change) => change.kind === "content"), "Establishing a feed fingerprint must not mislabel legacy excerpt normalization as an upstream edit");
    const original = current.items.find((item) => item.canonicalUrl === "https://research.test/article");
    assert.equal(original.title, "FixtureGuard report");
    assert.deepEqual(original.mirrors, ["https://mirror.test/article"]);
    assert.ok(original.systemIds.includes("fixture-guard"));
    assert.equal(current.items.filter((item) => item.originId === "https://research.test/article").length, 1);
    assert.ok(current.items.some((item) => item.url.endsWith("/issues/1") && item.priority === "correction"));
    assert.ok(current.items.some((item) => item.url.endsWith("/releases/tag/v1")));
    assert.ok(!current.items.some((item) => item.url.includes("/pull/")));
    original.review = "linked";
    await json("discovery.json", current);
    await collect(2);
    current = await snapshot();
    assert.equal(current.items.find((item) => item.id === original.id).review, "linked");
    assert.ok(current.items.some((item) => item.url === "https://research.test/second"));
    const drift = current.changes.find((change) => change.kind === "upstream");
    assert.ok(drift.claimIds.includes("claim-project"));
    assert.ok(drift.diff.added.includes("README.md: +corrected conclusion"));
    assert.equal(drift.review, "pending");
    assert.equal(current.repos[0].reviewedCommit, "a".repeat(40));
    assert.equal(current.repos[0].headSha, "b".repeat(40));
    assert.equal(current.repos[0].drift, true);
    assert.ok(current.changes.some((change) => change.kind === "content" && change.claimIds.includes("claim-page")));
    const retained = current.items.map((item) => item.id).sort();
    const lastSuccess = current.sources.find((source) => source.id === "publisher").lastSuccess;
    await collect(3);
    current = await snapshot();
    assert.deepEqual(current.items.map((item) => item.id).sort(), retained);
    assert.equal(current.sources.find((source) => source.id === "publisher").state, "blocked");
    assert.equal(current.sources.find((source) => source.id === "publisher").lastSuccess, lastSuccess);
    await collect(4, ["--force", "--backfill"]);
    current = await snapshot();
    const corrected = current.items.find((item) => item.id === original.id);
    assert.equal(corrected.priority, "correction");
    assert.equal(corrected.review, "linked");
    assert.equal(corrected.title, "FixtureGuard report retracted");
    assert.ok(current.changes.some((change) => change.kind === "content" && change.diff.added.includes("FixtureGuard report retracted")));
    assert.ok(current.items.some((item) => item.url.endsWith("/historical-paper")));
    assert.ok(current.items.some((item) => item.url.endsWith("/commit/" + "c".repeat(40))));
    assert.equal(current.sources.find((source) => source.id === "repository").backfill.inspectedFrom, "2019-01-01");
    const archive = current.items.find((item) => item.url === "https://research.test/2018/06/01/archive-paper.html");
    assert.equal(archive.title, "FixtureGuard historical analysis");
    assert.equal(archive.published, "2018-06-01");
    assert.equal(current.sources.find((source) => source.id === "publisher").backfill.inspectedFrom, "2018-06-01");
    assert.equal(current.sources.find((source) => source.id === "publisher").backfill.state, "partial");
    await collect(5);
    current = await snapshot();
    assert.equal(current.sources.find((source) => source.id === "publisher").state, "error");
    assert.match(current.sources.find((source) => source.id === "publisher").error, /size limit/);
    assert.equal(current.items.find((item) => item.id === original.id).title, "FixtureGuard report retracted");
    assert.deepEqual(JSON.parse(await readFile(path.join(data, "knowledge", "claims.json"), "utf8")), claims);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
