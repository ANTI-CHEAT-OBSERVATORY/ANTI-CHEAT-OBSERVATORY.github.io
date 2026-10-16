# Anti-Cheat Observatory

A version-scoped, source-backed reference to anti-cheat systems and the public research about them. The unit of knowledge is not an article or a repository — it is a **scoped, attributable claim** with an explicit evidence origin, review activity, claim state and applicability.

Astro + TypeScript, static output, Git-backed JSON content, GitHub Pages hosting. No backend, database, account or external contributor workflow is required.

## The problem this model exists to solve

An artifact can simultaneously be valuable, partially correct, externally disputed, and not independently reproduced. A single "verified" badge cannot express that, and a function-level criticism must not be allowed to either condemn or vindicate an entire body of research.

So the catalog separates three axes that are usually collapsed:

| Axis | Values | Meaning |
|---|---|---|
| **Provenance** | vendor, publication, repository, community, academic, disclosure, unverified | Who supplied the assertion |
| **Review activity** | collected, source-inspected, artifact-inspected, behavior-reproduced | What the Observatory actually did |
| **Claim state** | asserted, corroborated, disputed, refuted, superseded | Where the assertion currently stands |

Structural guards require distinct declared origin IDs for `corroborated`, an explicit challenge for `disputed`, attributed counterevidence for `refuted`, and a replacement claim for `superseded`. The maintainer must still establish source independence and judge the evidence: mirrors, reposts and revisions of one work share an origin.

`artifact-inspected` requires an authorized, dated, observed inspection record. `behavior-reproduced` additionally requires a passing execution record for a hashed build within the claim's scope; it cannot borrow a sample identity from another validation. These checks establish consistency, not binary correctness.

## Quick start

Node.js 22.22.0 or newer (required by Astro 7).

```sh
npm install
npm run dev        # local preview with hot reload
npm run check      # Astro/TypeScript diagnostics
npm run validate   # schema, cross-reference, dispute and discovery integrity
npm test           # deterministic evidence, importer and discovery regressions
npm run build      # validate, build the static site, then generate the Pagefind index
npm run preview    # serve the built dist/
npm run sync       # collect public source metadata (network; see Maintenance)
npm run digest     # regenerate the weekly discovery digest
npm run import -- proposal.json [--replace] [--dry-run]
npm run format     # Prettier for source, content, and config
```

Astro picks a free port if the default is busy; pass `-- --port 4341` to request one.

## Site map

Primary destinations: **Catalog · Systems · Research · Updates**. Everything else is secondary.

| Route | Purpose |
|---|---|
| `/` and `/catalog` | Search-first catalog: kind, vendor, platform, layer, period and claim-state filters, plus static full-text search |
| `/systems` | The nine system dossiers and their completeness |
| `/research` | Research projects and tooling, filtered from the catalog |
| `/updates` | Corrections, disputes, editorial revisions, and the pending source-change queue |
| `/records/<id>` | A record: scoped claims, cited sources, builds, mechanisms, corrections |
| `/claims/<id>` | One claim: statement, applicability, evidence locators, contradictions, validations |
| `/sources/<id>` | One source: revision identity, access, transport, mirror origin, rights, dependent claims |
| `/builds/<id>` | One sample/build: reported versus computed hashes, scope, limitations |
| `/mechanisms/<id>` | Technical worksheet: trigger, context, conditions, primitives, counterexamples, unknowns |
| `/coverage` | Per-system evidence across the eight dossier aspects, with explicit gaps; dossiers live at `/records/<system-id>` |
| `/relationships` | Evidence-backed relationship explorer with a table alternative |
| `/compare` | Version-scoped comparison of documented mechanisms (never a strength ranking) |
| `/workspace` | Authorized reproducibility ledger and validation-proposal builder |
| `/library` | Local bookmarks, watches and saved queries (browser storage only) |
| `/projects`, `/blog`, `/blog/<id>` | Project showcase, editorial notes, and one note |
| `/feed` | Unreviewed discovery: publisher metadata, retrieval status, backfill scope |
| `/matrix`, `/methodology`, `/data`, `/publishing` | Trust-boundary reading map, evidence contract, dataset documentation, publishing workspace |
| `/api/v2/*`, `/updates.xml`, `/digest.xml` | Machine-readable exports and feeds |

