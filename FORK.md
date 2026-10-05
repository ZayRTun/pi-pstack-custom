# Maintain this pstack fork

Pi loads this checkout as a local package named `@zayar/pi-pstack`. It is not published to a registry by default. Pstack and an optional Sub-agent provider are separate extensions. Neither imports, installs, or starts the other.

## Definition ownership

This package owns `agents/poteto-agent.md` and `agents/comment-sicko.md`. A provider that composes agent directories can include this package's `agents` directory alongside its own definitions, so both sets load together. That composition is provider configuration, not code in this package.

Optional example, for a provider that composes directories through a JSON setting:

```json
{
  "agentDirectories": [
    "agents",
    "<absolute path to this package>/agents"
  ]
}
```

Read the provider's own documentation for the exact key, its default, and how it resolves a relative path. A relative `agents` entry resolves from the config file, and JSON does not expand `$HOME`, so an absolute package path is written out instead. Without extra directories, a composing provider defaults to its own `<agent dir>/agents`. Removing this package's directory leaves the provider's own definitions usable. Reload after changing the setting.

The packaged `poteto-agent` uses definition-relative references to its owning skills. The provider supplies the real definition location in its instructions. Other compatible providers must supply that location, or the caller must supply the package location. If it is unavailable, the Agent reports the gap rather than searching another installation.

## Use pstack independently

Pstack's skills and `/poteto-mode` work without any Sub-agent or task-tracking extension. It reports unavailable delegation and task tracking. Nonessential single-agent work can proceed with an explicitly non-persisted checklist. Independent reviews and swarms block when they lack a compatible delegation provider. Pstack does not provide a competing `subagent` tool.

A compatible Sub-agent provider is optional. Its execution semantics come from its own tool declarations and documentation. Pstack does not assume that every provider has batch, worktree, or recovery capabilities.

## Skill namespacing

This package ships the original pstack skills under `/pstack-tdd` and `/pstack-teach`. Separate skills, such as Matt Pocock's `/tdd` and `/teach`, can retain their names when both sets are installed. The namespace avoids collisions without changing those separately installed skills.

## Keep one active pstack package

Load one pstack package at a time, either this checkout or another, never both, because two copies of the same skill names collide. If the checkout moves, update the local package entry and any optional definition-directory entry together. The packaged Agent contains no machine-specific checkout path.

## Update from the original

This package integrates directly from Cursor's pstack. The update source is `https://github.com/cursor/plugins`, subtree `pstack`. `provenance.json` at this checkout's root records the pin.

| Record | Value |
|:---|:---|
| Original repository | `https://github.com/cursor/plugins`, subtree `pstack` |
| Imported original | `e43c7ee26e0038c6c1fa8380dd34ce86ff94cb2a`, version `0.15.9` |
| Imported-from base | `53e579f1481697931fc44f5445171397cfa2b24b`, version `0.15.2` |
| Historical Pi port | `casualjim/pi-mimir` at `577aa5571817c0096f243fe1b02cc5adf147f0ab`, package `0.1.10` |

`casualjim/pi-mimir` is historical lineage. That port is where this package's Pi adaptations came from, and it is never an update source again. Do not add a git remote that points at it for updates. The fork's own package version (`0.1.10`) is separate from the original's version (`0.15.9`) and does not track it.

Integration is manual and reviewed. Nothing here merges, rebases, or copies a tree for you, and `pi update --extensions` does not synchronize this checkout with either repository.

