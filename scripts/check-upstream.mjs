#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, posix, relative, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROVENANCE_PATH = join(HERE, "..", "provenance.json");

const MANIFEST = ".cursor-plugin/plugin.json";
const SHA = /^[0-9a-f]{40}$/;

export function parseProvenance(text) {
  const value = JSON.parse(text);
  if (value.schemaVersion !== 1) throw new Error(`unsupported provenance schemaVersion ${value.schemaVersion}`);
  const { original, originalBase, exclusions, skillNameMappings } = value;
  if (!original?.repository || !original?.subtree || !SHA.test(original?.commit) || !original?.version) {
    throw new Error("provenance.original needs repository, subtree, a 40-character commit, and version");
  }
  if (!SHA.test(originalBase?.commit) || !originalBase?.version) {
    throw new Error("provenance.originalBase needs a 40-character commit and version");
  }
  if (!Array.isArray(exclusions) || exclusions.some((entry) => !entry.path || !entry.reason)) {
    throw new Error("provenance.exclusions needs a path and a reason per entry");
  }
  if (typeof skillNameMappings !== "object" || skillNameMappings === null) {
    throw new Error("provenance.skillNameMappings must be an object");
  }
  return value;
}

export const apiBaseFor = (repository) =>
  repository.replace(/\.git$/, "").replace(/^https:\/\/github\.com\//, "https://api.github.com/repos/");

export const rawBaseFor = (repository) => repository.replace(/\.git$/, "").replace(/^https:\/\/github\.com\//, "https://raw.githubusercontent.com/");

// GitHub returns paths relative to the requested `commit:path` tree, so the subtree
// argument is a guard against requesting the whole repository instead.
// GitHub's tree API reports each blob's Git object id, which is sha1 over the
// framed object, not sha256 over the bytes. Hash the same framing locally so the
// two inventories are comparable in either direction.
export function gitBlobSha1(content) {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    .digest("hex");
}

const HASH_MODES = {
  "git-sha1": gitBlobSha1,
  sha256: (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`,
};

function hashContent(content, mode) {
  const hash = HASH_MODES[mode];
  if (!hash) throw new Error(`unknown inventory hash mode ${mode}; expected ${Object.keys(HASH_MODES).join(" or ")}`);
  return hash(content);
}

export function inventoryFromTree(tree, subtree) {
  const prefix = `${subtree.replace(/\/$/, "")}/`;
  if (tree.some((entry) => entry.path.startsWith(prefix))) {
    throw new Error(`tree paths are already prefixed with ${prefix}; request ${subtree} as a subtree instead`);
  }
  const inventory = new Map();
  inventory.mode = "git-sha1";
  for (const entry of tree) {
    if (entry.type === "blob") inventory.set(entry.path, entry.sha);
  }
  return inventory;
}

export function inventoryFromDirectory(dir, subtree, mode = "git-sha1") {
  const root = join(dir, subtree);
  const inventory = new Map();
  inventory.mode = mode;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else inventory.set(relative(root, full).split(sep).join(posix.sep), hashContent(readFileSync(full), mode));
    }
  };
  walk(root);
  return inventory;
}

export function compareInventories(pinned, candidate) {
  if (pinned.mode && candidate.mode && pinned.mode !== candidate.mode) {
    throw new Error(`cannot compare inventories hashed with ${pinned.mode} and ${candidate.mode}; re-hash one side with the same mode`);
  }
  const added = [];
  const modified = [];
  const removed = [];
  for (const [path, sha] of candidate) {
    if (!pinned.has(path)) added.push({ kind: "added", path, candidateSha: sha });
    else if (pinned.get(path) !== sha) modified.push({ kind: "modified", path, pinnedSha: pinned.get(path), candidateSha: sha });
  }
  for (const [path, sha] of pinned) if (!candidate.has(path)) removed.push({ kind: "removed", path, pinnedSha: sha });
  return [...added, ...removed, ...modified].sort((a, b) => a.path.localeCompare(b.path));
}

export function classifyChanges(changes, provenance) {
  return changes.map((change) => {
    const exclusion = provenance.exclusions.find((entry) => change.path.startsWith(entry.path));
    if (exclusion) return { ...change, policy: "excluded", reason: exclusion.reason, localPath: null };
    const segments = change.path.split("/");
    if (segments[0] === "skills" && segments.length > 1) {
      segments[1] = provenance.skillNameMappings[segments[1]] ?? segments[1];
      return { ...change, policy: "in-scope", reason: null, localPath: segments.join("/") };
    }
    if (segments[0] === "agents" || change.path === "README.md") {
      return { ...change, policy: "in-scope", reason: null, localPath: change.path };
    }
    return { ...change, policy: "out-of-scope", reason: "this package imports skills, agents, and its own README only", localPath: null };
  });
}

export function detectDrift({ pinned, candidate }) {
  if (!pinned.commit || !candidate.commit) return { known: false, sameVersionDifferentCommit: false };
  return { known: true, sameVersionDifferentCommit: pinned.version === candidate.version && pinned.commit !== candidate.commit };
}

export function formatReport(report) {
  const label = (side) => `${side.version} ${side.commit ?? "(no commit label)"} ${side.origin}`;
  const lines = [
    `pinned original:    ${label(report.pinned)}`,
    `candidate original: ${label(report.candidate)}`,
  ];
  if (report.drift.sameVersionDifferentCommit) {
    lines.push(`DRIFT: version ${report.pinned.version} now points at commit ${report.candidate.commit}. The pin is stale or its history was rewritten.`);
  }
  const excluded = report.changes.filter((change) => change.policy === "excluded");
  const acted = report.changes.filter((change) => change.policy !== "excluded");
  lines.push(`changed subtree paths since the pin: ${report.changes.length} (${acted.length} in scope, ${excluded.length} excluded by policy)`);
  for (const change of acted) {
    const target = change.localPath ? ` -> ${change.localPath}` : ` (${change.reason})`;
    lines.push(`  ${change.kind.padEnd(8)} ${change.path}${target}`);
  }
  for (const change of excluded) lines.push(`  ${change.kind.padEnd(8)} ${change.path} (excluded: ${change.reason})`);
  if (report.changes.length === 0) lines.push("  the imported subtree is current");
  lines.push("No file was written, merged, or checked out. Review the delta, then integrate it by hand.");
  return lines.join("\n");
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status} ${response.statusText}`);
  return response.json();
}

export async function resolveLatestCommit({ repository, subtree, fetchImpl = fetch }) {
  const url = `${apiBaseFor(repository)}/commits?path=${encodeURIComponent(subtree)}&per_page=1`;
  const commits = await getJson(url, fetchImpl);
  if (!Array.isArray(commits) || commits.length === 0) throw new Error(`no commit in ${repository} touches ${subtree}`);
  return commits[0].sha;
}

export async function remoteSource({ repository, subtree, commit, fetchImpl = fetch }) {
  const tree = await getJson(`${apiBaseFor(repository)}/git/trees/${commit}:${subtree}?recursive=1`, fetchImpl);
  if (tree.truncated) throw new Error(`the git tree for ${commit}:${subtree} is truncated; fetch it in smaller pieces`);
  const manifestUrl = `${rawBaseFor(repository)}/${commit}/${subtree}/${MANIFEST}`;
  const response = await fetchImpl(manifestUrl, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GET ${manifestUrl} failed with ${response.status} ${response.statusText}`);
  const version = JSON.parse(await response.text()).version;
  return { origin: `${repository}@${commit.slice(0, 7)}:${subtree}`, commit, version, inventory: inventoryFromTree(tree.tree, subtree) };
}

export function localSource({ dir, subtree, commit = null, expectedVersion }) {
  const version = JSON.parse(readFileSync(join(dir, subtree, MANIFEST), "utf8")).version;
  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`${dir} holds pstack ${version}, not the pinned ${expectedVersion}`);
  }
  return { origin: dir, commit, version, inventory: inventoryFromDirectory(dir, subtree) };
}

export function parseArgs(argv) {
  const flags = { json: false };
  const valued = ["--pinned", "--candidate", "--pinned-commit", "--candidate-commit"];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") flags.json = true;
    else if (valued.includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      flags[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else throw new Error(`unknown argument ${arg}`);
  }
  return flags;
}

export async function checkUpstream({ provenance, pinned, candidate }) {
  const changes = classifyChanges(compareInventories(pinned.inventory, candidate.inventory), provenance);
  const modifiedOrAdded = changes.filter((change) => change.kind !== "removed").length;
  return {
    pinned: { origin: pinned.origin, commit: pinned.commit, version: pinned.version },
    candidate: { origin: candidate.origin, commit: candidate.commit, version: candidate.version },
    drift: detectDrift({ pinned, candidate }),
    counts: { added: changes.filter((c) => c.kind === "added").length, removed: changes.filter((c) => c.kind === "removed").length, modified: changes.filter((c) => c.kind === "modified").length, unchanged: candidate.inventory.size - modifiedOrAdded },
    changes,
  };
}

export async function main(argv = [], { fetchImpl = fetch, provenanceText = readFileSync(PROVENANCE_PATH, "utf8"), log = console.log } = {}) {
  const flags = parseArgs(argv);
  const provenance = parseProvenance(provenanceText);
  const { repository, subtree, commit, version } = provenance.original;
  const pinned = flags.pinned
    ? localSource({ dir: flags.pinned, subtree, commit: flags.pinnedCommit, expectedVersion: version })
    : await remoteSource({ repository, subtree, commit, fetchImpl });
  const candidate = flags.candidate
    ? localSource({ dir: flags.candidate, subtree, commit: flags.candidateCommit })
    : await remoteSource({ repository, subtree, commit: await resolveLatestCommit({ repository, subtree, fetchImpl }), fetchImpl });
  const report = await checkUpstream({ provenance, pinned, candidate });
  log(flags.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.drift.sameVersionDifferentCommit ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`check:upstream failed: ${error.message}`);
    process.exitCode = 1;
  }
}
