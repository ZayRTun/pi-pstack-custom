---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N independent Sub-agents using an available compatible delegation provider. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Use `set_tasks` when available and authorized. Otherwise report the tracking gap and keep a non-persisted in-chat checklist. Delegation is required for this workflow; if no compatible provider is available, report it as blocked.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers. Respect the provider's declared per-call and concurrency limits.
4. Use the provider's model-selection interface. Request the `swarm workers` role only when the tool supports role pools. Inspect and report fallback behavior instead of assuming it. An `auto` or `inherit-parent` value means the parent model, so omit `model` for it. For a model race, name each arm's supported model up front.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Use `agent: "poteto-agent"` unless a workflow names another Agent definition. Use only supported batch and isolation parameters. Request explicit worktrees when the provider supports them and parallel writes are authorized. Give workers disjoint writable locations. If calls are sequential, report sequential coverage rather than claiming a parallel race. Block when simultaneous execution is essential but unavailable.

Choose a base commit or branch through the provider's documented worktree interface. Do not assume uncommitted parent changes appear in a checkout. Inspect retained output before integration. Merging, pushing, and publishing remain separate actions.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
