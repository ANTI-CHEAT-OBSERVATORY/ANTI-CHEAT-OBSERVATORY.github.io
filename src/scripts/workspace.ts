import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { KnowledgeDataset, KnowledgeProposal, ValidationRecord } from "../lib/knowledge-types";
import { proposalErrors } from "../lib/proposal";
import { withBase } from "../lib/paths";

const form = document.querySelector<HTMLFormElement>("#validation-form");
const messages = document.querySelector<HTMLElement>("#validation-errors");
const status = document.querySelector<HTMLElement>("#validation-status");
const download = document.querySelector<HTMLButtonElement>("#validation-download");
const copy = document.querySelector<HTMLButtonElement>("#validation-copy");
if (form && messages && status && download && copy) {
  let revision = 0;
  let prepared: string | null = null;
  let preparedId: string | null = null;
  function invalidate() {
    revision += 1; prepared = null; preparedId = null;
    download!.disabled = true; copy!.disabled = true;
    messages!.textContent = "";
    status!.textContent = "Draft changed. Previous validated output is invalid; validate again before exporting.";
  }
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestRevision = ++revision; prepared = null; preparedId = null; download!.disabled = true; copy!.disabled = true;
    messages!.textContent = ""; status!.textContent = "Validating against the published schema and full catalog…";
    if (!form.reportValidity()) { messages!.textContent = "Complete every required field and select at least one claim."; status!.textContent = "No proposal prepared."; return; }
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const selected = (name: string) => [...(field(name) as HTMLSelectElement).selectedOptions].map((option) => option.value);
    const claimIds = selected("claimIds"); const sourceIds = selected("sourceIds");
    const buildId = field("buildId").value || null;
    const authorized = (field("authorized") as HTMLInputElement).checked;
    const performedBy = field("performedBy").value as ValidationRecord["performedBy"];
    const authority = field("authority").value as ValidationRecord["authority"];
    const activity = field("activity").value as ValidationRecord["activity"];
    const outcome = field("status").value as ValidationRecord["status"];
    const executedAt = field("executedAt").value || null;
    const textFields = ["environment", "tools", "inputs", "expected", "observed", "bounds"] as const;
    const missing = textFields.filter((name) => !field(name).value.trim());
    const limits = field("limitations").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const errors: string[] = [];
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    if (!claimIds.length) errors.push("Select at least one actual published claim ID.");
    if (missing.length || !limits.length) errors.push("Provide a completed execution contract, observed result and at least one explicit limitation; planned results are not observations.");
    if (authority === "reported" && !sourceIds.length) errors.push("Source-reported work requires at least one source revision ID.");
    if (authority === "reported" && outcome !== "reported") errors.push("An author's reported activity must retain the reported outcome; it is not an independently observed pass or fail.");
    if (authority === "observed" && (performedBy !== "observatory" || !authorized || !executedAt || outcome === "reported")) errors.push("Observatory-observed work requires Observatory as performer, explicit authorization, actual execution date and a non-reported outcome.");
    if (authority === "observed" && (activity === "behavior-reproduced" || outcome === "pass") && (!authorized || !buildId || !executedAt || !field("inputs").value.trim() || !field("observed").value.trim() || !field("expected").value.trim() || !field("bounds").value.trim())) errors.push("An observed reproduced/pass result requires authorization, an identified build/sample, execution date, real inputs, expected/observed behavior and bounds.");
    if (executedAt && executedAt > today) errors.push("Execution cannot be dated in the future.");
    if (errors.length) { messages!.textContent = errors.join(" "); status!.textContent = "No proposal prepared."; return; }
    const validation: ValidationRecord = {
      id: `validation-local-${crypto.randomUUID()}`, title: field("title").value.trim(), claimIds, buildId, activity, performedBy, authority, status: outcome, authorized,
      environment: field("environment").value.trim(), tools: field("tools").value.trim(), inputs: field("inputs").value.trim(), expected: field("expected").value.trim(), observed: field("observed").value.trim(), bounds: field("bounds").value.trim(), sourceIds, executedAt,
      reviewedAt: today, limitations: limits,
    };
    const proposal: KnowledgeProposal = { schemaVersion: "2.0.0", validations: [validation] };
    try {
      const responses = await Promise.all([fetch(withBase("/api/v2/schema.json")), fetch(withBase("/api/v2/knowledge.json"))]);
      if (requestRevision !== revision) return;
      if (responses.some((response) => !response.ok)) throw Error("Published schema or dataset unavailable. No proposal can be validated offline.");
      const [schema, existing] = await Promise.all([responses[0].json(), responses[1].json()]) as [Record<string, unknown>, KnowledgeDataset];
      if (requestRevision !== revision) return;
      const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
      const validate = ajv.compile({ ...schema, required: ["schemaVersion"] });
      if (!validate(proposal)) { messages!.textContent = `Schema validation rejected the proposal: ${ajv.errorsText(validate.errors, { separator: "; " })}`; status!.textContent = "No proposal prepared."; return; }
      const semantic = proposalErrors(proposal, existing, false);
      if (semantic.length) { messages!.textContent = `Catalog or semantic validation rejected the proposal: ${semantic.join("; ")}`; status!.textContent = "No proposal prepared."; return; }
      prepared = JSON.stringify(proposal, null, 2) + "\n"; preparedId = validation.id;
      download!.disabled = false; copy!.disabled = false;
      status!.textContent = "Validated against published schema and existing IDs. Review the JSON before importing; no catalog change has been made.";
    } catch (error) { if (requestRevision === revision) { messages!.textContent = error instanceof Error ? error.message : "Validation failed."; status!.textContent = "No proposal prepared. Check network or published schema."; } }
  });
  download.addEventListener("click", () => {
    if (!prepared || !preparedId) return;
    const url = URL.createObjectURL(new Blob([prepared], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${preparedId}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  copy.addEventListener("click", async () => {
    if (!prepared) return;
    try { await navigator.clipboard.writeText(prepared); status!.textContent = "Validated JSON copied. Paste into a local file, then run the importer; no claim state has changed."; }
    catch { status!.textContent = "Clipboard unavailable or denied; use Download validated proposal instead."; }
  });
}
