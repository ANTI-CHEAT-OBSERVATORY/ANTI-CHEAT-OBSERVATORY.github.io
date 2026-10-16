export const provenanceKinds = ["vendor", "publication", "repository", "community", "academic", "disclosure", "unverified"] as const;
export type Provenance = (typeof provenanceKinds)[number];
export const reviewActivities = ["collected", "source-inspected", "artifact-inspected", "behavior-reproduced"] as const;
export type ReviewActivity = (typeof reviewActivities)[number];
export const claimStates = ["asserted", "corroborated", "disputed", "refuted", "superseded"] as const;
export type ClaimState = (typeof claimStates)[number];
export interface KnowledgeSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  author?: string;
  published?: string;
  accessed: string;
  provenance: Provenance;
  revision: { kind: "git" | "publication" | "unversioned"; value: string | null };
  access: "available" | "blocked" | "not-retrieved";
  transport: "direct" | "mirror" | "index-only";
  retrievalUrl?: string;
  originId: string;
  rights: string;
  limitations: string[];
}
export interface Citation {
  sourceId: string;
  relation: "supports" | "contradicts" | "context";
  locator: {
    kind: "document" | "section" | "function" | "line" | "timestamp";
    value: string;
    url?: string;
    addressSpace?: string;
    imageBase?: string;
  };
  evidence: string;
}
export interface Claim {
  id: string;
  statement: string;
  recordIds: string[];
  postIds: string[];
  systemIds: string[];
  buildIds: string[];
  mechanismIds: string[];
  kind: "observation" | "inference" | "guidance" | "unknown";
  provenance: Provenance;
  review: ReviewActivity;
  state: ClaimState;
  applicability: string;
  citations: Citation[];
  limitations: string[];
  reviewedAt: string;
  validationIds: string[];
  contradicts: string[];
  supersedes: string[];
}
export interface ClaimSection { title: string; claimIds: string[] }
export const recordKinds = ["product", "component", "technique", "finding", "project"] as const;
export type RecordKind = (typeof recordKinds)[number];
export interface CatalogRecord {
  id: string;
  kind: RecordKind;
  title: string;
  summary: string;
  vendor: string;
  platforms: string[];
  layers: string[];
  historical: boolean;
  updated: string;
  tags: string[];
  relatedIds: string[];
  sourceIds: string[];
  buildIds: string[];
  mechanismIds: string[];
  sections: ClaimSection[];
  aliases?: string[];
  games?: string[];
  filenames?: string[];
  cves?: string[];
  affectedVersions?: string;
  remediation?: string;
  repoUrl?: string;
  repoLicense?: string;
  repoLanguage?: string;
  reviewedCommit?: string;
}
export const postCategories = ["Reverse engineering", "Kernel research", "Virtualization", "Community notes", "Research methods"] as const;
export interface ResearchPost {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  category: (typeof postCategories)[number];
  author: "Observatory editorial";
  productIds: string[];
  relatedIds: string[];
  tags: string[];
  takeaways: string[];
  sourceIds: string[];
  sections: ClaimSection[];
}
export interface BuildSample {
  id: string;
  label: string;
  recordIds: string[];
  systemIds: string[];
  platform: string;
  version: string | null;
  hashes: { algorithm: "sha256"; value: string; origin: "source-reported" | "project-computed"; sourceId?: string; validationId?: string }[];
  sourceIds: string[];
  acquiredAt: string | null;
  limitations: string[];
}
export const worksheetTopics = ["trigger", "context", "inputs", "outputs", "conditions", "protected-object", "primitives", "dependencies", "validation", "counterexamples"] as const;
export interface Mechanism {
  id: string;
  title: string;
  summary: string;
  systemIds: string[];
  recordIds: string[];
  buildIds: string[];
  claimIds: string[];
  worksheet: { topic: (typeof worksheetTopics)[number]; claimIds: string[]; unknown: string | null }[];
  unknowns: string[];
}
export interface ValidationRecord {
  id: string;
  title: string;
  claimIds: string[];
  buildId: string | null;
  activity: Exclude<ReviewActivity, "collected">;
  performedBy: "source-author" | "independent-researcher" | "observatory";
  authority: "reported" | "observed";
  status: "reported" | "pass" | "fail" | "inconclusive";
  authorized: boolean;
  environment: string;
  tools: string;
  inputs: string;
  expected: string;
  observed: string;
  bounds: string;
  sourceIds: string[];
  executedAt: string | null;
  reviewedAt: string;
  limitations: string[];
}
export interface EvidenceRelationship {
  id: string;
  fromId: string;
  toId: string;
  type: "contains" | "implements" | "examines" | "supports" | "contradicts" | "uses" | "depends-on";
  claimIds: string[];
  description: string;
}
export interface Correction {
  id: string;
  date: string;
  title: string;
  summary: string;
  recordIds: string[];
  claimIds: string[];
  sourceIds: string[];
  kind: "correction" | "dispute" | "superseded" | "disclosure";
  before: string;
  after: string;
  status: "open" | "resolved" | "informational";
  resolutionEvidenceIds: string[];
}
export const dossierAspects = ["deployment", "components", "interfaces", "mechanisms", "protection", "findings", "research", "history"] as const;
export interface Dossier {
  systemId: string;
  aspects: { id: (typeof dossierAspects)[number]; status: "documented" | "partial" | "unknown"; claimIds: string[]; questions: string[] }[];
  priorities: string[];
}
export interface KnowledgeDataset {
  schemaVersion: "2.0.0";
  records: CatalogRecord[];
  posts: ResearchPost[];
  sources: KnowledgeSource[];
  claims: Claim[];
  builds: BuildSample[];
  mechanisms: Mechanism[];
  validations: ValidationRecord[];
  relationships: EvidenceRelationship[];
  corrections: Correction[];
  dossiers: Dossier[];
}
export type KnowledgeProposal = Partial<Omit<KnowledgeDataset, "schemaVersion">> & { schemaVersion: "2.0.0" };