1. Run `npm run check:upstream` from this checkout's root. It resolves the latest original commit, then reports the `pstack` subtree paths added, removed, or modified since the pin. It writes nothing into the checkout.
2. Export the two original trees and diff the delta: the currently imported pin from `provenance.json.original.commit`, and the candidate commit the checker printed. Extract each subtree in a temp directory. `originalBase` records the previous integration base and is not the base for the next update.
3. Apply the old-to-new delta to the local tree with a three-way merge per file, mapping skill directories through `provenance.json.skillNameMappings` (`tdd` to `pstack-tdd`, `teach` to `pstack-teach`). Never replace the local tree or copy an upstream file wholesale; the local tree carries provider-neutral adaptations this package needs.
4. Resolve the overlapping workflows by hand. Keep the fork's own model and tool mechanics, definition-relative resource paths, closed tool allowlists, namespaced skill references, `@zayar` identity, the optional-capability behavior, and the modified Pi frontmatter. Take upstream's provider-neutral content: new skills, new red flags, new playbook rules.
5. Move the previously imported commit and version to `originalBase`, then record the new imported commit and version in `original`. Record any new exclusion with its reason.
6. Run the checks below, then `/reload` and inspect resource diagnostics.

### Update the provenance and exclusions

`check:upstream` reports excluded paths too, so a change to `docs/`, `assets/`, `automations/`, `.cursor-plugin/`, `skills/setup-pstack/`, or `skills/make-bot-ui/` is expected noise. Add an exclusion only with a reason that says why the path cannot work in Pi.

### The checks

```sh
(cd skills/poteto-mode/scripts && bun install --frozen-lockfile)
npm run check:upstream
npm test
npm run typecheck
PI_OFFLINE=1 node --experimental-strip-types tests/pi-host-preflight.mjs
PI_OFFLINE=1 PI_DURABLE_EXTENSION="<path to a compatible Sub-agent extension entry point>" node --experimental-strip-types tests/pi-host-preflight.mjs
```

`npm test` runs `bun tests/agents-contract.ts`, then `bun test`. `bun test` covers `tests/skill-names.test.mjs`, `tests/pstack-upstream-contract.test.mjs`, `tests/check-upstream.test.mjs`, `tests/package-resource-resolution.test.mjs`, `extensions/pstack/capabilities.test.ts`, and the poteto-mode tool tests under `skills/poteto-mode/scripts/`. A first run auto-installs the tool dependencies; the explicit `bun install --frozen-lockfile` above makes that install deterministic. `node --test tests/*.test.mjs` runs the portable `.mjs` tests under Node's own runner.

`check:upstream` exits `0` when it produced a report and `1` when the pinned version now points at a different commit, which means the pin is stale or its history was rewritten. A report with in-scope changes still exits `0`: changes need review, not failure.

`typecheck` needs the Pi SDK and `@types/node` on the module path. Without a package install it may not resolve; install package development dependencies deliberately if the types matter for the change.

### What the checks cover

The contract tests check the added skills and the references that point at them, that every relative reference in `skills/` and `agents/` resolves, that every principle skill is indexed by `poteto-mode`, that no Cursor-only model or tool token remains, that the provenance record matches the skills on disk and its exclusions stay absent, and that the drift checker's reports and errors are literal.

The host preflight checks pstack alone, an optional Sub-agent provider alone when its entry point is supplied, and their optional composition. It uses a scripted provider and real file reads with no paid model calls. Set `PI_DURABLE_EXTENSION` to test another compatible Sub-agent entry point, `PI_SDK_ROOT` to override SDK discovery, and `PI_EVIDENCE_DIR` to save evidence.

## Check behavior

Development SDK declarations target Pi 1.0.2. These checks do not install the root package's development dependencies, so `typecheck` may not resolve until you install them deliberately; reconcile lockfiles before publishing. The poteto-mode tools under `skills/poteto-mode/scripts/` keep their own `bun.lock` and install independently. Also run any optional Sub-agent provider's tests and typechecks independently.

`.github/workflows/ci.yml` runs the portable `node --test` files, the agents contract, and `bun test` on Node 22 with a pinned Bun. It publishes nothing, merges nothing, and makes no model calls.

The confirmation patterns are not a shell sandbox. Tool selection does not enforce read-only behavior or filesystem isolation. These checks do not validate every bundled workflow or establish unrestricted autonomous operation.
