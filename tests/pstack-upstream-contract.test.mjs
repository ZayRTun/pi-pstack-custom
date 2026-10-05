import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(pkgRoot, "skills");
const agentsDir = join(pkgRoot, "agents");
const provenance = JSON.parse(readFileSync(join(pkgRoot, "provenance.json"), "utf8"));

function frontmatter(file) {
  const block = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(block, `missing frontmatter in ${file}`);
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();

test("provenance pins the imported original, its base, and the historical port", () => {
  assert.equal(provenance.schemaVersion, 1);
  assert.deepEqual(provenance.original, {
    repository: "https://github.com/cursor/plugins",
    subtree: "pstack",
    commit: "e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a",
    version: "0.15.9",
  });
  assert.deepEqual(provenance.originalBase, {
    commit: "53e579f1481697931fc44f5445171397cfa2b24b",
    version: "0.15.2",
  });
  assert.equal(provenance.historicalPiPort.repository, "https://github.com/casualjim/pi-mimir");
  assert.equal(provenance.historicalPiPort.commit, "577aa5571817c0096f243fe1b02cc5adf147f0ab");
  assert.match(provenance.historicalPiPort.note, /never an update source/);
  assert.deepEqual(provenance.skillNameMappings, { tdd: "pstack-tdd", teach: "pstack-teach" });
});

test("every excluded original path stays out of the package", () => {
  assert.equal(provenance.exclusions.length, 6);
  for (const exclusion of provenance.exclusions) {
    const omitted = exclusion.path.replace(/\/$/, "");
    assert.equal(existsSync(join(pkgRoot, omitted)), false, `${omitted} must stay excluded`);
    assert.ok(exclusion.reason.length > 10, `${omitted} needs a real reason`);
  }
});

test("renamed original skills map onto their namespaced local directories", () => {
  for (const [source, target] of Object.entries(provenance.skillNameMappings)) {
    assert.equal(existsSync(join(skillsDir, source)), false, `${source} is renamed`);
    assert.equal(frontmatter(join(skillsDir, target, "SKILL.md")).name, target);
  }
});

test("every skill loads with a matching frontmatter name and a description", () => {
  assert.equal(skillDirs.length, 48);
  for (const dir of skillDirs) {
    const fields = frontmatter(join(skillsDir, dir, "SKILL.md"));
    assert.equal(fields.name, dir, `${dir}/SKILL.md name`);
    assert.ok(fields.description?.length > 20, `${dir} needs a usable description`);
    assert.equal(fields["disable-model-invocation"], "true", `${dir} is user-invoked`);
  }
});

test("the skills added in 0.15.9 load and the fork points at them", () => {
  for (const name of ["benchmark-checklist", "correct", "principle-explain-the-number"]) {
    assert.equal(frontmatter(join(skillsDir, name, "SKILL.md")).name, name);
  }
  const mode = readFileSync(join(skillsDir, "poteto-mode", "SKILL.md"), "utf8");
  assert.match(mode, /\*\*principle-explain-the-number\*\*/);
  assert.match(mode, /\*\*benchmark-checklist\*\* skill before you report or act on the number/);
  assert.match(
    readFileSync(join(skillsDir, "poteto-mode", "playbooks", "perf-issue.md"), "utf8"),
    /Vet the baseline, and each later number, with the \*\*benchmark-checklist\*\* skill\./,
  );
  assert.match(
    readFileSync(join(skillsDir, "poteto-mode", "playbooks", "hillclimb.md"), "utf8"),
    /Vet the harness with the \*\*benchmark-checklist\*\* skill before you freeze it, and make it print its error count and a count of the work done\./,
  );
  assert.match(
    readFileSync(join(skillsDir, "benchmark-checklist", "SKILL.md"), "utf8"),
    /\[Explain the Number\]\(\.\.\/principle-explain-the-number\/SKILL\.md\)/,
  );
  assert.match(frontmatter(join(skillsDir, "correct", "SKILL.md")).description, /Use for \/correct\./);
});

test("poteto-mode indexes every principle skill in this package", () => {
  const mode = readFileSync(join(skillsDir, "poteto-mode", "SKILL.md"), "utf8");
  const principles = skillDirs.filter((name) => name.startsWith("principle-"));
  assert.equal(principles.length, 24);
  for (const name of principles) assert.match(mode, new RegExp(`\\*\\*${name}\\*\\*`), `${name} is indexed`);
});

test("every relative link and playbook reference resolves", () => {
  const broken = [];
  for (const file of [...markdownFiles(skillsDir), ...markdownFiles(agentsDir)]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = match[1];
      if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
      if (!target.includes("/") && !target.includes(".")) continue;
      if (!existsSync(resolve(dirname(file), decodeURIComponent(target)))) broken.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("poteto-mode names a playbook file for every playbook on disk", () => {
  const mode = readFileSync(join(skillsDir, "poteto-mode", "SKILL.md"), "utf8");
  const referenced = [...new Set([...mode.matchAll(/`playbooks\/([a-z0-9-]+)\.md`/g)].map((match) => match[1]))].sort();
  const onDisk = readdirSync(join(skillsDir, "poteto-mode", "playbooks"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
  assert.deepEqual(referenced, onDisk);
});

test("workflow prose stays provider-neutral", () => {
  const banned = /pstack-models\.mdc|cursor-team-kit|control-ui|control-cli|~\/\.cursor|"\/deslop"|`\/deslop`|subagent_type|generalPurpose|durable-subagents\.json|AskQuestion/;
  const offenders = [...markdownFiles(skillsDir), ...markdownFiles(agentsDir)]
    .filter((file) => banned.test(readFileSync(file, "utf8")))
    .map((file) => file.slice(pkgRoot.length + 1));
  assert.deepEqual(offenders, []);
});

test("agents keep closed tool allowlists and definition-relative references", () => {
  const poteto = readFileSync(join(agentsDir, "poteto-agent.md"), "utf8");
  assert.match(poteto, /^tools: read, fffind, ffgrep, bash, edit, write, fetch_content$/m);
  assert.match(poteto, /The owning skill is exactly `\.\.\/skills\/poteto-mode\/SKILL\.md`/);
  const sicko = readFileSync(join(agentsDir, "comment-sicko.md"), "utf8");
  assert.match(sicko, /^tools: read, ffgrep, fffind, bash$/m);
  for (const file of [poteto, sicko]) assert.doesNotMatch(file, /^tools: .*\*$/m);
});

test("the package keeps its namespaced identity and Pi 1.0.2 SDK pins", () => {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "@zayar/pi-pstack");
  assert.equal(pkg.version, "0.1.10");
  assert.equal(pkg.devDependencies["@earendil-works/pi-coding-agent"], "^1.0.2");
  assert.equal(pkg.devDependencies["@earendil-works/pi-ai"], "^1.0.2");
  assert.equal(pkg.scripts["check:upstream"], "node scripts/check-upstream.mjs");
});

test("the packer drops nested dependency trees and keeps scripts and provenance", () => {
  const nestedModules = join(pkgRoot, "skills", "poteto-mode", "scripts", "node_modules");
  if (existsSync(nestedModules)) {
    assert.ok(readdirSync(nestedModules).length > 0, "nested deps are installed, so the exclusion is exercised");
  }
  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: pkgRoot, encoding: "utf8" }));
  const files = packed[0].files.map((entry) => entry.path);
  assert.deepEqual(files.filter((path) => path.includes("node_modules")), []);
  assert.ok(files.includes("scripts/check-upstream.mjs"), "scripts/check-upstream.mjs is published");
  assert.ok(files.includes("provenance.json"), "provenance.json is published");
  assert.ok(files.includes("skills/poteto-mode/scripts/check-plan.mjs"), "the nested package sources are published");
});

test("the imported delta keeps its provider-neutral benchmark wiring inside the playbooks", () => {
  const perf = readFileSync(join(skillsDir, "poteto-mode", "playbooks", "perf-issue.md"), "utf8");
  assert.match(perf, /Try the performance mantras in order, cheapest first:/);
  assert.match(perf, /1\. Don't do it\. Stop work whose result nothing uses rather than cheapening it\./);
  assert.match(perf, /These families name the mechanism behind each mantra\./);
  const hill = readFileSync(join(skillsDir, "poteto-mode", "playbooks", "hillclimb.md"), "utf8");
  assert.match(hill, /order hypotheses by the performance mantras in step 2 of the Perf issue playbook/);
});
