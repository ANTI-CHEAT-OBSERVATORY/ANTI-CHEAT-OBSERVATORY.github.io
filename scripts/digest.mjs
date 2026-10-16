import { readFile, writeFile } from "node:fs/promises";
const location = new URL("../src/data/discovery.json", import.meta.url);
const snapshot = JSON.parse(await readFile(location, "utf8"));
const generatedAt = new Date().toISOString();
const previous = snapshot.digest?.generatedAt;
const from = previous && +new Date(previous) <= +new Date(generatedAt) ? previous : new Date(Date.now() - 7 * 86_400_000).toISOString();
const within = (value) => value && +new Date(value) > +new Date(from) && +new Date(value) <= +new Date(generatedAt);
snapshot.digest = {
  generatedAt,
  from,
  to: generatedAt,
  addedIds: snapshot.items.filter((item) => within(item.firstSeen)).map((item) => item.id).sort(),
  changeIds: snapshot.changes.filter((change) => within(change.date)).map((change) => change.id).sort(),
  blockedSourceIds: snapshot.sources.filter((source) => source.state === "blocked").map((source) => source.id).sort(),
};
await writeFile(location, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Digest ${from} to ${generatedAt}: ${snapshot.digest.addedIds.length} discoveries, ${snapshot.digest.changeIds.length} changes, ${snapshot.digest.blockedSourceIds.length} blocked sources.`);
