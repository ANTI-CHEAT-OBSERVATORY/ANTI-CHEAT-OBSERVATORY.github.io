import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateDataset } from "../scripts/knowledge-validation.mjs";
import { importProposal } from "../scripts/import-proposal.mjs";
import { arrayCollections, directoryCollections, readKnowledge } from "../scripts/knowledge-io.mjs";

function fixture() {
  return {
    schemaVersion: "2.0.0",
    records: [{ id: "sample-driver", kind: "component", title: "Sample driver", summary: "An isolated driver record used only for deterministic evidence contract tests.", vendor: "Example", platforms: ["Windows"], layers: ["Kernel"], historical: false, updated: "2026-01-02", tags: [], relatedIds: [], sourceIds: ["source-a"], buildIds: ["build-a"], mechanismIds: [], sections: [{ title: "Observed behavior", claimIds: ["claim-a"] }] }],
    posts: [],
    sources: [{ id: "source-a", title: "Original report", url: "https://example.test/report", publisher: "Example", accessed: "2026-01-02", provenance: "publication", revision: { kind: "unversioned", value: null }, access: "available", transport: "direct", originId: "https://example.test/report", rights: "Metadata only", limitations: ["No runtime verification"] }],
    claims: [{ id: "claim-a", statement: "The source reports one driver callback for the sampled build.", recordIds: ["sample-driver"], postIds: [], systemIds: [], buildIds: ["build-a"], mechanismIds: [], kind: "observation", provenance: "publication", review: "source-inspected", state: "asserted", applicability: "Only the named fixture build; not current deployment.", citations: [{ sourceId: "source-a", relation: "supports", locator: { kind: "section", value: "Callback registration" }, evidence: "Source describes the sampled callback" }], limitations: ["Not independently reproduced"], reviewedAt: "2026-01-02", validationIds: [], contradicts: [], supersedes: [] }],
    builds: [{ id: "build-a", label: "Fixture sample A", recordIds: ["sample-driver"], systemIds: [], platform: "Windows", version: "1.0", hashes: [{ algorithm: "sha256", value: "a".repeat(64), origin: "source-reported", sourceId: "source-a" }], sourceIds: ["source-a"], acquiredAt: null, limitations: ["Source-reported identity"] }],
    mechanisms: [], validations: [], relationships: [], corrections: [], dossiers: [],
  };
}
function execution(overrides = {}) {
  return { id: "validation-a", title: "Bounded execution", claimIds: ["claim-a"], buildId: "build-a", activity: "behavior-reproduced", performedBy: "observatory", authority: "observed", status: "pass", authorized: true, environment: "Isolated authorized lab", tools: "Debugger 1.0", inputs: "One fixed callback event", expected: "One recorded callback event", observed: "One recorded callback event", bounds: "Only this input and hashed sample", sourceIds: ["source-a"], executedAt: "2026-01-01", reviewedAt: "2026-01-02", limitations: ["No whole-program claim"], ...overrides };
}

test("mirrors do not provide independent corroboration", () => {
  const data = fixture();
  const mirror = { ...data.sources[0], id: "source-mirror", url: "https://mirror.test/report", transport: "mirror" };
  data.sources.push(mirror);
  data.claims[0].state = "corroborated";
  data.claims[0].citations.push({ ...data.claims[0].citations[0], sourceId: mirror.id });
  assert.ok(validateDataset(data).some((error) => error.includes("independent origins")));
  mirror.originId = "https://independent.test/report";
  mirror.transport = "direct";
  assert.deepEqual(validateDataset(data), []);
});

test("reproduction cannot borrow sample identity from a different validation", () => {
  const data = fixture();
  data.builds.push({ ...data.builds[0], id: "build-b", label: "Different fixture", hashes: [{ ...data.builds[0].hashes[0], value: "b".repeat(64) }] });
  data.validations.push(execution({ id: "validation-other-build", buildId: "build-b" }), execution({ id: "validation-author-report", authority: "reported", performedBy: "source-author", activity: "source-inspected", status: "reported", executedAt: null, authorized: false }));
  data.claims[0].review = "behavior-reproduced";
  data.claims[0].validationIds = data.validations.map((item) => item.id);
  assert.ok(validateDataset(data).some((error) => error.includes("sample") && error.includes("claim-a")));
  data.validations[0].buildId = "build-a";
  assert.deepEqual(validateDataset(data), []);
});

