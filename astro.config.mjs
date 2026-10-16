import { defineConfig } from "astro/config";

const site = process.env.SITE_URL?.trim();
const configuredBase = process.env.BASE_PATH?.trim() || "/";
if (site && (!/^https?:\/\//i.test(site) || !URL.canParse(site))) {
  throw new Error("SITE_URL must be an absolute http(s) URL");
}
if (!configuredBase.startsWith("/") || /[?#]/.test(configuredBase)) {
  throw new Error(
    "BASE_PATH must be a root-relative path, such as / or /repo/",
  );
}
const base = configuredBase.replace(/\/+$/, "") || "/";

export default defineConfig({
  ...(site ? { site } : {}),
  base,
  output: "static",
  trailingSlash: "never",
  vite: { server: { fs: { strict: true } } },
});
