import type { KnowledgeDataset, KnowledgeProposal, Claim, ValidationRecord } from "./knowledge-types.ts";

const collections = ["records", "posts", "sources", "claims", "builds", "mechanisms", "validations", "relationships", "corrections"] as const;
const aspectIds = ["deployment", "components", "interfaces", "mechanisms", "protection", "findings", "research", "history"];
const worksheetIds = ["trigger", "context", "inputs", "outputs", "conditions", "protected-object", "primitives", "dependencies", "validation", "counterexamples"];
const https = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };

/** Semantic validation after JSON Schema shape validation. Shared by browser proposals and CLI imports. */
export function knowledgeErrors(data: KnowledgeDataset): string[] {
  const errors: string[] = [];
  const allIds = new Set<string>();
  for (const key of collections) {
    for (const entity of data[key]) {
      if (allIds.has(entity.id)) errors.push(`${key}: duplicate global ID ${entity.id}`);
      allIds.add(entity.id);
    }
  }
  const records = new Map(data.records.map((entity) => [entity.id, entity]));
  const posts = new Map(data.posts.map((entity) => [entity.id, entity]));
  const sources = new Map(data.sources.map((entity) => [entity.id, entity]));
  const claims = new Map(data.claims.map((entity) => [entity.id, entity]));
  const builds = new Map(data.builds.map((entity) => [entity.id, entity]));
  const mechanisms = new Map(data.mechanisms.map((entity) => [entity.id, entity]));
  const validations = new Map(data.validations.map((entity) => [entity.id, entity]));
  const systems = new Set(data.records.filter((record) => record.kind === "product").map((record) => record.id));
  const refs = (owner: string, ids: string[], index: { has(id: string): boolean }, label: string) => {
    for (const id of ids) if (!index.has(id)) errors.push(`${owner}: unknown ${label} ${id}`);
  };
  const observed = (validation: ValidationRecord | undefined, activity: string, claim?: Claim) => Boolean(validation && validation.authority === "observed" && validation.performedBy === "observatory" && validation.authorized && validation.activity === activity && validation.executedAt && (!claim || validation.claimIds.includes(claim.id)));
  for (const source of data.sources) {
    if (!https(source.url) || (source.retrievalUrl && !https(source.retrievalUrl))) errors.push(`${source.id}: source URLs must be absolute HTTPS`);
    if (source.revision.kind === "git" && !/^[a-f0-9]{40}$/.test(source.revision.value ?? "")) errors.push(`${source.id}: git revision must be a full commit SHA`);
    if (source.revision.kind === "unversioned" && source.revision.value !== null) errors.push(`${source.id}: unversioned sources cannot claim an immutable revision`);
    if (source.transport === "mirror" && (!source.originId || source.originId === source.id)) errors.push(`${source.id}: a mirror must identify its original evidence origin`);
    if (/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(source.url) && !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(source.url)) errors.push(`${source.id}: researcher profiles are not evidence citations`);
  }
  for (const record of data.records) {
    refs(record.id, record.relatedIds, records, "record");
    refs(record.id, record.sourceIds, sources, "source");
    refs(record.id, record.buildIds, builds, "build");
    refs(record.id, record.mechanismIds, mechanisms, "mechanism");
    if (record.relatedIds.includes(record.id)) errors.push(`${record.id}: a record cannot relate to itself`);
    if (record.kind === "project" && !record.repoUrl) errors.push(`${record.id}: project repository URL is required`);
    if (record.kind !== "project" && (record.repoUrl || record.reviewedCommit || record.repoLicense || record.repoLanguage)) errors.push(`${record.id}: repository fields belong to projects`);
    if (record.historical && record.kind !== "finding") errors.push(`${record.id}: historical flag is reserved for findings`);
    for (const section of record.sections) {
      refs(record.id, section.claimIds, claims, "claim");
      for (const id of section.claimIds) if (claims.has(id) && !claims.get(id)!.recordIds.includes(record.id)) errors.push(`${record.id}: section claim ${id} must identify its record`);
    }
  }
  for (const post of data.posts) {
    refs(post.id, post.productIds, systems, "system"); refs(post.id, post.relatedIds, records, "record"); refs(post.id, post.sourceIds, sources, "source");
    if (post.updated < post.published) errors.push(`${post.id}: update date precedes publication`);
    for (const section of post.sections) {
      refs(post.id, section.claimIds, claims, "claim");
      for (const id of section.claimIds) if (claims.has(id) && !claims.get(id)!.postIds.includes(post.id)) errors.push(`${post.id}: section claim ${id} must identify its post`);
    }
  }
  for (const claim of data.claims) {
    refs(claim.id, claim.recordIds, records, "record"); refs(claim.id, claim.postIds, posts, "post"); refs(claim.id, claim.systemIds, systems, "system"); refs(claim.id, claim.buildIds, builds, "build"); refs(claim.id, claim.mechanismIds, mechanisms, "mechanism"); refs(claim.id, claim.validationIds, validations, "validation"); refs(claim.id, claim.contradicts, claims, "contradictory claim"); refs(claim.id, claim.supersedes, claims, "superseded claim");
    if (!claim.recordIds.length && !claim.postIds.length) errors.push(`${claim.id}: claim must be linked to a record or note`);
    if ([...claim.contradicts, ...claim.supersedes].includes(claim.id)) errors.push(`${claim.id}: self-contradiction/supersession is not allowed`);
    const supportingOrigins = new Set<string>();
    let accessible = false;
    for (const citation of claim.citations) {
      const source = sources.get(citation.sourceId);
      if (!source) { errors.push(`${claim.id}: unknown citation source ${citation.sourceId}`); continue; }
      if (citation.locator.url && !https(citation.locator.url)) errors.push(`${claim.id}: citation locator must use HTTPS`);
      if (citation.locator.kind === "function" && !citation.locator.addressSpace) errors.push(`${claim.id}: function locator needs an address space`);
      if (citation.relation === "supports") supportingOrigins.add(source.originId);
      if (source.access === "available") accessible = true;
    }
    if (["observation", "inference"].includes(claim.kind) && !claim.citations.some((citation) => citation.relation !== "context")) errors.push(`${claim.id}: factual claim needs attributed supporting or contradicting evidence`);
    if (claim.state === "corroborated" && supportingOrigins.size < 2) errors.push(`${claim.id}: corroboration needs at least two independent origins, not mirrors`);
    if (claim.state === "disputed" && !claim.contradicts.length && !claim.citations.some((citation) => citation.relation === "contradicts") && !data.claims.some((other) => other.contradicts.includes(claim.id))) errors.push(`${claim.id}: disputed claim needs an explicit challenge`);
    if (claim.state === "refuted" && !claim.citations.some((citation) => citation.relation === "contradicts") && !data.claims.some((other) => other.contradicts.includes(claim.id) && other.review !== "collected" && !["refuted", "superseded"].includes(other.state) && other.citations.some((citation) => citation.relation === "supports"))) errors.push(`${claim.id}: refutation needs attributed counterevidence, not merely a new state label`);
    if (claim.state === "superseded" && !data.claims.some((other) => other.supersedes.includes(claim.id))) errors.push(`${claim.id}: superseded claim needs a replacement claim`);
    if (claim.review === "source-inspected" && claim.kind === "observation" && !accessible) errors.push(`${claim.id}: inaccessible original text cannot be source-inspected evidence`);
    if (["artifact-inspected", "behavior-reproduced"].includes(claim.review)) {
      const matching = claim.validationIds.map((id) => validations.get(id)).filter((value): value is ValidationRecord => Boolean(value));
      if (!matching.some((validation) => observed(validation, claim.review, claim) && (
        claim.review !== "behavior-reproduced" || (
          validation.status === "pass" &&
          validation.buildId !== null &&
          claim.buildIds.includes(validation.buildId) &&
          (builds.get(validation.buildId)?.hashes.length ?? 0) > 0
        )
      ))) errors.push(`${claim.id}: ${claim.review} requires one matching authorized execution record and a hashed sample in the claim scope`);
    }
  }
  for (const build of data.builds) {
    refs(build.id, build.recordIds, records, "record"); refs(build.id, build.systemIds, systems, "system"); refs(build.id, build.sourceIds, sources, "source");
    for (const hash of build.hashes) {
      if (hash.origin === "source-reported" && (!hash.sourceId || !sources.has(hash.sourceId))) errors.push(`${build.id}: source-reported hash requires an identifiable source`);
      if (hash.origin === "project-computed") {
        const validation = validations.get(hash.validationId ?? "");
        if (!observed(validation, "artifact-inspected") || validation?.status !== "pass" || validation?.buildId !== build.id) errors.push(`${build.id}: a computed hash requires a matching observed artifact-validation record`);
      }
    }
  }
  for (const mechanism of data.mechanisms) {
    refs(mechanism.id, mechanism.systemIds, systems, "system"); refs(mechanism.id, mechanism.recordIds, records, "record"); refs(mechanism.id, mechanism.buildIds, builds, "build"); refs(mechanism.id, mechanism.claimIds, claims, "claim");
    if (new Set(mechanism.worksheet.map((row) => row.topic)).size !== worksheetIds.length || worksheetIds.some((topic) => !mechanism.worksheet.some((row) => row.topic === topic))) errors.push(`${mechanism.id}: all technical worksheet topics are required exactly once`);
    for (const row of mechanism.worksheet) {
      refs(mechanism.id, row.claimIds, claims, "worksheet claim");
      if (!row.claimIds.length && !row.unknown?.trim()) errors.push(`${mechanism.id}: ${row.topic} must have evidence or an explicit unknown`);
      if (row.claimIds.some((id) => !mechanism.claimIds.includes(id))) errors.push(`${mechanism.id}: worksheet evidence must belong to the mechanism's claims`);
    }
  }
  for (const validation of data.validations) {
    refs(validation.id, validation.claimIds, claims, "claim"); refs(validation.id, validation.sourceIds, sources, "source");
    if (validation.buildId && !builds.has(validation.buildId)) errors.push(`${validation.id}: unknown validation build ${validation.buildId}`);
    if (validation.authority === "observed") {
      if (!validation.authorized || validation.performedBy !== "observatory" || !validation.executedAt || validation.status === "reported") errors.push(`${validation.id}: observed work requires authorization, Observatory performer, execution date and observed result`);
      if (validation.activity === "behavior-reproduced" && (!validation.buildId || !(builds.get(validation.buildId)?.hashes.length))) errors.push(`${validation.id}: observed execution needs a hashed sample`);
    } else if (validation.status === "pass") errors.push(`${validation.id}: an external author's passing tests must be labeled reported, not our observed pass`);
    if (validation.executedAt && validation.executedAt.slice(0, 10) > validation.reviewedAt) errors.push(`${validation.id}: review cannot predate execution`);
  }
  for (const relationship of data.relationships) {
    refs(relationship.id, [relationship.fromId, relationship.toId], allIds, "relationship endpoint"); refs(relationship.id, relationship.claimIds, claims, "evidence claim");
    if (relationship.fromId === relationship.toId) errors.push(`${relationship.id}: self-edge is not a documented relationship`);
    if (!relationship.claimIds.some((id) => { const claim = claims.get(id); return claim && ["observation", "inference"].includes(claim.kind) && claim.citations.length > 0; })) errors.push(`${relationship.id}: graph edges need factual evidence, not browsing links`);
  }
  for (const correction of data.corrections) {
    refs(correction.id, correction.recordIds, records, "record"); refs(correction.id, correction.claimIds, claims, "claim"); refs(correction.id, correction.sourceIds, sources, "source");
    for (const id of correction.resolutionEvidenceIds) if (!claims.has(id) && !validations.has(id)) errors.push(`${correction.id}: resolution evidence must identify a claim or validation record`);
    if (correction.kind === "dispute" && correction.status === "resolved" && !correction.resolutionEvidenceIds.length) errors.push(`${correction.id}: a dispute cannot be resolved merely by an upstream commit`);
  }
  const dossierSystems = new Set<string>();
  for (const dossier of data.dossiers) {
    if (!systems.has(dossier.systemId)) errors.push(`${dossier.systemId}: unknown dossier system`);
    if (dossierSystems.has(dossier.systemId)) errors.push(`${dossier.systemId}: duplicate dossier`);
    dossierSystems.add(dossier.systemId);
    if (new Set(dossier.aspects.map((aspect) => aspect.id)).size !== aspectIds.length || aspectIds.some((id) => !dossier.aspects.some((aspect) => aspect.id === id))) errors.push(`${dossier.systemId}: all eight dossier aspects are required exactly once`);
    for (const aspect of dossier.aspects) {
      refs(dossier.systemId, aspect.claimIds, claims, "aspect claim");
      if (aspect.status === "documented" && !aspect.claimIds.length) errors.push(`${dossier.systemId}: documented ${aspect.id} needs evidence`);
      if (aspect.status !== "documented" && !aspect.questions.length) errors.push(`${dossier.systemId}: incomplete ${aspect.id} needs specific open questions`);
    }
  }
  for (const id of systems) if (!dossierSystems.has(id)) errors.push(`${id}: missing uniform system dossier`);
  return errors;
}

