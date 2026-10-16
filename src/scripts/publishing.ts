import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../data/knowledge.schema.json";
import { withBase } from "../lib/paths";
import { proposalErrors } from "../lib/proposal";
import type { Claim, Citation, KnowledgeDataset, KnowledgeProposal, KnowledgeSource, ResearchPost } from "../lib/knowledge-types";

const form = document.querySelector<HTMLFormElement>("#publication-form")!;
const title = form.querySelector<HTMLInputElement>("#publication-title")!;
const postId = form.querySelector<HTMLInputElement>("#publication-id")!;
const sourceFields = form.querySelector<HTMLFieldSetElement>("#new-source-fields")!;
const existingSourceFields = form.querySelector<HTMLElement>("#existing-source-fields")!;
const existingSource = existingSourceFields.querySelector<HTMLSelectElement>("select")!;
const revisionKind = form.querySelector<HTMLSelectElement>('[name="revisionKind"]')!;
const revisionValue = form.querySelector<HTMLInputElement>('[name="revisionValue"]')!;
const transport = form.querySelector<HTMLSelectElement>('[name="sourceTransport"]')!;
const claimList = form.querySelector<HTMLElement>("#claim-list")!;
const claimTemplate = document.querySelector<HTMLTemplateElement>("#claim-template")!;
const error = form.querySelector<HTMLElement>("#publication-error")!;
const result = document.querySelector<HTMLElement>("#publication-result")!;
const output = document.querySelector<HTMLTextAreaElement>("#publication-output")!;
const status = document.querySelector<HTMLElement>("#publication-status")!;
const download = document.querySelector<HTMLAnchorElement>("#download-proposal")!;
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile<KnowledgeProposal>({ ...schema, required: ["schemaVersion"] });
let manualPostId = false;
let generated = "";
let objectUrl: string | undefined;
let draftVersion = 0;

form.querySelector<HTMLInputElement>('[name="published"]')!.value = today;
form.querySelector<HTMLInputElement>('[name="published"]')!.max = today;
form.querySelector<HTMLInputElement>('[name="sourceAccessed"]')!.value = today;
form.querySelector<HTMLInputElement>('[name="sourceAccessed"]')!.max = today;

function clearPrepared() {
  draftVersion++;
  generated = "";
  output.value = "";
  result.hidden = true;
  download.removeAttribute("href");
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
}

function showError(message: string) {
  error.textContent = message;
  error.hidden = false;
  error.scrollIntoView({ block: "nearest" });
}

function sourceMode(): "existing" | "new" {
  return form.querySelector<HTMLInputElement>('[name="sourceMode"]:checked')!.value as "existing" | "new";
}

function sourceProvenance(): string {
  return sourceMode() === "new"
    ? sourceFields.querySelector<HTMLSelectElement>('[name="sourceProvenance"]')!.value
    : existingSource.selectedOptions[0]?.dataset.provenance ?? "";
}

function syncClaimProvenance() {
  const provenance = sourceProvenance();
  claimList.querySelectorAll<HTMLSelectElement>('[name="provenance"]').forEach((select) => {
    select.value = provenance;
  });
}

function updateSourceMode() {
  const create = sourceMode() === "new";
  sourceFields.hidden = !create;
  sourceFields.disabled = !create;
  existingSourceFields.hidden = create;
  existingSource.disabled = create;
  syncClaimProvenance();
}

function updateRevision() {
  const versioned = revisionKind.value !== "unversioned";
  revisionValue.disabled = !versioned;
  revisionValue.required = versioned;
  revisionValue.pattern = revisionKind.value === "git" ? "[a-f0-9]{40}" : "";
  if (!versioned) revisionValue.value = "";
}

function addClaim() {
  const card = claimTemplate.content.firstElementChild!.cloneNode(true) as HTMLFieldSetElement;
  claimList.append(card);
  card.querySelector<HTMLElement>(".claim-heading")!.textContent = `Claim ${claimList.children.length}`;
  card.querySelector<HTMLInputElement>('[name="reviewedAt"]')!.value = today;
  card.querySelector<HTMLInputElement>('[name="reviewedAt"]')!.max = today;
  card.querySelector<HTMLSelectElement>('[name="provenance"]')!.value = sourceProvenance();
  updateRemoveButtons();
  clearPrepared();
}

function updateRemoveButtons() {
  [...claimList.querySelectorAll<HTMLFieldSetElement>(".claim-card")].forEach((card, index) => {
    card.querySelector<HTMLElement>(".claim-heading")!.textContent = `Claim ${index + 1}`;
    card.querySelector<HTMLButtonElement>(".remove-claim")!.hidden = claimList.children.length === 1;
  });
}