## Evidence model

Files live in `src/data/knowledge/` (collections plus `validations/<id>.json`) and `src/data/records/`, `src/data/posts/`. The contract is `src/data/knowledge.schema.json`; types are `src/lib/knowledge-types.ts`; query helpers are `src/lib/knowledge.ts`.

| Entity | Purpose |
|---|---|
| System / integration | Vendor, product, platform, lifecycle, documented boundaries — a product family is not one immutable deployment |
| Component | Driver, service, library, launcher or server boundary with documented responsibilities |
| Mechanism | Canonical behavior or interface with build-specific claims and a full technical worksheet |
| Sample / build | Filename, version, source-reported versus project-computed hash, provenance, scope |
| Source / revision | Original URL, immutable revision identity, access state, transport, origin, rights, limitations |
| Claim | One assertion with scope, locators, supporting and contradicting evidence, limitations, state |
| Finding | Root cause and disclosure history — a weakness is not automatically a current bypass |
| Investigation / project | Question, tools, input identity, reported validation, unresolved functions, criticisms |
| Correction / event | What changed, which claim or revision it affects, and its resolution status |

Records keep stable IDs and stable URLs. A record's `sections` reference claim IDs; claims reference sources, builds and mechanisms. `relatedIds` is editorial browsing metadata and is explicitly **not** evidence of an architectural or implementation relationship — those live in `relationships.json`, where every edge must cite a claim that itself has citations.

### The EAC dispute as the reference case

`eac-linux-devirt` is the catalog's worked example of not collapsing distinct claims. The reviewed revision (`10d67114e3`) and a later upstream revision (`dc5f947d75`) carry separately scoped author-reported measurements; the function-level correctness question for `0x237F0` is an open dispute in which the critique and the recovery remain linked but not resolved; `correction-eac-237f0` records before/after wording. A newer commit cannot silently close the dispute, because resolution requires evidence addressing the specific criticism.

The catalog has not reproduced that devirtualization or validated either comparison against the original binary, and no claim here asserts a current bypass.

## Maintenance

The build consumes committed research data and does not run source collection. Dependency installation needs normal package access; collection is a separate command that writes the snapshot.

```sh
npm run sync                      # poll sources whose interval has elapsed
npm run sync -- --force           # poll every configured source
npm run sync -- --backfill        # inspect only the configured bounded historical endpoints
npm run digest                    # regenerate the weekly digest
```

`src/data/discovery-sources.json` is the reviewed source registry: approved HTTPS endpoints, acquisition kind, scope, interval, and bounded backfill endpoints. `src/data/discovery.json` is the durable snapshot; `src/data/discovery-state.json` holds content fingerprints used for change detection.

What it does:

- **RSS/Atom** — approved feeds have an 8 MB transport cap, with at most 100 entries processed per poll and 350-character summaries retained. Full article bodies embedded in a feed are not republished. Known tracking parameters are removed without collapsing meaningful URL variants.
- **GitHub** — head and reviewed revisions, up to 30 public releases and 30 recently updated public issues per poll, and bounded commit comparison patches. Pull requests and draft releases are excluded; an issue remains an unreviewed report.
- **Documents/pages** — bounded public text metadata; PDFs are version-probed by HTTP header only and are never downloaded or executed.
- **Historical backfill** — up to three pages of 100 public commits per configured repository; approved sitemaps and dated HTML article indexes are bounded to eight requests and 300 URLs. HTML indexes contribute article links, titles and index-reported dates, not author profiles or article bodies. Their coverage remains partial. Sitemap-derived labels never overwrite an inspected feed title.
- **Change detection** — bounded feed metadata, page titles/descriptions/headings, document version headers and repository patches. The first publication fingerprint establishes a baseline; enriching or normalizing an older snapshot is not evidence of an upstream edit. This is not a full-body archive or a semantic correctness check.
- **Publication eligibility** — known researcher-profile, author-directory and tag/category/index URL patterns are excluded from discovery and pruned from older snapshots. Passing this filter makes a URL a candidate, not a reviewed research finding.

