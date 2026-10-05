import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const {
  parseProvenance,
  resolveLatestCommit,
  remoteSource,
  localSource,
  checkUpstream,
  detectDrift,
  formatReport,
  parseArgs,
  inventoryFromTree,
  inventoryFromDirectory,
  compareInventories,
  main,
} = await import(join(scriptsDir, "check-upstream.mjs"));

const PROVENANCE = JSON.parse(
  (await import("node:fs")).readFileSync(join(dirname(scriptsDir), "provenance.json"), "utf8"),
);
const PINNED_COMMIT = PROVENANCE.original.commit;
const PINNED_VERSION = PROVENANCE.original.version;
const NEXT_VERSION = "0.15.11";

function writePlugin(dir, version, files) {
  mkdirSync(join(dir, "pstack", ".cursor-plugin"), { recursive: true });
  writeFileSync(join(dir, "pstack", ".cursor-plugin", "plugin.json"), JSON.stringify({ name: "pstack", version }));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, "pstack", path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function fixture(t, version, files, commit) {
  const root = mkdtempSync(join(tmpdir(), "pstack-upstream-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, version.replace(/\./g, "-"), commit?.slice(0, 7) ?? "local");
  writePlugin(dir, version, files);
  return dir;
}

function fakeFetch(record, responses) {
  return async (url) => {
    record.push(String(url));
    for (const [pattern, response] of responses) {
      if (String(url).includes(pattern)) return response;
    }
    return { ok: false, status: 404, statusText: "Not Found" };
  };
}

function capture() {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
}

test("offline mode reports the literal delta with mapped and excluded paths", async (t) => {
  const pinned = fixture(
    t,
    PINNED_VERSION,
    {
      "skills/architect/SKILL.md": "original architect\n",
      "skills/tdd/SKILL.md": "original tdd\n",
      "skills/setup-pstack/SKILL.md": "excluded setup\n",
      "agents/poteto-agent.md": "original agent\n",
      "docs/guide/README.md": "excluded doc\n",
    },
    PINNED_COMMIT,
  );
  const candidate = fixture(
    t,
    NEXT_VERSION,
    {
      "skills/architect/SKILL.md": "changed architect\n",
      "skills/benchmark-checklist/SKILL.md": "added skill\n",
      "skills/tdd/SKILL.md": "changed tdd\n",
      "agents/poteto-agent.md": "original agent\n",
      "docs/guide/README.md": "changed doc\n",
    },
    "1111111111111111111111111111111111111111",
  );
  const { lines, log } = capture();
  const code = await main(["--pinned", pinned, "--candidate", candidate, "--pinned-commit", PINNED_COMMIT, "--candidate-commit", "1111111111111111111111111111111111111111", "--json"], { log });
  const report = JSON.parse(lines.join("\n"));
  assert.equal(code, 0);
  assert.deepEqual(report.counts, { added: 1, removed: 1, modified: 4, unchanged: 1 });
  assert.deepEqual(
    report.changes.map((change) => [change.kind, change.path, change.localPath, change.policy]),
    [
      ["modified", ".cursor-plugin/plugin.json", null, "excluded"],
      ["modified", "docs/guide/README.md", null, "excluded"],
      ["modified", "skills/architect/SKILL.md", "skills/architect/SKILL.md", "in-scope"],
      ["added", "skills/benchmark-checklist/SKILL.md", "skills/benchmark-checklist/SKILL.md", "in-scope"],
      ["removed", "skills/setup-pstack/SKILL.md", null, "excluded"],
      ["modified", "skills/tdd/SKILL.md", "skills/pstack-tdd/SKILL.md", "in-scope"],
    ],
  );
  assert.equal(report.drift.known, true);
  assert.equal(report.drift.sameVersionDifferentCommit, false);
});

test("the report names the excluded paths with their recorded reason", async (t) => {
  const pinned = fixture(t, PINNED_VERSION, { "skills/setup-pstack/SKILL.md": "a\n" }, PINNED_COMMIT);
  const candidate = fixture(t, NEXT_VERSION, { "skills/setup-pstack/SKILL.md": "b\n" }, "2222222222222222222222222222222222222222");
  const { lines, log } = capture();
  await main(["--pinned", pinned, "--candidate", candidate, "--pinned-commit", PINNED_COMMIT, "--candidate-commit", "2222222222222222222222222222222222222222"], { log });
  assert.match(lines.join("\n"), /modified skills\/setup-pstack\/SKILL\.md \(excluded: writes Cursor model rules; this package has no equivalent\)/);
  assert.match(lines.join("\n"), /^No file was written, merged, or checked out\. Review the delta, then integrate it by hand\.$/m);
});

test("the same version at a different commit is reported as drift and fails the check", async (t) => {
  const pinned = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const candidate = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "b\n" }, "3333333333333333333333333333333333333333");
  const { lines, log } = capture();
  const code = await main(["--pinned", pinned, "--candidate", candidate, "--pinned-commit", PINNED_COMMIT, "--candidate-commit", "3333333333333333333333333333333333333333"], { log });
  assert.equal(code, 1);
  assert.match(lines.join("\n"), new RegExp(`DRIFT: version ${PINNED_VERSION.replace(/\./g, "\\.")} now points at commit 3333333333333333333333333333333333333333\\.`));
  assert.equal(detectDrift({ pinned: { version: PINNED_VERSION, commit: PINNED_COMMIT }, candidate: { version: PINNED_VERSION, commit: PINNED_COMMIT } }).sameVersionDifferentCommit, false);
});

test("a pinned directory that is not the recorded version fails loudly", (t) => {
  const dir = fixture(t, "0.15.3", { "skills/arena/SKILL.md": "a\n" });
  assert.throws(() => localSource({ dir, subtree: "pstack", expectedVersion: PINNED_VERSION }), /holds pstack 0\.15\.3, not the pinned 0\.15\.10/);
});

test("provenance parsing rejects a non-immutable or incomplete record", () => {
  assert.throws(() => parseProvenance(JSON.stringify({ schemaVersion: 2 })), /unsupported provenance schemaVersion 2/);
  const broken = { ...PROVENANCE, original: { ...PROVENANCE.original, commit: "main" } };
  assert.throws(() => parseProvenance(JSON.stringify(broken)), /40-character commit/);
  const noReason = { ...PROVENANCE, exclusions: [{ path: "docs/" }] };
  assert.throws(() => parseProvenance(JSON.stringify(noReason)), /path and a reason per entry/);
});

test("online resolution reads the original repository subtree and never the historical port", async () => {
  const urls = [];
  const fetchImpl = fakeFetch(urls, [
    ["/commits?path=pstack", { ok: true, status: 200, json: async () => [{ sha: "4444444444444444444444444444444444444444" }] }],
    ["/git/trees/", {
      ok: true,
      status: 200,
      json: async () => ({
        truncated: false,
        tree: [
          { type: "blob", path: "skills/architect/SKILL.md", sha: "aaa" },
          { type: "tree", path: "skills", sha: "bbb" },
        ],
      }),
    }],
    ["plugin.json", { ok: true, status: 200, text: async () => JSON.stringify({ version: NEXT_VERSION }) }],
  ]);
  const commit = await resolveLatestCommit({ repository: PROVENANCE.original.repository, subtree: "pstack", fetchImpl });
  assert.equal(commit, "4444444444444444444444444444444444444444");
  const source = await remoteSource({ repository: PROVENANCE.original.repository, subtree: "pstack", commit, fetchImpl });
  assert.equal(source.version, NEXT_VERSION);
  assert.deepEqual([...source.inventory], [["skills/architect/SKILL.md", "aaa"]]);
  assert.match(urls[0], /^https:\/\/api\.github\.com\/repos\/cursor\/plugins\/commits\?path=pstack&per_page=1$/);
  assert.match(urls[1], /\/git\/trees\/4444444444444444444444444444444444444444:pstack\?recursive=1$/);
  assert.equal(urls.filter((url) => url.includes("pi-mimir")).length, 0);
});

test("a tree that comes back repository-scoped fails instead of reporting a clean diff", () => {
  assert.throws(
    () => inventoryFromTree([{ type: "blob", path: "pstack/skills/architect/SKILL.md", sha: "aaa" }], "pstack"),
    /tree paths are already prefixed with pstack\/; request pstack as a subtree instead/,
  );
});

test("a truncated tree and an HTTP failure each fail clearly", async () => {
  await assert.rejects(
    remoteSource({ repository: PROVENANCE.original.repository, subtree: "pstack", commit: PINNED_COMMIT, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ truncated: true, tree: [] }) }) }),
    /is truncated; fetch it in smaller pieces/,
  );
  await assert.rejects(
    remoteSource({ repository: PROVENANCE.original.repository, subtree: "pstack", commit: PINNED_COMMIT, fetchImpl: async () => ({ ok: false, status: 404, statusText: "Not Found" }) }),
    /failed with 404 Not Found/,
  );
  await assert.rejects(
    resolveLatestCommit({ repository: PROVENANCE.original.repository, subtree: "pstack", fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }) }),
    /no commit in https:\/\/github\.com\/cursor\/plugins touches pstack/,
  );
});

