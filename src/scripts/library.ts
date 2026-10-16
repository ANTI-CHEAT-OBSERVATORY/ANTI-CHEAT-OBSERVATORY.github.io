import { loadKnowledge, loadDiscovery } from "./knowledge-client";
import { withBase } from "../lib/paths";
import type { Correction } from "../lib/knowledge-types";
import type { SourceChange } from "../lib/discovery";

type BookmarkType = "record" | "claim" | "source" | "mechanism";
type Bookmark = { type: BookmarkType; id: string; title: string; url: string };
type SavedQuery = { name: string; url: string };
type Watch = { id: string; title: string };
type Library = { schemaVersion: "1.0.0"; bookmarks: Bookmark[]; queries: SavedQuery[]; watches: Watch[] };
const key = "aco-library-v1";
const empty = (): Library => ({ schemaVersion: "1.0.0", bookmarks: [], queries: [], watches: [] });
const known: Record<BookmarkType, Map<string, { title: string; url: string }>> = {
  record: new Map(), claim: new Map(), source: new Map(), mechanism: new Map(),
};
const watchable = new Map<string, string>();
const claimsByEntity = new Map<string, Set<string>>();
let corrections: Correction[] = [];
let discoveryChanges: SourceChange[] = [];
let loaded: Promise<void> | undefined;
function loadCatalog(): Promise<void> {
  if (!loaded) loaded = Promise.all([loadKnowledge(), loadDiscovery()]).then(([knowledge, discovery]) => {
    for (const item of knowledge.records) { known.record.set(item.id, { title: item.title, url: withBase(`/records/${item.id}`) }); watchable.set(item.id, item.title); }
    const originSources = new Map<string, string[]>(), sourceOrigins = new Map<string, string>();
    for (const item of knowledge.sources) {
      known.source.set(item.id, { title: item.title, url: withBase(`/sources/${item.id}`) }); watchable.set(item.id, item.title);
      sourceOrigins.set(item.id, item.originId);
      const group = originSources.get(item.originId) ?? []; group.push(item.id); originSources.set(item.originId, group);
    }
    for (const item of knowledge.claims) {
      const label = item.statement.length > 300 ? `${item.statement.slice(0, 299)}…` : item.statement;
      known.claim.set(item.id, { title: label, url: withBase(`/claims/${item.id}`) }); watchable.set(item.id, label);
      const scope = new Set([...item.systemIds, ...item.recordIds, ...item.citations.flatMap((citation) => originSources.get(sourceOrigins.get(citation.sourceId) ?? "") ?? [citation.sourceId])]);
      for (const id of scope) {
        if (!claimsByEntity.has(id)) claimsByEntity.set(id, new Set());
        claimsByEntity.get(id)!.add(item.id);
      }
    }
    for (const item of knowledge.mechanisms) known.mechanism.set(item.id, { title: item.title, url: withBase(`/mechanisms/${item.id}`) });
    corrections = knowledge.corrections; discoveryChanges = discovery.changes;
  }).catch((error) => { loaded = undefined; throw error; });
  return loaded;
}
function safeQuery(url: string): boolean {
  if (typeof url !== "string" || url.length > 2048 || /[\u0000-\u001f\\]/.test(url) || url.includes("#")) return false;
  try {
    const parsed = new URL(url, location.origin);
    const base = withBase("/");
    return parsed.origin === location.origin && url.startsWith(base) && parsed.pathname.startsWith(base) && !parsed.pathname.includes("..") && ["/", "/catalog", "/research", "/projects", "/feed", "/compare", "/relationships", "/library"].some((route) => parsed.pathname === withBase(route) || parsed.pathname === `${withBase(route).replace(/\/$/, "")}/`);
  } catch { return false; }
}
function parseLibrary(input: unknown): Library {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Expected a library object.");
  const data = input as Record<string, unknown>;
  if (data.schemaVersion !== "1.0.0" || !Array.isArray(data.bookmarks) || !Array.isArray(data.queries) || !Array.isArray(data.watches)) throw Error("Unsupported or incomplete library schema version.");
  if (data.bookmarks.length > 500 || data.queries.length > 200 || data.watches.length > 500) throw Error("Backup exceeds local library limits.");
  const seen = new Set<string>();
  for (const item of data.bookmarks) {
    if (!item || typeof item !== "object" || !Object.hasOwn(known, item.type)) throw Error("Unknown bookmark type.");
    const entry = known[item.type as BookmarkType].get(item.id);
    if (!entry || item.url !== entry.url || typeof item.title !== "string" || !item.title.trim() || item.title.length > 300 || seen.has(`${item.type}:${item.id}`)) throw Error("Bookmark has an unknown ID, invalid local URL or duplicate entry.");
    seen.add(`${item.type}:${item.id}`);
  }
  seen.clear();
  for (const item of data.queries) {
    if (!item || typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 || !safeQuery(item.url) || seen.has(item.url)) throw Error("Saved query has an invalid name, URL or duplicate entry.");
    seen.add(item.url);
  }
  seen.clear();
  for (const item of data.watches) {
    if (!item || !watchable.has(item.id) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 300 || seen.has(item.id)) throw Error("Watch has an unknown ID or duplicate entry.");
    seen.add(item.id);
  }
  return input as Library;
}
let available = false;
let library = empty();
let stored: string | null = null;
try {
  const probe = `${key}-probe`;
  localStorage.setItem(probe, "ok"); localStorage.removeItem(probe);
  stored = localStorage.getItem(key);
  available = true;
} catch (error) { console.warn("Local library storage unavailable:", error); }
const startup = available && (stored || document.querySelector("#library-watches"))
  ? loadCatalog().then(() => { if (stored) library = parseLibrary(JSON.parse(stored)); })
    .catch((error) => { available = false; console.warn("Local library unavailable or invalid:", error); })
  : Promise.resolve();
