const base = `/${import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, "")}`.replace(
  /^\/$/,
  "",
);

/** Prefix an internal root-relative URL with the configured Astro base path. */
export function withBase(path: string): string {
  if (
    path.startsWith("#") ||
    path.startsWith("?") ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)
  )
    return path;
  if (!path.startsWith("/"))
    throw new TypeError("withBase expects a root-relative path");
  if (!base) return path;
  return `${base}${path}`;
}

const configuredRepository = import.meta.env.PUBLIC_REPOSITORY;
const validRepository = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/[a-z\d_.-]+$/i;
export const repositoryUrl: string | undefined =
  configuredRepository &&
  validRepository.test(configuredRepository) &&
  ![".", ".."].includes(configuredRepository.split("/")[1])
    ? `https://github.com/${configuredRepository}`
    : undefined;
export const repositoryBranch: string =
  import.meta.env.PUBLIC_REPOSITORY_BRANCH || "main";

/** Return a real repository edit URL, or nothing when this build has no repository. */
export function editUrl(file: string): string | undefined {
  if (!repositoryUrl) return undefined;
  const segments = file.split("/");
  if (
    !segments.length ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return undefined;
  return `${repositoryUrl}/edit/${encodeURIComponent(repositoryBranch)}/${segments.map(encodeURIComponent).join("/")}`;
}