function value(values: FormData, name: string): string {
  return String(values.get(name) ?? "").trim();
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function selected(card: HTMLFieldSetElement, name: string): string[] {
  const element = card.querySelector<HTMLSelectElement>(`[name="${name}"]`)!;
  return Array.from(element.selectedOptions, (option) => option.value);
}

function makeSource(values: FormData): KnowledgeSource {
  const kind = value(values, "revisionKind") as KnowledgeSource["revision"]["kind"];
  const source: KnowledgeSource = {
    id: value(values, "sourceId"),
    title: value(values, "sourceTitle"),
    url: value(values, "sourceUrl"),
    publisher: value(values, "publisher"),
    accessed: value(values, "sourceAccessed"),
    provenance: value(values, "sourceProvenance") as KnowledgeSource["provenance"],
    revision: { kind, value: kind === "unversioned" ? null : value(values, "revisionValue") },
    access: value(values, "sourceAccess") as KnowledgeSource["access"],
    transport: value(values, "sourceTransport") as KnowledgeSource["transport"],
    originId: value(values, "originId"),
    rights: value(values, "rights"),
    limitations: lines(value(values, "sourceLimitations")),
  };
  if (value(values, "sourceAuthor")) source.author = value(values, "sourceAuthor");
  if (value(values, "sourcePublished")) source.published = value(values, "sourcePublished");
  if (value(values, "retrievalUrl")) source.retrievalUrl = value(values, "retrievalUrl");
  return source;
}

function makeClaim(card: HTMLFieldSetElement, sourceId: string, id: string, productIds: string[], recordIds: string[]): Claim {
  const input = (name: string) => (card.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)!).value.trim();
  const locator: Citation["locator"] = {
    kind: input("locatorKind") as Citation["locator"]["kind"],
    value: input("locatorValue"),
  };
  if (input("locatorUrl")) locator.url = input("locatorUrl");
  if (input("addressSpace")) locator.addressSpace = input("addressSpace");
  if (input("imageBase")) locator.imageBase = input("imageBase");
  return {
    id: input("claimId"),
    statement: input("statement"),
    recordIds,
    postIds: [id],
    systemIds: productIds,
    buildIds: selected(card, "buildIds"),
    mechanismIds: selected(card, "mechanismIds"),
    kind: input("kind") as Claim["kind"],
    provenance: input("provenance") as Claim["provenance"],
    review: input("review") as Claim["review"],
    state: input("state") as Claim["state"],
    applicability: input("applicability"),
    citations: [{ sourceId, relation: input("relation") as Citation["relation"], locator, evidence: input("evidence") }],
    limitations: lines(input("limitations")),
    reviewedAt: input("reviewedAt"),
    validationIds: [],
    contradicts: [],
    supersedes: [],
  };
}

function makeProposal(): KnowledgeProposal {
  const values = new FormData(form);
  const id = value(values, "id");
  const source = sourceMode() === "new" ? makeSource(values) : undefined;
  const sourceId = source?.id ?? value(values, "existingSource");
  const productIds = values.getAll("products").map(String);
  const relatedIds = values.getAll("related").map(String);
  const recordIds = [...productIds, ...relatedIds];
  const cards = [...claimList.querySelectorAll<HTMLFieldSetElement>(".claim-card")];
  const claims = cards.map((card) => makeClaim(card, sourceId, id, productIds, recordIds));
  const sections: ResearchPost["sections"] = [];
  for (let index = 0; index < cards.length; index++) {
    const sectionTitle = cards[index].querySelector<HTMLInputElement>('[name="sectionTitle"]')!.value.trim();
    let section = sections.find((item) => item.title === sectionTitle);
    if (!section) {
      section = { title: sectionTitle, claimIds: [] };
      sections.push(section);
    }
    section.claimIds.push(claims[index].id);
  }
  const post: ResearchPost = {
    id,
    title: value(values, "title"),
    summary: value(values, "summary"),
    published: value(values, "published"),
    updated: today,
    category: value(values, "category") as ResearchPost["category"],
    author: "Observatory editorial",
    productIds,
    relatedIds,
    tags: [...new Set(value(values, "tags").split(",").map((tag) => tag.trim()).filter(Boolean))],
    takeaways: lines(value(values, "takeaways")).map((line) => line.replace(/^[-*]\s+/, "")),
    sourceIds: [sourceId],
    sections,
  };
  return { schemaVersion: "2.0.0", ...(source ? { sources: [source] } : {}), claims, posts: [post] };
}

