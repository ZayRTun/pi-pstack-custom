import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(pkgRoot, "skills");

function frontmatterName(skillPath) {
  const src = readFileSync(skillPath, "utf8");
  const block = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(block, `missing frontmatter block in ${skillPath}`);
  const name = block[1].match(/^name:\s*(.+?)\s*$/m);
  assert.ok(name, `missing frontmatter name in ${skillPath}`);
  return name[1].replace(/^["']|["']$/g, "");
}

const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));

test("workflow instructions require capabilities rather than a particular extension", () => {
  const mode = readFileSync(join(skillsDir, "poteto-mode", "SKILL.md"), "utf8");
  assert.match(mode, /when available and authorized/);
  assert.match(mode, /Pstack does not register that tool or require a particular provider/);
  assert.match(mode, /blocked workflows|block workflows/);
  assert.doesNotMatch(mode, /durable-subagents\.json|herdr-agents\/config\.json|four running child processes/);
  const swarm = readFileSync(join(skillsDir, "swarm", "SKILL.md"), "utf8");
  assert.match(swarm, /provider's declared per-call/);
  assert.match(swarm, /report it as blocked/);
  assert.doesNotMatch(swarm, /parallel cloud workers|pstack\/models\.json|durable-subagents\.json/);
});

test("package.json carries the namespaced identity", () => {
  assert.equal(pkg.name, "@zayar/pi-pstack");
  assert.equal(
    pkg.description,
    "Personal Pi pstack fork with namespaced skills and optional Sub-agent integration.",
  );
  assert.equal(pkg.repository.url, "https://github.com/ZayRTun/pi-pstack-custom");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.author, "casualjim");
});

test("renamed skill directories carry namespaced frontmatter names", () => {
  assert.equal(frontmatterName(join(skillsDir, "pstack-tdd", "SKILL.md")), "pstack-tdd");
  assert.equal(frontmatterName(join(skillsDir, "pstack-teach", "SKILL.md")), "pstack-teach");
});

test("old skill directories are absent", () => {
  assert.equal(existsSync(join(skillsDir, "tdd")), false);
  assert.equal(existsSync(join(skillsDir, "teach")), false);
});

test("bug-fix playbook invokes the renamed pstack-tdd skill", () => {
  const bugFix = readFileSync(
    join(skillsDir, "poteto-mode", "playbooks", "bug-fix.md"),
    "utf8",
  );
  assert.match(bugFix, /\*\*pstack-tdd\*\*/);
  assert.doesNotMatch(bugFix, /\*\*tdd\*\*/);
});

test("no skill in this package declares a bare tdd/teach frontmatter name", () => {
  const offenders = [];
  const stack = [skillsDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (entry === "SKILL.md") {
        const name = frontmatterName(full);
        if (name === "tdd" || name === "teach") offenders.push(full);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
