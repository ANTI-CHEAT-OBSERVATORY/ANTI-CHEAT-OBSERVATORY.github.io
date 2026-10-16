import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const arrayCollections = ["sources", "claims", "builds", "mechanisms", "relationships", "corrections", "dossiers"];
export const directoryCollections = { records: "src/data/records", posts: "src/data/posts", validations: "src/data/knowledge/validations" };
export async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}
export async function readKnowledge(root = projectRoot) {
  const data = { schemaVersion: "2.0.0" };
  for (const collection of arrayCollections) {
    data[collection] = await readJson(path.join(root, "src/data/knowledge", `${collection}.json`));
    if (!Array.isArray(data[collection])) throw new Error(`${collection}.json must contain an array`);
  }
  for (const [collection, directory] of Object.entries(directoryCollections)) {
    data[collection] = [];
    for (const filename of (await readdir(path.join(root, directory))).filter((name) => name.endsWith(".json")).sort()) {
      const entity = await readJson(path.join(root, directory, filename));
      if (path.basename(filename, ".json") !== entity.id) throw new Error(`${directory}/${filename}: filename must equal the entity ID`);
      data[collection].push(entity);
    }
  }
  return data;
}