test("offline mode never calls the network", async (t) => {
  const pinned = fixture(t, PINNED_VERSION, { "skills/why/SKILL.md": "a\n" }, PINNED_COMMIT);
  const candidate = fixture(t, PINNED_VERSION, { "skills/why/SKILL.md": "a\n" }, PINNED_COMMIT);
  let calls = 0;
  const { lines, log } = capture();
  const code = await main(["--pinned", pinned, "--candidate", candidate, "--pinned-commit", PINNED_COMMIT, "--candidate-commit", PINNED_COMMIT], { log, fetchImpl: async () => { calls += 1; throw new Error("network used"); } });
  assert.equal(calls, 0);
  assert.equal(code, 0);
  assert.match(lines.join("\n"), /the imported subtree is current/);
});

// Git blob object ids for the fixed fixture contents, computed with `git hash-object --stdin`.
const SHA_A = "78981922613b2afb6025042ff6bd878ac1994e85";
const SHA_B = "61780798228d17af2d34fce4cfbdf35556832472";
const SHA_PLUGIN_PINNED = "a0e343bdd727192fdf8806635ed60c309258bdcb";

function remoteInventory(arenaSha) {
  return inventoryFromTree(
    [
      { type: "blob", path: "skills/arena/SKILL.md", sha: arenaSha },
      { type: "blob", path: ".cursor-plugin/plugin.json", sha: SHA_PLUGIN_PINNED },
    ],
    "pstack",
  );
}

