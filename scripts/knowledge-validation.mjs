import { readFile } from "node:fs/promises";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { knowledgeErrors, proposalErrors } from "../src/lib/proposal.ts";

export const schema = JSON.parse(await readFile(new URL("../src/data/knowledge.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const checkDataset = ajv.compile(schema);
const checkProposal = ajv.compile({ ...schema, $id: `${schema.$id}:proposal`, required: ["schemaVersion"] });
const shapeErrors = (check) => (check.errors ?? []).map((error) => `${error.instancePath || "/"}: ${error.message}${error.params?.additionalProperty ? ` (${error.params.additionalProperty})` : ""}`);
export function validateDataset(data) {
  return checkDataset(data) ? knowledgeErrors(data) : shapeErrors(checkDataset);
}
export function validateProposal(proposal, existing, replace = false) {
  if (!checkProposal(proposal)) return shapeErrors(checkProposal);
  if (!Object.entries(proposal).some(([key, value]) => key !== "schemaVersion" && Array.isArray(value) && value.length)) return ["Proposal must contain at least one entity"];
  return proposalErrors(proposal, existing, replace);
}

const absoluteHttps = (value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const timestamp = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
/** Discovery remains unreviewed metadata; it may reference evidence, never alter it. */
export function validateDiscovery(snapshot, data, config) {
  const errors = [];
  if (!snapshot || snapshot.schemaVersion !== "2.0.0" || !timestamp(snapshot.syncedAt)) return ["Discovery snapshot requires schemaVersion 2.0.0 and a sync timestamp"];
  for (const key of ["sources", "items", "repos", "changes"]) if (!Array.isArray(snapshot[key])) errors.push(`discovery.${key} must be an array`);
  if (!Array.isArray(config) || !config.length) errors.push("Discovery registry must contain approved sources");
  if (errors.length) return errors;
  const systemIds = new Set(data.records.filter((record) => record.kind === "product").map((record) => record.id));
  const recordIds = new Set(data.records.map((record) => record.id));
  const claimIds = new Set(data.claims.map((claim) => claim.id));
  const configIds = new Set();
  for (const entry of config) {
    if (!entry || typeof entry.id !== "string" || configIds.has(entry.id)) { errors.push("Discovery registry has a missing/duplicate source ID"); continue; }
    configIds.add(entry.id);
    if (!["rss", "github", "page"].includes(entry.kind) || !absoluteHttps(entry.url) || !absoluteHttps(entry.endpoint)) errors.push(`${entry.id}: discovery needs approved HTTPS URLs and a valid acquisition method`);
    if (!Number.isFinite(entry.intervalHours) || entry.intervalHours <= 0) errors.push(`${entry.id}: invalid polling interval`);
    if (!Array.isArray(entry.backfillEndpoints) || entry.backfillEndpoints.some((url) => !absoluteHttps(url))) errors.push(`${entry.id}: invalid backfill endpoint`);
    if (!Array.isArray(entry.systemIds) || entry.systemIds.some((id) => !systemIds.has(id))) errors.push(`${entry.id}: unknown scoped system`);
    if (!entry.scope || !entry.originId) errors.push(`${entry.id}: source scope and origin are required`);
  }
  const statusIds = new Set();
  for (const status of snapshot.sources) {
    if (statusIds.has(status.id)) errors.push(`discovery: duplicate source ${status.id}`);
    statusIds.add(status.id);
    if (!configIds.has(status.id)) errors.push(`${status.id}: snapshot source is absent from the registry`);
    if (!["ok", "blocked", "error", "pending"].includes(status.state) || !absoluteHttps(status.url) || (status.lastAttempt !== null && !timestamp(status.lastAttempt)) || (status.lastSuccess !== null && !timestamp(status.lastSuccess))) errors.push(`${status.id}: invalid retrieval status`);
    if (status.state === "pending" && (status.lastAttempt !== null || status.httpStatus !== null)) errors.push(`${status.id}: a never-attempted source cannot report an attempt or HTTP status`);
    if (status.state === "ok" && status.lastSuccess === null) errors.push(`${status.id}: a reachable source must record its last successful retrieval`);
    if (!status.backfill || !["pending", "partial", "complete", "blocked"].includes(status.backfill.state) || typeof status.backfill.detail !== "string") errors.push(`${status.id}: backfill must record its inspected scope`);
  }
  const itemIds = new Set(); const canonicalUrls = new Set();
  const references = (entity) => {
    if (!Array.isArray(entity.recordIds) || entity.recordIds.some((id) => !recordIds.has(id))) errors.push(`${entity.id}: unknown discovery record`);
    if (!Array.isArray(entity.claimIds) || entity.claimIds.some((id) => !claimIds.has(id))) errors.push(`${entity.id}: unknown affected claim`);
  };
  for (const item of snapshot.items) {
    if (itemIds.has(item.id) || canonicalUrls.has(item.canonicalUrl)) errors.push(`${item.id}: duplicate discovery identity or canonical URL`);
    itemIds.add(item.id); canonicalUrls.add(item.canonicalUrl);
    if (!absoluteHttps(item.url) || !absoluteHttps(item.canonicalUrl) || !statusIds.has(item.sourceId) || !item.originId || !timestamp(item.firstSeen) || !timestamp(item.lastSeen)) errors.push(`${item.id}: invalid persistent discovery identity`);
    if (!["unreviewed", "linked", "dismissed"].includes(item.review) || !["correction", "fix", "drift", "research", "background"].includes(item.priority)) errors.push(`${item.id}: invalid review/priority state`);
    if (!Array.isArray(item.systemIds) || item.systemIds.some((id) => !systemIds.has(id))) errors.push(`${item.id}: unknown discovery system`);
    if (!Array.isArray(item.mirrors) || item.mirrors.some((url) => !absoluteHttps(url))) errors.push(`${item.id}: invalid mirror URL`);
    references(item);
  }
  const changeIds = new Set();
  for (const change of snapshot.changes) {
    if (changeIds.has(change.id)) errors.push(`${change.id}: duplicate source change`);
    changeIds.add(change.id);
    if (!statusIds.has(change.sourceId) || !["content", "upstream", "availability"].includes(change.kind) || !["pending", "reviewed"].includes(change.review) || !timestamp(change.date) || !absoluteHttps(change.sourceUrl)) errors.push(`${change.id}: invalid source change`);
    if (typeof change.before !== "string" || typeof change.after !== "string" || !change.diff || !Array.isArray(change.diff.added) || !Array.isArray(change.diff.removed)) errors.push(`${change.id}: substantive before/after evidence is required`);
    references(change);
  }
  const repoIds = new Set();
  for (const repo of snapshot.repos) {
    if (repoIds.has(repo.id)) errors.push(`${repo.id}: duplicate tracked repository`);
    repoIds.add(repo.id);
    if (repo.recordId && !recordIds.has(repo.recordId)) errors.push(`${repo.id}: repository points at an unknown record`);
    if (!absoluteHttps(repo.url) || (repo.headSha !== null && !/^[a-f0-9]{40}$/.test(repo.headSha)) || typeof repo.stale !== "boolean") errors.push(`${repo.id}: invalid repository metadata`);
  }
  const digest = snapshot.digest;
  if (!digest || !timestamp(digest.generatedAt) || !timestamp(digest.from) || !timestamp(digest.to)) errors.push("Discovery digest requires its real date range");
  else {
    if (!Array.isArray(digest.addedIds) || digest.addedIds.some((id) => !itemIds.has(id))) errors.push("Digest refers to unknown discoveries");
    if (!Array.isArray(digest.changeIds) || digest.changeIds.some((id) => !changeIds.has(id))) errors.push("Digest refers to unknown source changes");
    if (!Array.isArray(digest.blockedSourceIds) || digest.blockedSourceIds.some((id) => !statusIds.has(id))) errors.push("Digest refers to unknown blocked sources");
  }
  return errors;
}
