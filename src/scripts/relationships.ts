import { loadKnowledge } from "./knowledge-client";
import { withBase } from "../lib/paths";

const form = document.querySelector<HTMLFormElement>("#relationship-filters");
const graph = document.querySelector<HTMLElement>("#relationship-graph");
const table = document.querySelector<HTMLTableElement>("#relationship-table");
const counter = document.querySelector<HTMLElement>("#relationship-count");
const empty = document.querySelector<HTMLElement>("#relationship-empty");
async function initialize() {
  if (!form || !graph || !table || !counter || !empty) return;
  const { relationships, claims, sources, records } = await loadKnowledge();
  const ns = "http://www.w3.org/2000/svg";
  const names = new Map(records.map((record) => [record.id, record.title]));
  const supported = relationships.filter((edge) =>
    edge.claimIds.some((id) =>
      claims.some(
        (claim) =>
          claim.id === id &&
          claim.citations.some((citation) =>
            sources.some((source) => source.id === citation.sourceId),
          ),
      ),
    ),
  );
  const system = form.elements.namedItem("system") as HTMLSelectElement;
  const entity = form.elements.namedItem("entity") as HTMLSelectElement;
  const params = new URLSearchParams(location.search);
  system.value = [...system.options].some((option) => option.value === params.get("system")) ? params.get("system")! : "";
  entity.value = [...entity.options].some((option) => option.value === params.get("entity")) ? params.get("entity")! : "";
  function render() {
    const matches = supported.filter((edge) => (!entity.value || edge.fromId === entity.value || edge.toId === entity.value) && (!system.value || edge.fromId === system.value || edge.toId === system.value || edge.claimIds.some((id) => claims.find((claim) => claim.id === id)?.systemIds.includes(system.value))));
    const selected = new Set(matches.map((item) => item.id));
    for (const [index, row] of [...table!.tBodies[0].rows].entries()) row.hidden = !selected.has(supported[index]?.id);
    counter!.textContent = `${matches.length} documented edge${matches.length === 1 ? "" : "s"} shown`;
    empty!.hidden = matches.length > 0;
    const query = new URLSearchParams(); if (system.value) query.set("system", system.value); if (entity.value) query.set("entity", entity.value);
    history.replaceState(null, "", `${location.pathname}${query.size ? `?${query}` : ""}${location.hash}`);
    graph!.replaceChildren();
    if (!matches.length) { graph!.append(document.createTextNode("No sourced graph edge matches these filters.")); return; }
    const vertices = [...new Set(matches.flatMap((edge) => [edge.fromId, edge.toId]))];
    const radius = Math.max(150, vertices.length * 32);
    const size = radius * 2 + 250;
    const center = size / 2;
    const points = new Map(vertices.map((id, index) => [id, { x: center + radius * Math.cos(index * 2 * Math.PI / vertices.length), y: center + radius * Math.sin(index * 2 * Math.PI / vertices.length) }]));
    const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", `0 0 ${size} ${size}`); svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); svg.setAttribute("role", "group"); svg.setAttribute("aria-label", `${matches.length} sourced directed relationship edges`);
    for (const edge of matches) {
      const start = points.get(edge.fromId)!; const end = points.get(edge.toId)!;
      const cited = claims.find((claim) => edge.claimIds.includes(claim.id) && claim.citations.length);
      if (!cited) continue;
      const anchor = document.createElementNS(ns, "a"); anchor.setAttribute("href", withBase(`/claims/${cited.id}`)); anchor.setAttribute("tabindex", "0");
      const source = sources.find((item) => item.id === cited.citations[0].sourceId);
      anchor.setAttribute("aria-label", `${names.get(edge.fromId) ?? edge.fromId} ${edge.type} ${names.get(edge.toId) ?? edge.toId}; evidence: ${cited.statement}; source: ${source?.title ?? cited.citations[0].sourceId}. Open claim`);
      const line = document.createElementNS(ns, "line"); line.setAttribute("x1", String(start.x)); line.setAttribute("y1", String(start.y)); line.setAttribute("x2", String(end.x)); line.setAttribute("y2", String(end.y)); line.setAttribute("stroke", "currentColor"); line.setAttribute("stroke-width", "2"); anchor.append(line);
      const label = document.createElementNS(ns, "text"); label.setAttribute("x", String((start.x + end.x) / 2)); label.setAttribute("y", String((start.y + end.y) / 2 - 5)); label.setAttribute("text-anchor", "middle"); label.setAttribute("fill", "currentColor"); label.textContent = `↗ ${edge.type}`; anchor.append(label); svg.append(anchor);
    }
    for (const id of vertices) { const at = points.get(id)!; const circle = document.createElementNS(ns, "circle"); circle.setAttribute("cx", String(at.x)); circle.setAttribute("cy", String(at.y)); circle.setAttribute("r", "7"); circle.setAttribute("fill", "currentColor"); svg.append(circle); const title = document.createElementNS(ns, "text"); title.setAttribute("x", String(at.x)); title.setAttribute("y", String(at.y - 14)); title.setAttribute("text-anchor", "middle"); title.setAttribute("fill", "currentColor"); title.textContent = names.get(id) ?? id; svg.append(title); }
    graph!.append(svg);
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
  system.addEventListener("change", render); entity.addEventListener("change", render);
  render();
}
void initialize().catch((error) => {
  if (graph) graph.textContent = `Graph data unavailable: ${error instanceof Error ? error.message : String(error)}. The sourced table remains available below.`;
});
