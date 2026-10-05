import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { workflowCapabilityNotice } from "./capabilities.js";

function notice(tools: { name: string; exposure?: string }[], active: string[]): string {
  return workflowCapabilityNotice({ getAllTools: () => tools, getActiveTools: () => active } as Pick<ExtensionAPI, "getAllTools" | "getActiveTools">);
}

test("standalone mode reports missing delegation and tracking", () => {
  const result = notice([], []);
  assert.match(result, /Task tracking is unavailable/);
  assert.match(result, /No compatible Sub-agent tool is available/);
  assert.match(result, /non-persisted/);
  assert.match(result, /blocked/);
});

test("active provider and callable tracking are optional capabilities", () => {
  const result = notice([{ name: "subagent", exposure: "model-only" }, { name: "set_tasks", exposure: "codemode" }], ["subagent", "codemode"]);
  assert.match(result, /Task tracking is available/);
  assert.match(result, /A Sub-agent tool is available/);
});

test("hidden and inactive tools do not become available by registration", () => {
  const result = notice([{ name: "subagent", exposure: "hidden" }, { name: "set_tasks", exposure: "model-only" }], ["subagent", "codemode"]);
  assert.match(result, /Task tracking is unavailable/);
  assert.match(result, /No compatible Sub-agent tool is available/);
});
