import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function workflowCapabilityNotice(pi: Pick<ExtensionAPI, "getAllTools" | "getActiveTools">): string {
  const tools = pi.getAllTools();
  const active = new Set(pi.getActiveTools());
  const available = (name: string): boolean => {
    const tool = tools.find((entry) => entry.name === name);
    if (!tool || tool.exposure === "hidden") return false;
    if (active.has(name)) return true;
    return (tool.exposure === "codemode" || tool.exposure === "deferred") && active.has("codemode");
  };
  const tracking = available("set_tasks")
    ? "Task tracking is available. Use it only within the authorized context."
    : "Task tracking is unavailable. Report the gap and use a non-persisted in-chat checklist; do not claim a saved task list.";
  const delegation = available("subagent")
    ? "A Sub-agent tool is available. Inspect its schema and capabilities before use; do not assume provider-specific behavior."
    : "No compatible Sub-agent tool is available. Report the gap. Perform authorized single-agent work only when independence is not essential; otherwise report the workflow as blocked.";
  return `${tracking}\n${delegation}`;
}
