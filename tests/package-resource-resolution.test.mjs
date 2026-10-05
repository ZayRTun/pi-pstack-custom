import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const AUTOPILOT_FULL = "skills/poteto-mode/playbooks/autopilot-full.md";
const AUTOPILOT_STACK = "skills/poteto-mode/playbooks/autopilot-stack.md";
const MULTI_PHASE_PLAN = "skills/poteto-mode/playbooks/multi-phase-plan.md";

// The resolution the playbooks state, applied mechanically so a fixture can prove
// where it lands. The owning definition is `agents/poteto-agent.md`, whose sibling
// `../skills` tree holds every bundled resource.
function resolveFromOwningDefinition(definitionPath, bundledPath) {
  return resolve(dirname(definitionPath), "..", bundledPath);
}

test("the playbooks read bundled skills from the owning package, never from project trunk", () => {
  for (const rel of [AUTOPILOT_FULL, AUTOPILOT_STACK, MULTI_PHASE_PLAN]) {
    const source = readFileSync(join(pkgRoot, rel), "utf8");
    assert.doesNotMatch(source, /git show origin\/main:skills\//, `${rel} reads a bundled skill from project trunk`);
    assert.doesNotMatch(source, /pstack\/skills\//, `${rel} addresses a bundled skill through a work-project path`);
  }

  const full = readFileSync(join(pkgRoot, AUTOPILOT_FULL), "utf8");
  assert.match(full, /re-read this playbook from the package that owns it/);
  assert.match(full, /Resolve it definition-relative from the owning definition/);
  assert.match(full, /Project trunk holds only the project's own artifacts/);
  assert.match(full, /If no owning package location resolves, stop and report the gap/);

  const stack = readFileSync(join(pkgRoot, AUTOPILOT_STACK), "utf8");
  assert.match(stack, /re-read this playbook from the package that owns it/);

  const plan = readFileSync(join(pkgRoot, MULTI_PHASE_PLAN), "utf8");
  assert.match(plan, /Read these bundled resources from the package that owns them/);
  assert.match(plan, /Resolve each one definition-relative from the owning definition/);
  assert.match(plan, /Read the project's own artifacts from project trunk/);
});

test("a foreign project with same-named skills cannot shadow the package's resources", (t) => {
  const definitionPath = join(pkgRoot, "agents", "poteto-agent.md");
  const definition = readFileSync(definitionPath, "utf8");
  assert.match(definition, /The owning skill is exactly `\.\.\/skills\/poteto-mode\/SKILL\.md`/);

  const foreign = mkdtempSync(join(tmpdir(), "foreign-project-"));
  t.after(() => rmSync(foreign, { recursive: true, force: true }));
  for (const rel of [AUTOPILOT_FULL, "skills/swarm/SKILL.md"]) {
    const full = join(foreign, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, `FOREIGN PROJECT COPY ${rel}\n`);
  }

  const viaProjectCwd = readFileSync(join(foreign, AUTOPILOT_FULL), "utf8");
  assert.match(viaProjectCwd, /^FOREIGN PROJECT COPY/);

  const resolved = resolveFromOwningDefinition(definitionPath, AUTOPILOT_FULL);
  assert.ok(resolved.startsWith(pkgRoot), `${resolved} escapes the owning package`);
  const packageCopy = readFileSync(resolved, "utf8");
  assert.match(packageCopy, /^### Autopilot-full$/m);
  assert.doesNotMatch(packageCopy, /FOREIGN PROJECT COPY/);

  const swarm = resolveFromOwningDefinition(definitionPath, "skills/swarm/SKILL.md");
  assert.equal(swarm, join(pkgRoot, "skills/swarm/SKILL.md"));
});