export function mergeProposal(proposal: KnowledgeProposal, existing: KnowledgeDataset): KnowledgeDataset {
  const merged = { ...existing };
  for (const key of collections) {
    const additions = proposal[key] ?? [];
    const replacements = new Map(additions.map((entry) => [entry.id, entry]));
    // All collections share identity but retain their concrete type at the dataset boundary.
    (merged as unknown as Record<string, unknown>)[key] = [...existing[key].filter((entry) => !replacements.has(entry.id)), ...additions];
  }
  const dossiers = new Map((proposal.dossiers ?? []).map((entry) => [entry.systemId, entry]));
  merged.dossiers = [...existing.dossiers.filter((entry) => !dossiers.has(entry.systemId)), ...(proposal.dossiers ?? [])];
  return merged;
}

export function proposalErrors(proposal: KnowledgeProposal, existing: KnowledgeDataset, replace = false): string[] {
  const errors: string[] = [];
  for (const key of collections) {
    const existingIds = new Set(existing[key].map((entry) => entry.id));
    const proposedIds = new Set<string>();
    for (const entity of proposal[key] ?? []) {
      if (proposedIds.has(entity.id)) errors.push(`${key}: duplicate proposed ID ${entity.id}`);
      proposedIds.add(entity.id);
      if (!replace && existingIds.has(entity.id)) errors.push(`${key}: ID ${entity.id} already exists; use an explicit replacement`);
    }
  }
  const dossierIds = new Set<string>();
  for (const dossier of proposal.dossiers ?? []) {
    if (dossierIds.has(dossier.systemId)) errors.push(`dossiers: duplicate proposed system ${dossier.systemId}`);
    dossierIds.add(dossier.systemId);
    if (!replace && existing.dossiers.some((entry) => entry.systemId === dossier.systemId)) errors.push(`dossiers: ${dossier.systemId} already exists; use an explicit replacement`);
  }
  return [...errors, ...knowledgeErrors(mergeProposal(proposal, existing))];
}
