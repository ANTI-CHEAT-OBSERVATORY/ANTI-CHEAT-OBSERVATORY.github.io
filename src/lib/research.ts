import type { ResearchPost } from "./knowledge-types";
import outletData from "../data/research-sources.json";
export { postCategories } from "./knowledge-types";
export const sourceTypes = ["Independent research", "Community forum", "Vendor documentation", "Academic"] as const;
export type SourceType = (typeof sourceTypes)[number];
export interface ResearchOutlet {
  id: string; name: string; url: string; type: SourceType; description: string;
  access: "Public" | "Partially accessible"; limitation: string; topics: string[];
}
const modules = import.meta.glob<{ default: ResearchPost }>("../data/posts/*.json", { eager: true });
export const posts: ResearchPost[] = Object.values(modules).map((module) => module.default).sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
export const outlets: ResearchOutlet[] = outletData as ResearchOutlet[];
export const postsForRecord = (id: string) => posts.filter((post) => post.productIds.includes(id) || post.relatedIds.includes(id));
