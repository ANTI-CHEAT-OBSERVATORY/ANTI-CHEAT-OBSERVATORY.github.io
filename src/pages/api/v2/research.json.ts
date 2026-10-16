import type { APIRoute } from "astro";
import { posts } from "../../../lib/research";
import { claimsForPost, sourcesForPost } from "../../../lib/knowledge";
import { outlets } from "../../../lib/research";

/** Editorial notes with their linked normalized sources and claims, plus the publication directory. */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify(
      {
        schemaVersion: "2.0.0",
        description:
          "Observatory editorial synthesis of attributed public research. Post sections reference scoped claims; claim evidence and limitations live in the knowledge dataset.",
        posts,
        sources: [...new Map(posts.flatMap((post) => sourcesForPost(post.id)).map((source) => [source.id, source])).values()],
        claims: [...new Map(posts.flatMap((post) => claimsForPost(post.id)).map((claim) => [claim.id, claim])).values()],
        publications: outlets,
      },
      null,
      2,
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
