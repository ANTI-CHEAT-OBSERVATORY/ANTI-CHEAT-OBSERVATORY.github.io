# Changelog

## Unreleased

- Fixed shared page headers squeezing Updates and other stacked-content pages into narrow flex columns. Catalog, Systems and Research now explicitly opt into horizontal header rows, which stack at widths of 800px and below.

## 2.0.0 — 2026-10-16

- Migrated all 52 records and 9 notes to normalized source, claim, build, mechanism, validation, relationship, correction and dossier contracts. Version 2 exports replace the obsolete version 1 endpoints and embedded evidence fields.
- Preserved the function-level EAC dispute without treating either the critique's existence or a newer upstream commit as proof of whole-program correctness. Original and later measurements, mirror access and independent-validation limits remain distinct.
- Added consistent eight-aspect dossiers for nine systems and ten-topic mechanism worksheets, with specific unanswered questions instead of guessed internals.
- Replaced the promotional landing page with a compact, search-first table and Catalog / Systems / Research / Updates navigation. Results expose claim states, build scope and review dates; mobile filters/outlines collapse and tables scroll locally.
- Added build-generated Pagefind search for system, driver, hash, CVE, mechanism, function and source text. Supported main-thread WASM mode avoids the observed worker URL failure; result URLs respect the application's canonical paths and GitHub Pages prefixes.
- Added a durable discovery inbox, canonical/origin grouping, approved publisher archive and repository-history backfill, public release/issue metadata, bounded source/version diffs, re-review links, daily collection and weekly digests. Initial fingerprints are baselines, not invented publication edits; inaccessible sources retain earlier discoveries.
- Added local bookmarks, saved queries, entity/source watches and validated JSON backup/restore, plus update and digest RSS with revision-specific GUIDs.
- Added build-scoped comparisons, sourced relationship graphs with table alternatives, and a reproducibility ledger/proposal workspace. Author-reported execution stays distinct from Observatory observation.
- Added schema-checked browser proposal downloads and transactional CLI imports, stale-output invalidation, evidence/collection regressions in CI, and explicit MIT code / CC BY 4.0 original-content licensing.
- Excluded researcher profiles, author directories and taxonomy/index pages from new discovery and legacy snapshots; retained-publication triage and digest references remain consistent.
- Mechanism topics share a deduplicated evidence section, preserving a single stable anchor per claim instead of repeating citation blocks across worksheet cells.

- Upgraded Astro from 5.x to 7.4.0 to resolve dependency advisories; declared Node.js 22.22.0 as the minimum supported runtime and refreshed the lockfile.
- Fixed scheduled refresh deployment: the default-branch sync job explicitly dispatches the Pages workflow after its bot commit, with scoped Actions write permission. `GITHUB_TOKEN` pushes do not trigger push workflows.
- Fixed GitHub Pages route collisions when a repository base matches an application route, such as `/blog/`.
- Project detail pages now highlight Projects in the main navigation.
- Editing a prepared publishing draft now revokes its old download and clears the previous output and GitHub shortcut; failed validation cannot leave a stale publishable result visible.
- Removed the obsolete researcher-social branch from the publishing logic and corrected documentation that incorrectly promised a missing-feed fallback.
- Reverified production builds, dependency audit, rendered pages and internal links, mobile layouts, browser downloads, publishing state transitions, live source retrieval and the workflow's local commit/push behavior.
- Corrected the EAC Linux project entry after an external correctness critique: its summary now identifies partial, disputed AI-assisted recovery, the critique and retrieval limits are cited, and the former endorsement has been withdrawn.
- Pinned EAC measurements to README revision `10d67114e3` (including 1,313 patched branches and 27 tests), with later `dc5f947d75` author-reported results explicitly separate and no implied resolution of the dispute.
- Added `Community report` to catalog section labels with mandatory attribution, and made existing section evidence labels visible on record and blog pages using the established styles. Specific public-post citations are allowed without restoring personal-profile links.
- Added `RESEARCH-ROADMAP.md`: scoped claims, version/sample identity, contradictions, a durable discovery inbox, deep-dossier requirements, feature priorities and a simpler search-first UI.

## 1.2.0 — 2026-10-16

Link policy

- Removed every researcher social profile, personal handle and tweet link from the source directory, records and notes, and dropped the `Researcher social` source type from the schema so it cannot be reintroduced by the publishing form. Attribution now comes from publisher bylines and repository URLs.

