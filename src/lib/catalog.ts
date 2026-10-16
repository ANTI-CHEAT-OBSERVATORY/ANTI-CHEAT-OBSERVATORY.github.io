import { recordKinds, type CatalogRecord, type RecordKind } from "./knowledge-types";

export { recordKinds } from "./knowledge-types";
const modules = import.meta.glob<{ default: CatalogRecord }>("../data/records/*.json", { eager: true });
export const records: CatalogRecord[] = Object.values(modules)
  .map((module) => module.default)
  .sort((a, b) => recordKinds.indexOf(a.kind) - recordKinds.indexOf(b.kind) || a.title.localeCompare(b.title));
const recordIndex = new Map(records.map((record) => [record.id, record]));
export const kindLabels: Record<RecordKind, string> = {
  product: "Systems", component: "Components", technique: "Techniques", finding: "Findings", project: "Projects",
};
export const kindNames: Record<RecordKind, string> = {
  product: "System dossier", component: "Component", technique: "Technique", finding: "Finding", project: "Research project",
};
export const countKind = (kind: RecordKind) => records.filter((record) => record.kind === kind).length;
export const recordById = (id: string) => recordIndex.get(id);
export const recordsByIds = (ids: string[]) => ids.flatMap((id) => recordIndex.has(id) ? [recordIndex.get(id)!] : []);
export const products = () => records.filter((record) => record.kind === "product");
/** Editorial browsing links are not evidence of implementation or architectural edges. */
export function relatedTo(id: string, kind: RecordKind): CatalogRecord[] {
  const origin = recordIndex.get(id);
  return records.filter((record) => record.kind === kind && (record.relatedIds.includes(id) || origin?.relatedIds.includes(record.id)));
}
export const componentsForProduct = (id: string) => relatedTo(id, "component");
export const projectsForProduct = (id: string) => relatedTo(id, "project");
export function recordsForProduct(id: string): CatalogRecord[] {
  const origin = recordIndex.get(id);
  return records.filter((record) => record.id !== id && record.kind !== "product" && (origin?.relatedIds.includes(record.id) || record.relatedIds.includes(id)));
}
export const sectionId = (title: string, index: number) => `section-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
export const dataset = () => ({ schemaVersion: "2.0.0", name: "Anti-Cheat Observatory", description: "Version-scoped research records. Evidence and claim states are separate from independent reproduction.", records });
export const csv = () => {
  const fields = ["id", "kind", "title", "vendor", "historical", "updated", "platforms", "layers", "filenames", "cves", "buildIds", "mechanismIds", "sourceIds", "repoUrl", "reviewedCommit", "summary"] as const;
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [fields.map(cell).join(","), ...records.map((record) => fields.map((field) => cell(Array.isArray(record[field]) ? (record[field] as string[]).join(" | ") : record[field])).join(","))].join("\r\n");
};
