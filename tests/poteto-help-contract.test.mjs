// Structural checks on the help skill and the text contracts in it, not on model obedience.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(pkgRoot, "skills");
const helpDir = join(skillsDir, "poteto-help");
const helpFile = join(helpDir, "SKILL.md");
const helpSource = readFileSync(helpFile, "utf8");
const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));

function frontmatterField(file, key) {
  const block = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(block, `missing frontmatter in ${file}`);
  const line = block[1].split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();

test("poteto-help is model-invocable and its description bounds the trigger", () => {
  assert.equal(frontmatterField(helpFile, "name"), "poteto-help");
  assert.equal(frontmatterField(helpFile, "disable-model-invocation"), undefined);
  const description = frontmatterField(helpFile, "description");
  assert.ok(description.length <= 1024, "description fits the Pi limit");
  assert.match(description, /Use for \/skill:poteto-help/);
  assert.match(description, /how to install, set up, use, or extend pstack/);
  assert.match(description, /which pstack skill, playbook, or principle fits/);
  assert.match(description, /Not for requests to do work/);
});

test("every other bundled skill stays user-invoked", () => {
  const others = skillDirs.filter((name) => name !== "poteto-help");
  assert.equal(others.length, 48);
  for (const name of others) {
    assert.equal(
      frontmatterField(join(skillsDir, name, "SKILL.md"), "disable-model-invocation"),
      "true",
      `${name} is user-invoked`,
    );
  }
});

test("every linked skill command label is the target skill's own command", () => {
  const labels = [...helpSource.matchAll(/\[`(\/[^`]+)`\]\(([^)]+)\)/g)];
  const checked = new Set();
  for (const [, label, target] of labels) {
    const selfLink = target === "SKILL.md";
    const skillLink = target.match(/^\.\.\/([a-z0-9-]+)\/SKILL\.md$/);
    if (!selfLink && !skillLink) continue;
    const dir = selfLink ? "poteto-help" : skillLink[1];
    const name = frontmatterField(join(skillsDir, dir, "SKILL.md"), "name");
    const expected = dir === "poteto-mode" ? "/poteto-mode" : `/skill:${name}`;
    assert.equal(label, expected, `${dir} is labelled with its real command`);
    checked.add(dir);
  }
  const routed = skillDirs.filter((name) => !name.startsWith("principle-"));
  assert.equal(checked.size, routed.length, "every routed skill, including poteto-help itself");
  for (const name of routed) assert.equal(checked.has(name), true, `${name} is linked with a command label`);
});

test("no code span or the description names a bundled skill without its /skill: prefix", () => {
  const hostCommands = new Set(["/poteto-mode", "/reload", "/model"]);
  const bundled = new Set(skillDirs.map((name) => `/${name}`));
  const spans = [...helpSource.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].split(/\s+/)[0]);
  const offenders = spans.filter((token) => bundled.has(token) && !hostCommands.has(token));
  assert.deepEqual([...new Set(offenders)], []);
  assert.equal(bundled.has("/orchestrate"), false, "the slash menu example is not a bundled skill");
  const description = frontmatterField(helpFile, "description");
  const commands = [...description.matchAll(/\/([a-z][a-z0-9-]*)(?![\w:])/g)].map((match) => `/${match[1]}`);
  assert.deepEqual(commands.filter((token) => !hostCommands.has(token)), []);
});

test("every relative link in poteto-help resolves", () => {
  const broken = [];
  for (const match of helpSource.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
    if (!existsSync(resolve(helpDir, decodeURIComponent(target)))) broken.push(target);
  }
  assert.deepEqual(broken, []);
});

test("the routing table covers every non-principle skill in the package", () => {
  const routed = [...new Set([...helpSource.matchAll(/\]\(\.\.\/([a-z0-9-]+)\/SKILL\.md\)/g)].map((match) => match[1]))]
    .filter((name) => !name.startsWith("principle-"))
    .sort();
  const expected = skillDirs.filter((name) => name !== "poteto-help" && !name.startsWith("principle-")).sort();
  assert.deepEqual(routed, expected);
  assert.equal(skillDirs.filter((name) => name.startsWith("principle-")).length, 24);
  assert.match(helpSource, /The Principles section of \[`poteto-mode`\]\(\.\.\/poteto-mode\/SKILL\.md\) indexes them/);
});

test("every /skill: reference names a skill that exists", () => {
  const refs = [...new Set([...helpSource.matchAll(/\/skill:([a-z][a-z0-9-]*[a-z0-9])(?=[`\s<])/g)].map((match) => match[1]))].sort();
  assert.ok(refs.includes("poteto-mode"), "the mode skill is referenced by its command form");
  for (const name of refs) assert.equal(existsSync(join(skillsDir, name, "SKILL.md")), true, `${name} exists`);
});