test("a local pin compared against a remote candidate reports unchanged content as zero delta", async (t) => {
  const dir = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const pinned = localSource({ dir, subtree: "pstack", commit: PINNED_COMMIT });
  assert.equal(pinned.inventory.get("skills/arena/SKILL.md"), SHA_A);
  const candidate = { origin: "remote", commit: "6666666666666666666666666666666666666666", version: PINNED_VERSION, inventory: remoteInventory(SHA_A) };
  assert.deepEqual(compareInventories(pinned.inventory, candidate.inventory), []);
  const report = await checkUpstream({ provenance: PROVENANCE, pinned, candidate });
  assert.deepEqual(report.counts, { added: 0, removed: 0, modified: 0, unchanged: 2 });
});

test("a remote pin compared against a local candidate reports unchanged content as zero delta", async (t) => {
  const dir = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const candidate = localSource({ dir, subtree: "pstack", commit: "7777777777777777777777777777777777777777" });
  assert.equal(candidate.inventory.get("skills/arena/SKILL.md"), SHA_A);
  const pinned = { origin: "remote", commit: PINNED_COMMIT, version: PINNED_VERSION, inventory: remoteInventory(SHA_A) };
  assert.deepEqual(compareInventories(pinned.inventory, candidate.inventory), []);
  const report = await checkUpstream({ provenance: PROVENANCE, pinned, candidate });
  assert.deepEqual(report.counts, { added: 0, removed: 0, modified: 0, unchanged: 2 });
});

test("mixed local and remote hashing recognizes changed content in both directions", async (t) => {
  const dir = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const local = localSource({ dir, subtree: "pstack", commit: PINNED_COMMIT }).inventory;
  const remote = remoteInventory(SHA_B);
  assert.deepEqual(compareInventories(local, remote), [
    { kind: "modified", path: "skills/arena/SKILL.md", pinnedSha: SHA_A, candidateSha: SHA_B },
  ]);
  assert.deepEqual(compareInventories(remote, local), [
    { kind: "modified", path: "skills/arena/SKILL.md", pinnedSha: SHA_B, candidateSha: SHA_A },
  ]);
});

test("an explicit sha256 inventory keeps its prefix and refuses a cross-mode compare", async (t) => {
  const dir = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const sha256 = inventoryFromDirectory(dir, "pstack", "sha256");
  assert.equal(sha256.mode, "sha256");
  assert.match(sha256.get("skills/arena/SKILL.md"), /^sha256:[0-9a-f]{64}$/);
  const git = localSource({ dir, subtree: "pstack", commit: PINNED_COMMIT }).inventory;
  assert.throws(() => compareInventories(git, sha256), /cannot compare inventories hashed with git-sha1 and sha256/);
  assert.throws(() => inventoryFromDirectory(dir, "pstack", "md5"), /unknown inventory hash mode md5/);
});

test("the JSON report is a plain serializable record", async (t) => {
  const pinned = fixture(t, PINNED_VERSION, { "skills/arena/SKILL.md": "a\n" }, PINNED_COMMIT);
  const candidate = fixture(t, NEXT_VERSION, { "skills/arena/SKILL.md": "a\n" }, "5555555555555555555555555555555555555555");
  const report = await checkUpstream({
    provenance: PROVENANCE,
    pinned: localSource({ dir: pinned, subtree: "pstack", commit: PINNED_COMMIT }),
    candidate: localSource({ dir: candidate, subtree: "pstack", commit: "5555555555555555555555555555555555555555" }),
  });
  assert.deepEqual(report.counts, { added: 0, removed: 0, modified: 1, unchanged: 1 });
  assert.deepEqual(
    report.changes.map((change) => [change.kind, change.path, change.policy]),
    [["modified", ".cursor-plugin/plugin.json", "excluded"]],
  );
  assert.match(formatReport(report), new RegExp(`candidate original: ${NEXT_VERSION.replace(/\./g, "\\.")} 5555555555555555555555555555555555555555`));
  assert.deepEqual(parseArgs(["--pinned", "/a", "--candidate", "/b", "--json"]), { json: true, pinned: "/a", candidate: "/b" });
  assert.throws(() => parseArgs(["--nope"]), /unknown argument --nope/);
});
