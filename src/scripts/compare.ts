import { loadKnowledge } from "./knowledge-client";
import { withBase } from "../lib/paths";

const form = document.querySelector<HTMLFormElement>("#compare-controls");
const results = document.querySelector<HTMLElement>("#comparison-results");
async function initialize() {
  if (!form || !results) return;
  const { records, claims, mechanisms, builds, sources } = await loadKnowledge();
  const systems = records.filter((record) => record.kind === "product");
  if (!systems.length) { results.textContent = "No system dossiers are published."; return; }
  const systemSelect = (side: string) => form.elements.namedItem(side) as HTMLSelectElement;
  const buildSelect = (side: string) => form.elements.namedItem(`build${side.toUpperCase()}`) as HTMLSelectElement;
  const text = (tag: string, value: string, className?: string) => {
    const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node;
  };
  const link = (path: string, label: string) => {
    const node = document.createElement("a"); node.href = withBase(path); node.textContent = label; return node;
  };
  function updateBuilds(side: string, preferred = "") {
    const system = systemSelect(side).value; const select = buildSelect(side);
    const candidates = builds.filter((build) => build.systemIds.includes(system));
    select.replaceChildren(new Option("No selected build (scope unknown unless specified)", ""), ...candidates.map((build) => new Option(`${build.label} · ${build.version ?? "unknown version"}`, build.id)));
    select.value = candidates.some((item) => item.id === preferred) ? preferred : "";
  }
  function panel(side: string) {
    const id = systemSelect(side).value;
    const buildId = buildSelect(side).value;
    const system = systems.find((item) => item.id === id);
    const section = document.createElement("section"); section.className = "panel compare-column";
    section.append(text("h2", system?.title ?? id));
    const scope = document.createElement("p");
    scope.append("Build scope: ", buildId ? link(`/builds/${buildId}`, builds.find((item) => item.id === buildId)?.label ?? buildId) : "No build selected. Unscoped claims are shown separately, never as current build facts.");
    section.append(scope);
    const candidates = mechanisms.filter((mechanism) => mechanism.systemIds.includes(id));
    section.append(text("h3", "Documented mechanism worksheets"));
    if (!candidates.length) section.append(text("p", "Unknown: no mechanism worksheet documented for this system."));
    for (const mechanism of candidates) {
      const wrapper = document.createElement("div"); wrapper.append(link(`/mechanisms/${mechanism.id}`, mechanism.title));
      const evidence = mechanism.claimIds.map((claimId) => claims.find((claim) => claim.id === claimId)).filter((claim) => claim && claim.systemIds.includes(id) && (buildId ? claim.buildIds.includes(buildId) : true));
      wrapper.append(text("p", `${evidence.length} explicitly ${buildId ? "selected-build" : "system"}-scoped linked claim(s). ${mechanism.unknowns.length ? `Unknown: ${mechanism.unknowns.join("; ")}` : "No additional unknowns recorded."}`));
      if (!evidence.length) wrapper.append(text("p", "Unknown for selected scope; a generic mechanism description is not implementation evidence."));
      section.append(wrapper);
    }
    const applicable = claims.filter((claim) => claim.systemIds.includes(id) && (buildId ? claim.buildIds.includes(buildId) : claim.buildIds.length > 0));
    section.append(text("h3", buildId ? "Claims tied to the selected build" : "Claims tied to identified builds (not current-build claims)"));
    if (!applicable.length) section.append(text("p", "Unknown: no claim explicitly tied to this scope."));
    for (const claim of applicable) {
      const article = document.createElement("article"); article.className = "compare-claim";
      article.append(link(`/claims/${claim.id}`, claim.statement));
      article.append(text("p", `State: ${claim.state}; review: ${claim.review}; ${claim.applicability}. ${claim.buildIds.map((id) => builds.find((build) => build.id === id)?.label ?? id).join(", ")}.`));
      const cites = document.createElement("p"); cites.append("Evidence: ");
      for (const citation of claim.citations) { cites.append(link(`/sources/${citation.sourceId}`, `${sources.find((source) => source.id === citation.sourceId)?.title ?? citation.sourceId} [${citation.locator.kind}: ${citation.locator.value}]`), " "); }
      article.append(cites); section.append(article);
    }
    const unknown = claims.filter((claim) => claim.systemIds.includes(id) && !claim.buildIds.length);
    section.append(text("h3", `Build-unscoped claims (${unknown.length}) · not selected-build observations`));
    if (!unknown.length) section.append(text("p", "No build-unscoped claims recorded; other build gaps may remain."));
    for (const claim of unknown) { const paragraph = document.createElement("p"); paragraph.append(link(`/claims/${claim.id}`, claim.statement), ` · ${claim.state} · ${claim.applicability}`); section.append(paragraph); }
    return section;
  }
  function render() {
    const params = new URLSearchParams({ a: systemSelect("a").value, b: systemSelect("b").value });
    for (const side of ["a", "b"]) if (buildSelect(side).value) params.set(`build${side.toUpperCase()}`, buildSelect(side).value);
    history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
    results!.replaceChildren(panel("a"), panel("b"));
    results!.className = "comparison-grid";
  }
  const params = new URLSearchParams(location.search);
  for (const [index, side] of ["a", "b"].entries()) {
    const requested = params.get(side);
    systemSelect(side).value = systems.some((item) => item.id === requested) ? requested! : systems[index % systems.length].id;
    updateBuilds(side, params.get(`build${side.toUpperCase()}`) ?? "");
    systemSelect(side).addEventListener("change", () => { updateBuilds(side); render(); });
    buildSelect(side).addEventListener("change", render);
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
  render();
}
void initialize().catch((error) => {
  if (results) results.textContent = `Comparison data unavailable: ${error instanceof Error ? error.message : String(error)}`;
});