What it refuses to do:

- A blocked forum stays an inaccessible lead. Titles are not converted into bodies, and access controls are not bypassed.
- Never-attempted sources are `pending`, not `error`; a blocked source keeps its last success, retained items and honest status.
- Discovered items are **unreviewed metadata**. They never advance a `reviewedCommit` and never change a claim state.
- Mirrors are recorded as mirrors. Two mirrors of one document are one origin, not corroboration.
- Historical coverage is recorded as inspected ranges. A latest-items feed is not an archive, and the snapshot says so.

`.github/workflows/sync-sources.yml` runs daily, generates the digest on the weekly schedule, validates, commits only discovery files when they changed, and then explicitly dispatches `pages.yml` — a push made with `GITHUB_TOKEN` does **not** trigger another push workflow. It needs `contents: write` to commit and `actions: write` to dispatch, and repository rules must permit the bot to update the default branch. No personal access token is required.

To expand collection, add an approved endpoint and its explicit scope to the registry, then run `npm run sync -- --backfill`. Do not add arbitrary article traversal. Inspect the inbox before drafting sources/claims through `/publishing`; import the proposal as described below. In `src/data/discovery.json`, manually set an item's `review` to `linked` or `dismissed` after triage, and a source change's `review` to `reviewed` only after inspecting the relevant evidence. Collection preserves those decisions and never advances a project's reviewed commit.

## Updating the reference

Browser drafting, followed by a local import:

1. Open `/publishing` (or `/workspace` for a validation record) and fill in the source, scoped claims and note.
2. The page validates against the full schema and runs the same semantic and cross-reference guards as the CLI, then downloads a `KnowledgeProposal`.
3. Import it with `npm run import -- <proposal.json>`; use `--dry-run` first, or `--replace` to revise an existing ID.
4. Inspect the diff, run `npm run build`, exercise the affected pages, then commit to the default branch. GitHub Actions validates and publishes.

If you deliberately change a project's reviewed commit, run `npm run sync` before building so the repository snapshot re-derives that pin from the record. This does not establish correctness or advance any claim's review state; the associated source/build evidence still needs its own inspection.

The importer is transactional: it validates the proposal, then the merged catalog, then stages every file and re-checks that the catalog did not change underneath it before replacing anything — rolling back if it did. It never auto-promotes a claim state or silently links a validation.

Editorial rules before committing:

1. Establish the product, component, version, provenance and the question being answered.
2. Inspect the original publication when reachable. If a permitted mirror is the only transport, record it and exactly which material was available; a snippet or generated summary is not inspected source text.
3. Attach evidence to the specific claim it supports, with a real locator, and leave unknowns explicit.
4. Never convert a historical finding into a current exposure, or a vulnerability into an anti-cheat bypass.
5. Never mark behavior reproduced without an authorized, bounded execution record with a hashed sample.
6. Run `npm run build`, then exercise the changed pages.

## Deploying on GitHub Pages

`.github/workflows/pages.yml` validates on every pull request and push, then builds and deploys only from the default branch (`workflow_dispatch` also deploys manually).

This checkout is already an initialised Git repository (`main`, one commit). Create the remote and push:

```sh
# With the GitHub CLI, this creates the repository and pushes in one step:
gh repo create anti-cheat-observatory --public --source=. --remote=origin --push

# Without the CLI, create an empty repository in the GitHub UI, then:
git remote add origin git@github.com:<owner>/anti-cheat-observatory.git
git push -u origin main
```

Then:

1. Repository → Settings → Pages → Source: **GitHub Actions**.
2. Push to the default branch or run the workflow manually.

Set the `PUBLIC_REPOSITORY` variable to `<owner>/anti-cheat-observatory` so edit links resolve.