function checkDuplicateDetails(proposal: KnowledgeProposal, existing: KnowledgeDataset): string[] {
  const errors: string[] = [];
  const source = proposal.sources?.[0];
  if (source && existing.sources.some((entry) => entry.url === source.url && entry.revision.kind === source.revision.kind && entry.revision.value === source.revision.value))
    errors.push("This URL and revision already have a source entry. Select the existing source instead.");
  const post = proposal.posts![0];
  if (existing.posts.some((entry) => entry.title.trim().toLowerCase() === post.title.trim().toLowerCase()))
    errors.push("A post with this title already exists. Choose a distinct title or update the existing post in the repository.");
  const existingStatements = new Set(existing.claims.map((claim) => claim.statement.trim().toLowerCase()));
  const statements = new Set<string>();
  for (const claim of proposal.claims ?? []) {
    const statement = claim.statement.trim().toLowerCase();
    if (statements.has(statement) || existingStatements.has(statement))
      errors.push(`Claim ${claim.id} repeats an existing statement. Attribute or revise the existing claim instead.`);
    statements.add(statement);
  }
  return errors;
}

title.addEventListener("input", () => {
  if (!manualPostId) postId.value = title.value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
});
postId.addEventListener("input", () => { manualPostId = !!postId.value; });
form.addEventListener("input", () => { clearPrepared(); error.hidden = true; });
form.addEventListener("change", () => { clearPrepared(); error.hidden = true; });
form.querySelectorAll<HTMLInputElement>('[name="sourceMode"]').forEach((radio) => radio.addEventListener("change", updateSourceMode));
revisionKind.addEventListener("change", updateRevision);
transport.addEventListener("change", () => {
  form.querySelector<HTMLInputElement>('[name="retrievalUrl"]')!.required = transport.value === "mirror";
});
claimList.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLSelectElement) || event.target.name !== "locatorKind") return;
  const card = event.target.closest<HTMLFieldSetElement>(".claim-card")!;
  card.querySelector<HTMLInputElement>('[name="addressSpace"]')!.required = event.target.value === "function";
});
form.querySelector<HTMLButtonElement>("#add-claim")!.addEventListener("click", addClaim);
claimList.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement) || !event.target.closest(".remove-claim")) return;
  event.target.closest(".claim-card")?.remove();
  updateRemoveButtons();
  clearPrepared();
});
addClaim();
if (existingSource.options.length === 1) {
  form.querySelector<HTMLInputElement>('[name="sourceMode"][value="new"]')!.checked = true;
  form.querySelector<HTMLInputElement>('[name="sourceMode"][value="existing"]')!.disabled = true;
}
updateSourceMode();
existingSource.addEventListener("change", syncClaimProvenance);
sourceFields.querySelector<HTMLSelectElement>('[name="sourceProvenance"]')!.addEventListener("change", syncClaimProvenance);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearPrepared();
  error.hidden = true;
  if (!form.reportValidity()) return;
  const proposal = makeProposal();
  if (proposal.claims?.some((claim) => claim.provenance !== sourceProvenance())) {
    showError("Claim evidence provenance must match the selected source. Use claim kind “Inference” for your independent interpretation, not a different source origin.");
    return;
  }
  if (!validate(proposal)) {
    showError(`Schema validation: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    return;
  }
  const version = draftVersion;
  try {
    const response = await fetch(withBase("/api/v2/knowledge.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const existing = await response.json() as KnowledgeDataset;
    if (version !== draftVersion) return;
    const errors = [...proposalErrors(proposal, existing), ...checkDuplicateDetails(proposal, existing)];
    if (errors.length) {
      showError(errors.join(" "));
      return;
    }
    generated = `${JSON.stringify(proposal, null, 2)}\n`;
    output.value = generated;
    objectUrl = URL.createObjectURL(new Blob([generated], { type: "application/json" }));
    download.href = objectUrl;
    download.download = "proposal.json";
    status.textContent = "Schema and local dataset checks passed. Import into your checkout for final validation; no files were published here.";
    result.hidden = false;
    result.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } catch (cause) {
    if (version === draftVersion) showError(`Unable to check current dataset: ${cause instanceof Error ? cause.message : String(cause)}. No proposal was prepared.`);
  }
});

document.querySelector<HTMLButtonElement>("#copy-proposal")!.addEventListener("click", async () => {
  if (!generated) return;
  const text = generated;
  try {
    await navigator.clipboard.writeText(text);
    if (text === generated) status.textContent = "Proposal JSON copied. Save it as proposal.json, then run npm run import -- proposal.json locally.";
  } catch {
    if (text !== generated) return;
    output.focus();
    output.select();
    status.textContent = "Clipboard unavailable. JSON selected; copy it manually and save it as proposal.json.";
  }
});
window.addEventListener("pagehide", () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