test("the mode claim in poteto-help matches the extension that owns the mode", () => {
  const extension = readFileSync(join(pkgRoot, "extensions", "pstack", "index.ts"), "utf8");
  assert.match(extension, /const MODE_ENTRY = "pstack-mode"/);
  assert.match(extension, /pi\.registerCommand\("poteto-mode"/);
  assert.match(extension, /appendEntry\(MODE_ENTRY, \{ enabled: false \}\)/);
  const inputHook = extension.slice(extension.indexOf('pi.on("input"'), extension.indexOf('pi.on("before_agent_start"'));
  assert.match(inputHook, /\/\^\\\/skill:poteto-mode/);
  assert.match(inputHook, /appendEntry\(MODE_ENTRY, \{ enabled: true \}\)/);
  assert.match(helpSource, /The mode turns on only when the user runs `\/poteto-mode` or `\/skill:poteto-mode`/);
  assert.match(helpSource, /Reading the skill file or answering a help question does not/);
  assert.match(helpSource, /registers the command, appends a `pstack-mode` entry to the session/);
  assert.match(helpSource, /`\/poteto-mode off` disables it/);
  assert.doesNotMatch(helpSource, /mode stays on for the session/);
});

test("the confirmation-hook claim matches where the extension registers the hook", () => {
  const extension = readFileSync(join(pkgRoot, "extensions", "pstack", "index.ts"), "utf8");
  const confirmHook = extension.slice(extension.indexOf('pi.on("tool_call"'), extension.indexOf('pi.registerCommand("poteto-mode"'));
  assert.ok(confirmHook.length > 0, "the confirmation hook is registered before the command");
  assert.match(confirmHook, /knownExternalWrite/);
  assert.match(confirmHook, /ctx\.ui\.confirm/);
  assert.doesNotMatch(confirmHook, /potetoMode/, "confirmation does not wait for the mode");
  const modeGatedHook = extension.slice(extension.indexOf('pi.on("before_agent_start"'), extension.indexOf('pi.on("tool_call"'));
  assert.match(modeGatedHook, /if \(!potetoMode\) return/);
  assert.match(helpSource, /registers the confirmation hooks immediately, in every session and whatever the mode state/);
  assert.match(helpSource, /The sticky mode is the only part that waits for `\/poteto-mode`/);
  assert.doesNotMatch(helpSource, /Installing changes nothing/);
});

test("help states that disable-model-invocation hides the description without blocking a read", () => {
  assert.match(helpSource, /hides its description from the model and leaves the user in charge/);
  assert.match(helpSource, /That flag hides the description only, so an agent can still read any skill file/);
  assert.equal(frontmatterField(join(skillsDir, "poteto-mode", "SKILL.md"), "disable-model-invocation"), "true");
  assert.match(readFileSync(join(skillsDir, "poteto-mode", "SKILL.md"), "utf8"), /\/skill:technical-writing/);
});

test("help answers and hands back a prompt, and routes work requests to poteto-mode", () => {
  assert.match(helpSource, /For a help question, do not start the work\./);
  assert.match(helpSource, /is not a help question/);
  assert.match(helpSource, /Load \[`poteto-mode`\]\(\.\.\/poteto-mode\/SKILL\.md\) with that request instead, follow it for that request/);
  assert.match(helpSource, /never refuse the request because the help skill answered first/);
  assert.match(helpSource, /hand them a prompt they can send/);
});

test("poteto-help states provider ownership instead of assuming capabilities", () => {
  const banned = /pstack-models\.mdc|cursor-team-kit|control-ui|control-cli|~\/\.cursor|cursor\.com|Custom Mode|subagent_type|generalPurpose|durable-subagents\.json|AskQuestion|\/add-plugin|`\/deslop`|"\/deslop"/;
  assert.doesNotMatch(helpSource, banned);
  assert.match(helpSource, /ships no model or role mapping/);
  assert.match(helpSource, /A session with no compatible `subagent` tool has no delegation/);
  assert.match(helpSource, /A session with no `set_tasks` tool has no task tracking/);
  assert.match(helpSource, /eligible for model discovery/);
  assert.match(helpSource, /Eligibility is not a guarantee/);
  assert.match(helpSource, /no setting forces the model to invoke a skill on a matching question/);
  assert.doesNotMatch(helpSource, /loads from the user's words/);
});

test("the namespaced skills stay namespaced in the help map", () => {
  assert.match(helpSource, /\[\`\/skill:pstack-tdd\`\]\(\.\.\/pstack-tdd\/SKILL\.md\)/);
  assert.match(helpSource, /\[\`\/skill:pstack-teach\`\]\(\.\.\/pstack-teach\/SKILL\.md\)/);
  assert.doesNotMatch(helpSource, /`\/skill:tdd`|`\/skill:teach`/);
  assert.equal(existsSync(join(skillsDir, "tdd")), false);
  assert.equal(existsSync(join(skillsDir, "teach")), false);
});

test("the public link points at this fork, not the original repository", () => {
  const slug = new URL(pkg.repository.url).pathname.replace(/^\//, "");
  assert.match(helpSource, new RegExp(`https://github\\.com/${slug}/blob/main/`));
  assert.doesNotMatch(helpSource, /github\.com\/cursor\/plugins/);
});
