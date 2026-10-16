import type { APIRoute } from "astro";
import { discovery } from "../../../lib/discovery";

/** Collected external metadata only: it records what exists and what changed, never a reviewed verdict. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(discovery, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
