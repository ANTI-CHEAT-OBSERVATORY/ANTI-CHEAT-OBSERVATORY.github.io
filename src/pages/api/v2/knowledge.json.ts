import type { APIRoute } from "astro";
import { knowledgeDataset } from "../../../lib/knowledge";

/** Complete normalized evidence model: records, claims, sources, builds, mechanisms, validations, relationships, corrections, dossiers. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(knowledgeDataset(), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
