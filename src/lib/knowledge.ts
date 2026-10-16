import sourceData from "../data/knowledge/sources.json";
import claimData from "../data/knowledge/claims.json";
import buildData from "../data/knowledge/builds.json";
import mechanismData from "../data/knowledge/mechanisms.json";
import relationshipData from "../data/knowledge/relationships.json";
import correctionData from "../data/knowledge/corrections.json";
import dossierData from "../data/knowledge/dossiers.json";
import { records, products, recordById } from "./catalog";
import { posts } from "./research";
import type { KnowledgeSource, Claim, BuildSample, Mechanism, EvidenceRelationship, Correction, Dossier, ValidationRecord, KnowledgeDataset } from "./knowledge-types";

export const sources = sourceData as KnowledgeSource[];
export const claims = claimData as Claim[];
export const builds = buildData as BuildSample[];
export const mechanisms = mechanismData as Mechanism[];
export const relationships = relationshipData as EvidenceRelationship[];
export const corrections = (correctionData as Correction[]).slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
export const dossiers = dossierData as Dossier[];
const validationModules = import.meta.glob<{ default: ValidationRecord }>("../data/knowledge/validations/*.json", { eager: true });
export const validations: ValidationRecord[] = Object.values(validationModules).map((module) => module.default).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || a.id.localeCompare(b.id));
const sourceIndex = new Map(sources.map((source) => [source.id, source]));
const claimIndex = new Map(claims.map((claim) => [claim.id, claim]));
const buildIndex = new Map(builds.map((build) => [build.id, build]));
const mechanismIndex = new Map(mechanisms.map((mechanism) => [mechanism.id, mechanism]));
export const sourceById = (id: string) => sourceIndex.get(id);
export const claimById = (id: string) => claimIndex.get(id);
export const buildById = (id: string) => buildIndex.get(id);
export const mechanismById = (id: string) => mechanismIndex.get(id);
export const claimsByIds = (ids: string[]) => ids.flatMap((id) => claimIndex.has(id) ? [claimIndex.get(id)!] : []);
export const sourcesByIds = (ids: string[]) => ids.flatMap((id) => sourceIndex.has(id) ? [sourceIndex.get(id)!] : []);
export const claimsForRecord = (id: string) => claims.filter((claim) => claim.recordIds.includes(id));
export const claimsForPost = (id: string) => claims.filter((claim) => claim.postIds.includes(id));
export const sourcesForRecord = (id: string) => sourcesByIds(recordById(id)?.sourceIds ?? []);
export const sourcesForPost = (id: string) => sourcesByIds(posts.find((post) => post.id === id)?.sourceIds ?? []);
export const claimsForSystem = (id: string) => claims.filter((claim) => claim.systemIds.includes(id));
export const buildsForSystem = (id: string) => builds.filter((build) => build.systemIds.includes(id));
export const mechanismsForSystem = (id: string) => mechanisms.filter((mechanism) => mechanism.systemIds.includes(id));
export const dossierForSystem = (id: string) => dossiers.find((dossier) => dossier.systemId === id);
export const correctionsForRecord = (id: string) => {
  const ids = new Set(claimsForRecord(id).map((claim) => claim.id));
  return corrections.filter((correction) => correction.recordIds.includes(id) || correction.claimIds.some((claimId) => ids.has(claimId)));
};
export const relationshipsFor = (id: string) => relationships.filter((relationship) => relationship.fromId === id || relationship.toId === id);
export const validationsForClaim = (id: string) => validations.filter((validation) => validation.claimIds.includes(id));
export const systemsForRecord = (id: string) => {
  const record = recordById(id);
  const scopedIds = new Set(claimsForRecord(id).flatMap((claim) => claim.systemIds));
  return products().filter((product) => product.id === id || scopedIds.has(product.id) || record?.relatedIds.includes(product.id) || product.relatedIds.includes(id));
};
export function knowledgeDataset(): KnowledgeDataset {
  return { schemaVersion: "2.0.0", records, posts, sources, claims, builds, mechanisms, validations, relationships, corrections, dossiers };
}
