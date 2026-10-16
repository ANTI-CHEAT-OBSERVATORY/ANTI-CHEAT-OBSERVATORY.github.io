import { withBase } from "../lib/paths";

interface PagefindPage { url: string; excerpt?: string; meta?: { title?: string }; }
interface PagefindResult { data(): Promise<PagefindPage> }
interface PagefindResponse { results: PagefindResult[]; unfilteredResultCount?: number }
interface PagefindModule {
  options(options: { baseUrl: string; basePath: string; noWorker: boolean }): Promise<void>;
  search(query: string, options?: { filters?: Record<string, string> }): Promise<PagefindResponse>;
}
const form = document.querySelector<HTMLFormElement>("#catalog-filters");
if (form) {
  const search = form.querySelector<HTMLInputElement>("#catalog-search")!;
  const selects = [...form.querySelectorAll<HTMLSelectElement>("select")];
  const rows = [...document.querySelectorAll<HTMLTableRowElement>("tr[data-record]")];
  const count = document.querySelector<HTMLElement>("#results-count")!;
  const empty = document.querySelector<HTMLElement>("#empty-state")!;
  const fulltext = document.querySelector<HTMLElement>("#fulltext-results")!;
  const status = document.querySelector<HTMLElement>("#fulltext-status")!;
  const results = document.querySelector<HTMLOListElement>("#fulltext-list")!;
  const more = document.querySelector<HTMLButtonElement>("#fulltext-more")!;
  let index: Promise<PagefindModule> | undefined;
  let revision = 0;
  let timer: number | undefined;
  let found: PagefindResult[] = [];
  let shown = 0;
  const pagefindPath = withBase("/pagefind/pagefind.js");
  function updateUrl() {
    const parameters = new URLSearchParams();
    if (search.value.trim()) parameters.set("q", search.value.trim());
    for (const select of selects) if (select.value) parameters.set(select.name, select.value);
    history.replaceState(null, "", `${location.pathname}${parameters.size ? `?${parameters}` : ""}${location.hash}`);
  }
  function filterRows() {
    const selection = Object.fromEntries(selects.map((element) => [element.name, element.value]));
    const tokens = search.value.trim().normalize("NFKC").toLocaleLowerCase("en").split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const row of rows) {
      const matches = (!selection.kind || row.dataset.kind === selection.kind) &&
        (!selection.vendor || row.dataset.vendor === selection.vendor) &&
        (!selection.platform || (JSON.parse(row.dataset.platforms ?? "[]") as string[]).includes(selection.platform)) &&
        (!selection.layer || (JSON.parse(row.dataset.layers ?? "[]") as string[]).includes(selection.layer)) &&
        (!selection.historical || row.dataset.historical === String(selection.historical === "yes")) &&
        (!selection.state || (JSON.parse(row.dataset.states ?? "[]") as string[]).includes(selection.state)) &&
        tokens.every((token) => row.dataset.search?.includes(token));
      row.hidden = !matches;
      if (matches) visible++;
    }
    count.textContent = `Showing ${visible} of ${rows.length} records${tokens.length ? " in the metadata table" : ""}`;
    empty.hidden = visible !== 0;
  }
  async function showMore(current: number) {
    const next = found.slice(shown, shown + 12);
    const resolved = await Promise.allSettled(next.map((item) => item.data()));
    if (revision !== current) return;
    for (const entry of resolved) {
      if (entry.status === "rejected") { status.textContent = "Some indexed matches could not be loaded; try another search."; continue; }
      const page = entry.value;
      let url: URL;
      try { url = new URL(page.url, location.href); } catch { continue; }
      if (url.origin !== location.origin) continue;
      if (!url.pathname.startsWith(withBase("/"))) {
        if (!page.url.startsWith("/")) continue;
        url = new URL(`${withBase(url.pathname)}${url.search}${url.hash}`, location.origin);
      }
      if (url.pathname !== withBase("/")) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      const li = document.createElement("li");
      li.className = "panel";
      const link = document.createElement("a");
      link.href = url.href;
      link.textContent = page.meta?.title || url.pathname.split("/").filter(Boolean).pop() || "Indexed page";
      const excerpt = document.createElement("p");
      excerpt.className = "muted small";
      // Pagefind excerpts contain <mark> markup. Parse into inert DOM and use text only.
      excerpt.textContent = new DOMParser().parseFromString(page.excerpt ?? "", "text/html").body.textContent ?? "";
      li.append(link, excerpt);
      results.append(li);
    }
    shown += next.length;
    more.hidden = shown >= found.length;
    if (!results.children.length && shown >= found.length) status.textContent = "No readable indexed results for this search.";
  }
  async function queryIndex() {
    const current = ++revision;
    const query = search.value.trim();
    fulltext.hidden = !query;
    results.replaceChildren();
    more.hidden = true;
    shown = 0;
    found = [];
    if (!query) { status.textContent = ""; return; }
    status.textContent = "Searching the static full-text index…";
    try {
      // Pagefind is generated after Astro's build, not bundled by Vite.
      index ??= (import(/* @vite-ignore */ pagefindPath) as Promise<PagefindModule>).then(async (module) => {
        // Pagefind's relative metadata URLs fail in the observed blob-worker context.
        // Its supported main-thread mode uses the same generated WASM index.
        await module.options({ noWorker: true, baseUrl: withBase("/"), basePath: new URL(withBase("/pagefind/"), location.origin).href });
        return module;
      });
      const pagefind = await index;
      const selection = Object.fromEntries(selects.map((element) => [element.name, element.value]));
      const filters = Object.fromEntries(Object.entries(selection).filter(([, value]) => value));
      const response = await pagefind.search(query, Object.keys(filters).length ? { filters } : undefined);
      if (current !== revision) return;
      found = response.results;
      status.textContent = `${found.length} indexed ${found.length === 1 ? "page" : "pages"} match this search${Object.keys(filters).length ? " and filters" : ""}.`;
      if (found.length) await showMore(current);
    } catch (cause) {
      if (current !== revision) return;
      index = undefined;
      status.textContent = `Full-text index unavailable. ${cause instanceof Error ? cause.message : "Could not load Pagefind."} Metadata filtering above still works.`;
    }
  }
  function refresh(writeUrl = true) {
    filterRows();
    if (writeUrl) updateUrl();
    clearTimeout(timer);
    timer = setTimeout(() => { void queryIndex(); }, 200);
  }
  function readUrl() {
    const parameters = new URLSearchParams(location.search);
    search.value = parameters.get("q") ?? "";
    for (const select of selects) {
      const value = parameters.get(select.name) ?? "";
      select.value = [...select.options].some((option) => option.value === value) ? value : "";
    }
    refresh(false);
  }
  search.addEventListener("input", () => refresh());
  form.addEventListener("change", () => refresh());
  form.addEventListener("submit", (event) => { event.preventDefault(); refresh(); fulltext.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
  document.querySelector("#reset-filters")?.addEventListener("click", () => { form.reset(); refresh(); });
  more.addEventListener("click", () => { void showMore(revision); });
  window.addEventListener("popstate", readUrl);
  readUrl();
}