test("an author's reported reproduction is recordable but cannot promote our claim review", () => {
  const data = fixture();
  data.validations.push(execution({ authority: "reported", performedBy: "source-author", status: "reported", authorized: false, executedAt: null }));
  data.claims[0].validationIds = ["validation-a"];
  assert.deepEqual(validateDataset(data), []);
  data.claims[0].review = "behavior-reproduced";
  assert.ok(validateDataset(data).some((error) => error.includes("authorized execution record")));
});

test("observed execution requires authorization, a hashed sample and an execution date", () => {
  const data = fixture();
  data.claims[0].review = "behavior-reproduced";
  data.claims[0].validationIds = ["validation-a"];
  data.validations.push(execution({ authorized: false, executedAt: null }));
  assert.ok(validateDataset(data).some((error) => error.includes("authorization")));
  data.validations[0] = execution();
  data.builds[0].hashes = [];
  assert.ok(validateDataset(data).some((error) => error.includes("hashed sample")));
  data.builds[0] = fixture().builds[0];
  assert.deepEqual(validateDataset(data), []);
});

test("unread source bodies cannot become inspected observations", () => {
  const data = fixture();
  data.sources[0].access = "blocked";
  assert.ok(validateDataset(data).some((error) => error.includes("inaccessible original")));
  data.claims[0].review = "collected";
  assert.deepEqual(validateDataset(data), []);
});

test("supersession and dispute resolution require explicit evidence", () => {
  const data = fixture();
  data.claims[0].state = "superseded";
  assert.ok(validateDataset(data).some((error) => error.includes("replacement claim")));
  data.claims[0].state = "asserted";
  data.corrections.push({ id: "correction-a", date: "2026-01-02", title: "Correctness dispute", summary: "A repair commit alone is not proof of resolution.", recordIds: ["sample-driver"], claimIds: ["claim-a"], sourceIds: ["source-a"], kind: "dispute", before: "Unresolved criticism", after: "A newer commit exists", status: "resolved", resolutionEvidenceIds: [] });
  assert.ok(validateDataset(data).some((error) => error.includes("cannot be resolved")));
  data.corrections[0].status = "open";
  assert.deepEqual(validateDataset(data), []);
});

test("refutation requires attributed counterevidence rather than a state-only edit", () => {
  const data = fixture();
  data.claims[0].state = "refuted";
  assert.ok(validateDataset(data).some((error) => error.includes("counterevidence")));
  data.sources.push({ ...data.sources[0], id: "counter-source", title: "Scoped counteranalysis", url: "https://counter.test/report", originId: "https://counter.test/report" });
  data.claims[0].citations.push({ sourceId: "counter-source", relation: "contradicts", locator: { kind: "section", value: "Counterexample" }, evidence: "The source supplies a counterexample within the original claim scope." });
  assert.deepEqual(validateDataset(data), []);
});

async function withCatalog(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aco-import-test-"));
  try {
    const data = fixture();
    for (const collection of arrayCollections) {
      const target = path.join(root, "src/data/knowledge", `${collection}.json`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(data[collection]));
    }
    for (const [collection, directory] of Object.entries(directoryCollections)) {
      await mkdir(path.join(root, directory), { recursive: true });
      for (const entity of data[collection]) await writeFile(path.join(root, directory, `${entity.id}.json`), JSON.stringify(entity));
    }
    await run(root, data);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("a broken multi-entity import leaves every catalog file unchanged", () => withCatalog(async (root, data) => {
  const proposal = { schemaVersion: "2.0.0", sources: [{ ...data.sources[0], id: "source-new" }], claims: [{ ...data.claims[0], id: "claim-new", recordIds: ["missing-driver"] }] };
  await assert.rejects(importProposal(proposal, { root }), /unknown record/);
  assert.deepEqual(await readKnowledge(root), data);
  assert.equal((await readdir(root)).includes(".aco-import.lock"), false);
}));

test("imports reject accidental replacements and honor dry-run before an explicit replacement", () => withCatalog(async (root, data) => {
  const proposal = { schemaVersion: "2.0.0", records: [{ ...data.records[0], title: "Reviewed replacement" }] };
  await assert.rejects(importProposal(proposal, { root }), /already exists/);
  await importProposal(proposal, { root, replace: true, dryRun: true });
  assert.equal((await readKnowledge(root)).records[0].title, "Sample driver");
  await importProposal(proposal, { root, replace: true });
  assert.equal((await readKnowledge(root)).records[0].title, "Reviewed replacement");
}));