Deep-dive research projects

- Added a `project` record kind with `repoUrl`, `repoLicense`, `repoLanguage` and `reviewedCommit`, plus a `/projects` showcase, project cards, and a repository panel on each project page.
- Added four project records: `eac-linux-devirt` (EAC Linux `plx.elf` devirtualization), `ironshield-analysis` (`tvk.sys` static analysis), `ring-one-io` (UEFI bootloader implant deobfuscation) and `chernobog` (Hikari LLVM obfuscation recovery tooling).
- Products and projects now cross-link: product pages list the deep dives that examine them, and project pages list the records they analyze.

New system and coverage

- Added the Ironshield system dossier, the `tvk.sys` kernel driver record, and a finding for the reported IOCTL authorization weaknesses — including the certificate substring check, statically derivable LEA key, client-supplied symbol offsets, and the reachable IOCTL capabilities, all attributed to the published analysis with its unresolved remediation status.
- Added ten technique studies: IOCTL authorization, handle access filtering, image load filtering, driver client authentication, kernel symbol resolution, driver transport encryption, protected process light, runtime driver attestation, Linux/Proton anti-cheat, and enforcement/privacy/appeals.
- Added `/coverage`: a per-system map across components, techniques, findings, projects and notes that shows explicit gaps and the cross-vendor queue.

Automated source feed

- Added `npm run sync`, which fetches RSS/Atom research feeds and GitHub repository state into `src/data/feed.json`, recording blocked sources with their HTTP status instead of omitting them, and preserving previous repository snapshots as stale when a fetch fails.
- Added upstream drift detection: each project record pins a `reviewedCommit`, and the site flags when a repository head moves past it, including on the project card, project page and `/feed`.
- Added `/feed` with source status cards, the latest publications, the tracked-repository table, and documentation of the workflow; added `/api/v1/feed.json`.
- Added the weekly `sync-sources.yml` workflow, which refreshes the snapshot with a repository token, validates it, commits when changed, and emits `::warning::` annotations for upstream drift.
- Extended validation to project repository fields and the feed snapshot, including that every tracked repository agrees with its record's `reviewedCommit`.

## 1.1.0 — 2026-10-16

UI and product focus

- Replaced the field-notes design with a graphite/cyan systems-lab interface: horizontal navigation, oversized type, product-first cards with system accents, and per-product visual identity.
- Added a component map to every product page: documented drivers, services, clients, and remote components grouped by trust layer, each linking to its record with file identity or an explicit "not established" note.
- Added a systems hub homepage with a featured component map, product grid, research feed, and source trail; moved the searchable index to `/catalog` with query-string search and filters preserved.
- Added a technique-to-trust-layer reading map for research scope, a responsive shell with an inert-toggled mobile navigation, and print/reduced-motion styles.

Research blog

- Added nine attributed research briefings with evidence-labeled sections, takeaways, original-source links, and category/system/source filters.
- Curated the public trail: secret.club BattlEye analysis and emulation detection, Aftermath Labs devirtualization research, a daax tracing article reached through his public pinned post, and claim-triage guides for UnknownCheats and GuidedHacking.
- Recorded access limitations instead of inventing content: forum threads and some social retrieval were blocked, which each affected note states explicitly.
- Added the seven-system catalog entry for Anti-Cheat Expert, including the four ACE kernel drivers named in Aftermath Labs' July 2026 study, plus BattlEye's BEClient and reported BEServer boundary.

Publishing and deployment

- Added a browser publishing workspace that validates input, generates complete post JSON against the schema, offers download/copy, blocks duplicate IDs, and opens a GitHub new-file page only for a genuinely valid `owner/repo`.
- Added the GitHub Pages workflow: validation on pull requests, base-path/origin discovery through `configure-pages`, and deployment restricted to the default branch.
- Added base-aware routing helpers so `/`, `/repo/`, and custom-domain deployments all resolve links and downloads correctly.
- Added `/api/v1/research.json` and `/api/v1/post-schema.json`, extended validation to posts and the source directory, and rewrote the README around a repeatable update workflow.
- Removed dead code found by audit: unused icon paths, unstyled markup classes, and orphaned stylesheet rules.

## 1.0.0 — 2026-10-16

- Initial catalog: six product dossiers, ten component records, ten technique studies, two historical findings, evidence-labeled sections with per-record citations, live filters and search, a trust-layer matrix, JSON/CSV exports, and record validation.
