import path from "node:path";
import { projectRoot, readJson, readKnowledge } from "./knowledge-io.mjs";
import { validateDataset, validateDiscovery } from "./knowledge-validation.mjs";

try {
  const data = await readKnowledge();
  const errors = validateDataset(data);
  if (!errors.length) {
    const discovery = await readJson(path.join(projectRoot, "src/data/discovery.json"));
    const registry = await readJson(path.join(projectRoot, "src/data/discovery-sources.json"));
    errors.push(...validateDiscovery(discovery, data, registry));
    const outlets = await readJson(path.join(projectRoot, "src/data/research-sources.json"));
    if (!Array.isArray(outlets) || !outlets.length || new Set(outlets.map((outlet) => outlet.id)).size !== outlets.length) errors.push("Research publication directory must contain unique entries");
    else for (const outlet of outlets) {
      if (!URL.canParse(outlet.url) || new URL(outlet.url).protocol !== "https:" || !["Independent research", "Community forum", "Vendor documentation", "Academic"].includes(outlet.type) || !["Public", "Partially accessible"].includes(outlet.access) || !outlet.limitation) errors.push(`${outlet.id}: invalid publication-directory metadata`);
    }
  }
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else {
    const counts = Object.fromEntries(Object.entries(data).filter(([key, value]) => key !== "schemaVersion" && Array.isArray(value)).map(([key, value]) => [key, value.length]));
    console.log(`Validated normalized knowledge 2.0.0: ${JSON.stringify(counts)}`);
    console.log("Evidence origins, scopes, references, disputes, execution contracts and discovery integrity passed. Structural validation does not establish binary semantics.");
  }
} catch (error) {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
}
