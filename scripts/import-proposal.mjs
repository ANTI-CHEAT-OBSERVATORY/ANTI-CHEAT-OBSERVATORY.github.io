import { readFile, writeFile, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { projectRoot, readJson, readKnowledge, arrayCollections, directoryCollections } from "./knowledge-io.mjs";
import { validateDataset, validateProposal } from "./knowledge-validation.mjs";
import { mergeProposal } from "../src/lib/proposal.ts";

const readExisting = (filename) => readFile(filename, "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });

/** Merge a fully checked proposal without publishing partially validated entities. */
export async function importProposal(proposal, { root = projectRoot, replace = false, dryRun = false } = {}) {
  const lockPath = path.join(root, ".aco-import.lock");
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch (error) { if (error.code === "EEXIST") throw new Error("Another import holds .aco-import.lock. Do not remove it while an import is running."); throw error; }
  const staged = [];
  const committed = [];
  try {
    const existing = await readKnowledge(root);
    const errors = [...validateDataset(existing), ...validateProposal(proposal, existing, replace)];
    if (errors.length) throw new Error(`Proposal rejected before writing:\n${errors.join("\n")}`);
    const merged = mergeProposal(proposal, existing);
    const mergedErrors = validateDataset(merged);
    if (mergedErrors.length) throw new Error(`Merged catalog rejected:\n${mergedErrors.join("\n")}`);
    const writes = [];
    for (const collection of arrayCollections) if (proposal[collection]?.length) {
      writes.push({ filename: path.join(root, "src/data/knowledge", `${collection}.json`), body: JSON.stringify(merged[collection], null, 2) + "\n" });
    }
    for (const [collection, directory] of Object.entries(directoryCollections)) for (const entity of proposal[collection] ?? []) {
      writes.push({ filename: path.join(root, directory, `${entity.id}.json`), body: JSON.stringify(entity, null, 2) + "\n" });
    }
    const result = { dryRun, changedFiles: writes.map((entry) => path.relative(root, entry.filename).replaceAll("\\", "/")), counts: Object.fromEntries(Object.entries(proposal).filter(([key, value]) => key !== "schemaVersion" && Array.isArray(value)).map(([key, value]) => [key, value.length])) };
    if (dryRun) return result;
    const suffix = `.aco-${randomUUID()}.tmp`;
    for (const entry of writes) {
      await mkdir(path.dirname(entry.filename), { recursive: true });
      const original = await readExisting(entry.filename);
      const temporary = entry.filename + suffix;
      await writeFile(temporary, entry.body, { flag: "wx" });
      staged.push({ ...entry, temporary, original });
    }
    if (JSON.stringify(await readKnowledge(root)) !== JSON.stringify(existing)) throw new Error("Catalog changed during preparation; import stopped before replacement.");
    for (const entry of staged) { await rename(entry.temporary, entry.filename); committed.push(entry); }
    return result;
  } catch (error) {
    const recoveryErrors = [];
    for (const entry of committed.reverse()) {
      try {
        if (await readExisting(entry.filename) !== entry.body) throw new Error("File changed outside this import; not overwritten during recovery");
        if (entry.original === null) await rm(entry.filename);
        else await writeFile(entry.filename, entry.original);
      } catch (recoveryError) { recoveryErrors.push(`${entry.filename}: ${recoveryError.message}`); }
    }
    if (recoveryErrors.length) throw new Error(`${error.message}\nRecovery needs inspection:\n${recoveryErrors.join("\n")}`);
    throw error;
  } finally {
    await Promise.all(staged.map((entry) => rm(entry.temporary, { force: true })));
    await lock.close();
    await rm(lockPath);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg.startsWith("--") && !["--replace", "--dry-run"].includes(arg))) throw new Error("Unknown option. Usage: npm run import -- proposal.json [--replace] [--dry-run]");
    const files = args.filter((arg) => !arg.startsWith("--"));
    if (files.length !== 1) throw new Error("Usage: npm run import -- proposal.json [--replace] [--dry-run]");
    const result = await importProposal(await readJson(path.resolve(files[0])), { replace: args.includes("--replace"), dryRun: args.includes("--dry-run") });
    console.log(JSON.stringify(result, null, 2));
    console.log(result.dryRun ? "Dry run passed; no catalog files changed." : "Proposal imported. Inspect the changes, build, exercise the affected pages, then commit to publish.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
