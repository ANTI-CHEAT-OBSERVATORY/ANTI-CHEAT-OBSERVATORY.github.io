import type { APIRoute } from "astro";
import { dataset } from "../../../lib/catalog";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(dataset(), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
