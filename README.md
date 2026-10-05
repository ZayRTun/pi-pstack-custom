# Personal pi-pstack

This package provides pstack skills, sticky Poteto Mode, shell-command confirmation hooks, and bundled Agent definitions. It registers no Sub-agent or task-tracking tools and does not require a delegation extension.

## Use pstack alone

Load this package through Pi's package settings. Run `/poteto-mode` to enable the style for the session, or `/poteto-mode off` to disable it. Skills and commands load without a delegation provider. Workflows that need independent delegates still require that optional capability.

Poteto Mode reports whether delegation and task tracking are available. Without task tracking, use an explicitly non-persisted in-chat checklist. Without delegation, perform authorized single-agent work when independent results are not required. Swarms and independent reviews must report that they are blocked rather than fabricate independent workers.

Only one pstack package should be active. This checkout is not published. See [personal maintenance instructions](FORK.md) for the manual integration process and the check commands.

## Add an optional Sub-agent provider

A compatible provider accepts `subagent({ agent: "poteto-agent", task: "..." })`, loads explicit Agent definitions, and returns their results. The provider must supply the definition's source location or the caller must supply the package location so relative skill references can be resolved. Optional model, role, batch, worktree, and recovery parameters come from the provider's declared interface, not from pstack.

Configure the provider to read this package's `agents/` directory. No copies, symlinks, or automatic installation are required. The directory contains `poteto-agent` and `comment-sicko`. The leaf definitions declare closed tool allowlists and report missing authorized capabilities.

Durable Subagent is a compatible optional provider. The operator can add this package's Agent directory to its generic `agentDirectories` setting. Neither extension imports, installs, or starts the other. Removing that configuration leaves Durable's independent default Agent directory intact.

The legacy `pi-herdr-subagents:roles:discover:v1` event remains available to providers that use it. No event listener is required for pstack startup.

## Choose the namespaced skills

This fork declares `pstack-tdd` and `pstack-teach`. It leaves the unqualified names available for other installed skills. Package updates must preserve internal references to the namespaced skills.

## Safety

The extension requests confirmation for recognizable shell commands that push, change pull requests, deploy, mutate infrastructure, or recursively delete files. It blocks those recognized calls when it cannot request confirmation. This is not a shell sandbox or a guarantee over all external actions. Other tools and delegated execution need their own permission enforcement.

Agent instructions do not enforce filesystem isolation. Available capabilities do not imply authorization. Pstack reports unsupported required capabilities without widening tool permissions or bridging another session's task list.

## License and provenance

Derived from Cursor's pstack, under MIT. Original license and attribution remain in [LICENSE](LICENSE). This standalone repository lives at `https://github.com/ZayRTun/pi-pstack-custom`.

`provenance.json` records the pin: `https://github.com/cursor/plugins`, subtree `pstack`, commit `e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a`, version `0.15.9`. The first Pi port came from `casualjim/pi-mimir` at `577aa5571817c0096f243fe1b02cc5adf147f0ab`; that lineage is historical, and the original repository is the update source. This package's own version is separate from the original's. Run `npm run check:upstream` to diff the pinned subtree against the latest original commit without writing to the checkout.
