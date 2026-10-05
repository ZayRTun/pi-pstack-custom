---
name: poteto-help
description: Answers how to install, set up, use, or extend pstack, and which pstack skill, playbook, or principle fits a situation. Use for /skill:poteto-help, or when the user asks how to use pstack or which pstack skill fits. Not for requests to do work, even ones that name pstack.
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, do not start the work. A pstack run spends real tokens, so let the user send the prompt.

A request for work, such as "use pstack to fix this bug", is not a help question. Do the work. Load [`poteto-mode`](../poteto-mode/SKILL.md) with that request instead, follow it for that request, and say that reading it here does not turn the mode on. The mode turns sticky only when the user runs `/poteto-mode` or `/skill:poteto-mode`. Offer that command when the user wants the mode to persist, and never refuse the request because the help skill answered first.

This file maps questions to the skills and documents that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed package, which the user may not be able to open, so give the user the public copy at `https://github.com/ZayRTun/pi-pstack-custom/blob/main/` plus the path.

## Find out what they need

Infer the need from the message and the conversation. A named situation goes straight to its section. If the need is still unclear, ask one plain-text question listing these options, then answer only the section the user picks:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- `/poteto-mode` is a sticky per-session mode. This package's extension registers the command, appends a `pstack-mode` entry to the session, and `/poteto-mode off` disables it. The mode turns on only when the user runs `/poteto-mode` or `/skill:poteto-mode`. Reading the skill file or answering a help question does not. A new session starts with the mode off.
- `poteto-help` is the one bundled skill eligible for model discovery, so a question about pstack can reach it without a command. Eligibility is not a guarantee, because no setting forces the model to invoke a skill on a matching question. The user can always type `/skill:poteto-help`. Every other bundled skill sets `disable-model-invocation`, which hides its description from the model and leaves the user in charge. Those skills load through `/skill:<name>`, or as a step `/poteto-mode` runs. That flag hides the description only, so an agent can still read any skill file, and `/poteto-mode` reads the skills it names.
- A session with no compatible `subagent` tool has no delegation, so independent reviews and swarms report blocked. A session with no `set_tasks` tool has no task tracking, so the checklist stays in chat.

## Get set up

1. Load the package from Pi's package settings. `pi install git:github.com/ZayRTun/pi-pstack-custom` fetches the Git copy, and `pi install <path to this checkout>` loads a local one. A personal install writes `~/.pi/agent/settings.json`, and `--local` writes `.pi/settings.json`. Then run `/reload`.
2. Start a real task with `/poteto-mode`, a goal, and a check that can pass or fail.

Loading the package registers the confirmation hooks immediately, in every session and whatever the mode state, because the extension registers that hook itself rather than waiting for a skill. The sticky mode is the only part that waits for `/poteto-mode`. [README.md](../../README.md) covers the optional Sub-agent provider and the confirmation hooks. [FORK.md](../../FORK.md) covers maintenance from the original project.

Cost comes from delegation. Fewer delegates and a shorter run cost less. This package ships no model or role mapping, so pick a model with Pi's `/model`; a delegation provider configures roles, pools, or per-agent pins through its own interface and its own files. Save `/poteto-mode` for work that needs rigor.

## Start a task with `/poteto-mode`

`/poteto-mode` matches the task to a playbook, turns that playbook's steps into the task list the session has, and runs the other skills as those steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it is done. It does not list skills, because a hand-written sequence tends to drop or reorder steps the playbook keeps.

The mode persists for the session once the user starts it with `/poteto-mode` or `/skill:poteto-mode`, and `/poteto-mode off` disables it. Both commands enable the same mode, and `/skill:poteto-mode <task>` also loads the skill with the task. A help question that only reads the skill does not enable it. Mid-chat, "new task" makes the mode match a fresh playbook.

## Pick a skill

The default answer is `/poteto-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/poteto-mode`](../poteto-mode/SKILL.md) |
| Know how code works now, or where new code should live | [`/skill:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/skill:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/skill:pstack-teach`](../pstack-teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/skill:recall`](../recall/SKILL.md) |
| Know what a small diff could break outside itself | [`/skill:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/skill:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/skill:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers | [`/skill:swarm`](../swarm/SKILL.md) |
| Have several models review a diff and try to break it | [`/skill:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/skill:pstack-tdd`](../pstack-tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/skill:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/skill:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/skill:unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/skill:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/skill:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/skill:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/skill:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/skill:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/skill:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/skill:show-me-your-work`](../show-me-your-work/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/skill:automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/skill:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/skill:correct`](../correct/SKILL.md) |
| Find their way around pstack | [`/skill:poteto-help`](SKILL.md) |

Close calls:

- `/skill:how` explains what the code does. `/skill:why` explains the reasons. `/skill:pstack-teach` runs one or both and explains the result plainly.
- `/skill:arena` gives every worker the same brief and merges the best parts. `/skill:swarm` splits work into slices or a race and returns one report.
- `/skill:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/skill:interrogate` reviews the diff. `/skill:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/skill:recall` rebuilds context across recent chats. Resuming one specific chat or branch is the Session pickup playbook.
- `/skill:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in this package:

- `setup-pstack` and `make-bot-ui` are Cursor-specific and excluded, with the reasons recorded in `provenance.json`.
- pstack has no `/orchestrate` skill. Orchestrate is a `/poteto-mode` playbook. If the slash menu shows `/orchestrate`, another package provides it.

## Playbooks and principles

Playbooks are step lists inside `/poteto-mode`, not skills, so they have no slash command. Describing the task inside the mode picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It does not merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. For work that spans phases or stacked PRs, asking `/poteto-mode` for a plan runs the [Multi-phase plan playbook](../poteto-mode/playbooks/multi-phase-plan.md), which writes the plan and does not implement it. For a design question, the [Prototype playbook](../poteto-mode/playbooks/prototype.md) or `/skill:architect` settles it in code first.

Principles are one-rule skills that `/poteto-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." The Principles section of [`poteto-mode`](../poteto-mode/SKILL.md) indexes them, and `/skill:principle-<name>` loads one on demand. Two examples are [Prove It Works](../principle-prove-it-works/SKILL.md) and [Explain the Number](../principle-explain-the-number/SKILL.md).

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | The mode is per session. Start each session with `/poteto-mode`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn does not need the mode. |
| Runs cost more than expected | Delegation spends the tokens. Run fewer delegates, or shorten the run. |
| A skill did not load on its own | Only `poteto-help` is eligible for model discovery, and no setting forces the model to invoke even that one. Type `/skill:<name>`, or let `/poteto-mode` load it as a step. |
| Parallel agents overwrote each other | Give each agent its own checkout when the provider supports one. Do not assume it does. |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That is the prove-it-works principle. |

## Make pstack my own

- [`/skill:automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/poteto-mode`.
- [`/skill:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, then the link to that file. Keep it short unless the user asked for the whole map.