function status(message: string) { const node = document.querySelector<HTMLElement>("#library-status"); if (node) node.textContent = message; }
function persist() {
  if (!available) { status("Browser storage is denied or unavailable. Nothing was saved; enable site storage to use the library."); return false; }
  try { localStorage.setItem(key, JSON.stringify(library)); render(); return true; }
  catch { available = false; status("Browser storage failed (possibly quota or policy). Changes were not saved."); return false; }
}
function buttonState() {
  for (const element of document.querySelectorAll<HTMLButtonElement>("[data-bookmark-id], [data-watch-id]")) {
    const id = element.dataset.bookmarkId ?? element.dataset.watchId!;
    const pressed = element.dataset.bookmarkId ? library.bookmarks.some((item) => item.id === id && item.type === element.dataset.bookmarkType) : library.watches.some((item) => item.id === id);
    element.setAttribute("aria-pressed", String(available && pressed));
    element.textContent = element.dataset.bookmarkId ? (pressed && available ? "Saved · remove" : "Save to library") : (pressed && available ? "Watching · remove" : "Watch for changes");
    element.disabled = !available;
    if (!available) element.title = "Browser storage unavailable; saving disabled";
  }
}
function action(label: string, actionName: string, index: number): HTMLButtonElement {
  const button = document.createElement("button"); button.type = "button"; button.dataset.libraryAction = actionName; button.dataset.libraryIndex = String(index); button.textContent = label; return button;
}
function listItem(title: string, url?: string) {
  const item = document.createElement("li");
  if (url) { const anchor = document.createElement("a"); anchor.href = url; anchor.textContent = title; item.append(anchor); }
  else item.append(document.createTextNode(title));
  return item;
}
function render() {
  buttonState();
  const bookmarks = document.querySelector("#library-bookmarks"); const queries = document.querySelector("#library-queries"); const watches = document.querySelector("#library-watches");
  if (!bookmarks || !queries || !watches) return;
  const bookmarkList = document.createElement("ul");
  for (const [index, item] of library.bookmarks.entries()) { const row = listItem(`${item.title} (${item.type})`, item.url); row.append(action("Rename", "rename-bookmark", index), action("Remove", "remove-bookmark", index)); bookmarkList.append(row); }
  bookmarks.replaceChildren(bookmarkList); if (!library.bookmarks.length) bookmarks.textContent = "No saved research yet.";
  const queryList = document.createElement("ul");
  for (const [index, item] of library.queries.entries()) { const row = listItem(item.name, item.url); row.append(action("Rename", "rename-query", index), action("Remove", "remove-query", index)); queryList.append(row); }
  queries.replaceChildren(queryList); if (!library.queries.length) queries.textContent = "No saved queries.";
  const watchList = document.createElement("ul");
  for (const [index, item] of library.watches.entries()) {
    const row = listItem(item.title); row.append(action("Rename", "rename-watch", index), action("Remove watch", "remove-watch", index));
    const watchedClaims = claimsByEntity.get(item.id);
    const matched = corrections.filter((event) => event.recordIds.includes(item.id) || event.claimIds.includes(item.id) || event.sourceIds.includes(item.id) || event.claimIds.some((id) => watchedClaims?.has(id)));
    const changes = discoveryChanges.filter((change) => change.sourceId === item.id || change.recordIds.includes(item.id) || change.claimIds.includes(item.id) || change.claimIds.some((id) => watchedClaims?.has(id)));
    const events = document.createElement("ul");
    for (const event of matched) { const li = listItem(`${event.date} · ${event.kind}: ${event.title}`); for (const id of event.claimIds) { const a = document.createElement("a"); a.href = withBase(`/claims/${id}`); a.textContent = ` Claim ${id}`; li.append(a); } events.append(li); }
    for (const change of changes) { const li = listItem(`${change.date} · source ${change.kind}: ${change.summary}`); const a = document.createElement("a"); a.href = withBase("/feed"); a.textContent = " Review source change"; li.append(a); events.append(li); }
    if (!matched.length && !changes.length) events.append(listItem("No published correction or source change currently matches this ID; no live notifications."));
    row.append(events); watchList.append(row);
  }
  watches.replaceChildren(watchList); if (!library.watches.length) watches.textContent = "No watched entities.";
  status(available ? "Stored only in this browser. Watches match published corrections and discovery source changes; they do not send notifications." : "Browser storage denied or invalid: saving and importing are disabled. Existing research remains readable.");
  const exportButton = document.querySelector<HTMLButtonElement>("#library-export"); if (exportButton) exportButton.disabled = !available;
  const input = document.querySelector<HTMLInputElement>("#library-import"); if (input) input.disabled = !available;
}
document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-bookmark-id],button[data-watch-id],button[data-save-query],button[data-library-action]");
  if (!button) return;
  await startup;
  if (!available) { status("Storage unavailable; nothing was saved."); return; }
  try { await loadCatalog(); } catch { status("Published knowledge is unavailable; cannot verify saved IDs. Nothing was saved."); return; }
  if (!available) { status("Storage unavailable; nothing was saved."); return; }
  const id = button.dataset.bookmarkId;
  if (id) {
    const type = button.dataset.bookmarkType as BookmarkType;
    const knownItem = known[type]?.get(id);
    if (!knownItem || button.dataset.bookmarkUrl !== knownItem.url) return;
    const index = library.bookmarks.findIndex((item) => item.id === id && item.type === type);
    if (index < 0) library.bookmarks.push({ type, id, title: knownItem.title, url: knownItem.url }); else library.bookmarks.splice(index, 1);
    persist(); return;
  }
  const watch = button.dataset.watchId;
  if (watch) { if (!watchable.has(watch)) return; const index = library.watches.findIndex((item) => item.id === watch); if (index < 0) library.watches.push({ id: watch, title: watchable.get(watch)! }); else library.watches.splice(index, 1); persist(); return; }
  if (button.hasAttribute("data-save-query")) {
    const url = `${location.pathname}${location.search}`;
    if (!safeQuery(url)) { status("Current URL cannot be saved as a local query."); return; }
    const name = prompt("Name this saved query:"); if (!name) return;
    if (!name.trim() || name.length > 120 || library.queries.some((item) => item.url === url)) { status("Choose a nonempty name under 121 characters and a URL not already saved."); return; }
    library.queries.push({ name: name.trim(), url }); persist(); return;
  }
  const index = Number(button.dataset.libraryIndex);
  if (!Number.isInteger(index) || index < 0) return;
  if (button.dataset.libraryAction === "remove-bookmark" && library.bookmarks[index]) library.bookmarks.splice(index, 1);
  if (button.dataset.libraryAction === "remove-query" && library.queries[index]) library.queries.splice(index, 1);
  if (button.dataset.libraryAction === "remove-watch" && library.watches[index]) library.watches.splice(index, 1);
  if (button.dataset.libraryAction === "rename-bookmark" && library.bookmarks[index]) { const title = prompt("New local bookmark label:", library.bookmarks[index].title); if (title === null) return; if (!title.trim() || title.length > 300) { status("Bookmark label must be nonempty and at most 300 characters."); return; } library.bookmarks[index].title = title.trim(); }
  if (button.dataset.libraryAction === "rename-watch" && library.watches[index]) { const title = prompt("New local watch label:", library.watches[index].title); if (title === null) return; if (!title.trim() || title.length > 300) { status("Watch label must be nonempty and at most 300 characters."); return; } library.watches[index].title = title.trim(); }
  if (button.dataset.libraryAction === "rename-query" && library.queries[index]) { const name = prompt("New saved query name:", library.queries[index].name); if (!name) return; if (!name.trim() || name.length > 120) { status("Name must be nonempty and at most 120 characters."); return; } library.queries[index].name = name.trim(); }
  persist();
});
document.querySelector<HTMLFormElement>("#library-add-query")?.addEventListener("submit", (event) => {
  event.preventDefault(); if (!available) return;
  const form = event.currentTarget as HTMLFormElement;
  const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
  const url = (form.elements.namedItem("url") as HTMLInputElement).value.trim();
  if (!name || name.length > 120 || !safeQuery(url) || library.queries.some((item) => item.url === url)) { status("Enter a unique, valid local catalog/query URL and name."); return; }
  library.queries.push({ name, url }); persist(); form.reset();
});
document.querySelector<HTMLButtonElement>("#library-export")?.addEventListener("click", () => {
  if (!available) return;
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(library, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = "observatory-library.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
});
document.querySelector<HTMLInputElement>("#library-import")?.addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  if (!available || !input.files?.[0]) return;
  try { await startup; await loadCatalog(); if (!available) throw Error("Browser storage unavailable."); if (input.files[0].size > 2_000_000) throw Error("Backup exceeds 2 MB."); const imported = parseLibrary(JSON.parse(await input.files[0].text())); const previous = library; library = imported; if (!persist()) library = previous; else status("Backup imported and saved locally."); }
  catch (error) { status(`Import rejected: ${error instanceof Error ? error.message : "Invalid JSON"}. Existing library unchanged.`); }
  input.value = "";
});
void startup.then(render);
