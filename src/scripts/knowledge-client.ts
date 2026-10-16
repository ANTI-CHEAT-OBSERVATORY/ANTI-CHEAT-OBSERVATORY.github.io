import { withBase } from "../lib/paths";
import type { KnowledgeDataset } from "../lib/knowledge-types";
import type { DiscoverySnapshot } from "../lib/discovery";

let knowledge: Promise<KnowledgeDataset> | undefined;
let discovery: Promise<DiscoverySnapshot> | undefined;
async function dataset<T extends { schemaVersion: string }>(path: string): Promise<T> {
  const response = await fetch(withBase(path));
  if (!response.ok) throw new Error(`Research data unavailable (HTTP ${response.status})`);
  const value = await response.json() as T;
  if (value.schemaVersion !== "2.0.0") throw new Error("Unsupported research dataset version; reload the published site.");
  return value;
}
/** Content stays in the validated static JSON export, not duplicated in every browser bundle. */
export function loadKnowledge(): Promise<KnowledgeDataset> {
  return knowledge ??= dataset<KnowledgeDataset>("/api/v2/knowledge.json").catch((error) => { knowledge = undefined; throw error; });
}
export function loadDiscovery(): Promise<DiscoverySnapshot> {
  return discovery ??= dataset<DiscoverySnapshot>("/api/v2/discovery.json").catch((error) => { discovery = undefined; throw error; });
}
