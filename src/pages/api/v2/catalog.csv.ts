import type { APIRoute } from "astro";
import { csv } from "../../../lib/catalog";

export const GET: APIRoute = () =>
  new Response("\uFEFF" + csv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8" },
  });