The workflow runs `actions/configure-pages` and passes its origin and base path into the build, so the same code serves a user site at `/`, a project site at `/repo/`, and a custom domain. Optional repository variables override them:

| Variable | Effect |
|---|---|
| `SITE_URL` | Absolute site origin, e.g. `https://observatory.example` (also used for absolute RSS links) |
| `BASE_PATH` | Root-relative base, e.g. `/anti-cheat-observatory/` |
| `PUBLIC_REPOSITORY` | `owner/repo`, enables edit links and the footer GitHub link |
| `PUBLIC_REPOSITORY_BRANCH` | Branch used by edit links; defaults to `main` |

Locally:

```sh
SITE_URL=https://example.github.io BASE_PATH=/anti-cheat-observatory/ \
  PUBLIC_REPOSITORY=example/anti-cheat-observatory npm run build
```

Internal routes, assets, downloads, fetches and form actions use `withBase()` in `src/lib/paths.ts`. Search uses Pagefind's supported main-thread WASM mode because its relative metadata fetches failed in the observed blob-worker context; this avoids a worker URL workaround at the cost of running queries on the UI thread. Indexed result links follow the site's no-trailing-slash routes. Configure `SITE_URL` for absolute published RSS links; local builds without it retain relative links instead of guessing an origin.

## Publication and rights

- No proprietary driver samples, cheat payloads, live "undetected" feeds, credentials, private telemetry, or undisclosed vulnerability details belong in this repository.
- A vulnerable driver is not automatically malicious, and is not automatically an anti-cheat bypass. A successful driver load, API import, crash, or ban-free period does not prove evasion.
- A purported leak may have a metadata record stating its authenticity, public source and uncertainty. Public availability does not authorize mirroring stolen source, proprietary dumps, personal data, or undisclosed vulnerabilities.
- Do not turn a research reference into a live bypass service.

### Licenses

- **Application code, templates, schemas and configuration**: [MIT](LICENSE).
- **Original editorial prose and curated catalog data** (`src/data/records/`, `posts/`, `knowledge/`, and original in-page prose): [CC BY 4.0](LICENSE-CONTENT).
- **Third-party material** — linked publications, repositories, screenshots, binaries and quoted material — retains its own rights and is cited, not relicensed. Third-party excerpts stay minimal and attributed.

Both licenses are conventional defaults chosen so the project can be reused and cited; change them before publishing if you want different terms. `RESEARCH-ROADMAP.md` documents the model's design; this README documents what is implemented.

## Verification — 2.0.0

Exercised on 2026-10-16:

- `npm test`: 15 passing evidence, import and discovery regressions. `npm run check`: zero errors, warnings or hints.
- Production root and `/blog/` project-path builds: 814 HTML pages each; Pagefind indexes 802 reference pages. Every generated page, local resource, internal link and fragment was crawled in both mounts, with no broken targets or duplicate IDs.
- Browser workflows: all seven search dimensions, component/state filters, persistent bookmarks and source/entity watches, rename/remove, real backup download/restore, unsafe-URL rejection, build comparison, graph-to-claim navigation, and discovery relevance filters.
- Existing-source, new-source and validation proposals were downloaded through the browser; all three passed the actual CLI importer with `--dry-run`. Edited drafts revoked stale exports; inaccessible evidence and falsely relabeled observations were rejected.
- Light/dark themes, keyboard entry and reading controls were exercised at phone, tablet and desktop widths. CSV parsed as 52 records with 16 consistent columns; both RSS feeds had valid XML, unique GUIDs, absolute published URLs and valid local fragment targets.
- Live collection and historical backfill were exercised. The secret.club dated index supplied 55 article links spanning 2019-01-09 through 2026-05-21; these remain unreviewed metadata, not inspected article bodies. Known profile/index links are excluded, and unavailable sources retain their status and earlier data.

Use `npm run build` followed by `npm run preview` to exercise Pagefind; `npm run dev` does not generate the static search index. These checks verify the application's behavior, not anti-cheat binary semantics or independent research reproduction. GitHub deployment was not executed locally.
