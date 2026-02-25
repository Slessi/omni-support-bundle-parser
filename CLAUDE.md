# Omni Support Bundle Parser — Claude Context

This file is read automatically by Claude Code at the start of every session.

## What this project is

A **zero-dependency, single-page browser app** that parses and visualises [Omni](https://omni.siderolabs.com/) support bundles. No build step, no server. Hosted on GitHub Pages at https://slessi.github.io/omni-support-bundle-parser/.

The Omni product lives at `~/Projects/siderolabs/omni`. The sample bundle used during development is at `~/Downloads/support/` (extracted) and `~/Downloads/support.zip`.

## File structure

```
index.html   — App shell; loads CDN scripts (js-yaml@4, jszip@3) then the three JS files below
style.css    — All styles; dark theme, self-contained
parser.js    — File loading (directory input, ZIP, drag-drop) + all data parsing
render.js    — Pure functions that return HTML strings for each view; no direct DOM writes
app.js       — State object (S), navigation, event binding, async loaders
```

**Rendering pattern:** `render.js` functions return HTML strings. `app.js` sets `main.innerHTML` then immediately calls a `bind*Events()` function to attach listeners. State lives entirely in the `S` object in `app.js`.

## State object (app.js)

```js
S = {
  data: null,          // populated by parseBundle(); see Data model below
  view: 'overview',    // current nav item
  machines: { sort, filter, expanded },
  logs:      { selected },          // path of currently open log file
  nodes:     { selected, tab },     // selected node IP + active tab
  resources: { selected, content, groups },
}
```

## Data model (output of parseBundle)

```js
{
  cluster: {
    id, kubernetesVersion, talosVersion, created, updated,
    labels, features, status, bootstrapped, lbHealthy, talosUpgrade, k8sUpgrade
  },
  machines: [{
    id, hostname, role ('controlplane'|'worker'), machineSet,
    talosVersion, connected, lastError, platform, addresses, nodeIp,
    hardware: { cpuCores, cpuThreads, cpuFreqMhz, cpuManufacturer, memMb, disks },
    clusterStatus: { ready, stage, configUpToDate, lastConfigError, configApplyStatus },
    schematic, securityState, created, updated
  }],
  machineSets: [{ id, role, status }],
  nodeIps: ['10.15.1.x', ...],     // IPs derived from directory names in the bundle
  nodeSummaries: { ip: rawText },  // contents of {ip}/summary
  machineLogs:  [{ id, path, hostname }],     // omni/machine-logs/{uuid}.log
  serviceLogs:  [{ ip, service, path, type }], // type: jsonl|controller-runtime|kubernetes
  dmesgLogs:    [{ ip, path, hostname }],
  resGroups: { TypeName: [{ path, id, res }] },
  files: { relativePath: File }    // raw file map for lazy loading
}
```

## Bundle directory structure

```
{bundle-root}/
  omni/
    resources/          — 470 YAML files (Omni CRD resources)
    machine-logs/       — {uuid}.log per machine (JSONL kernel logs via SideroLink)
  {ip}/                 — one directory per node (e.g. 10.15.1.122/)
    summary             — talosctl version output (plain text)
    processes           — space-separated process table
    mounts              — space-separated mount/usage table
    dmesg.log           — kernel log (custom text format, see below)
    controller-runtime.log — Talos controller log (ANSI text)
    service-logs/       — {service}.log + {service}.state (JSONL)
    kubernetes-logs/
      kube-system/      — {pod}.log (CRI format)
    resources/          — 73 YAML files (Talos node resources)
  kubernetesResources/
    nodes.yaml          — Kubernetes Node objects
    systemPods.yaml     — kube-system pod specs
```

## Log formats and parsers (parser.js)

| File pattern | Format | Parser function |
|---|---|---|
| `omni/machine-logs/*.log` | JSONL: `{"talos-level":"info","talos-time":"...","msg":"..."}` | `parseLogLines` |
| `{ip}/service-logs/*.log` | Same JSONL | `parseLogLines` |
| `{ip}/dmesg.log` | `kern:    info: [2026-02-08T06:56:25Z]: message` | `parseDmesgLines` |
| `{ip}/controller-runtime.log` | `2026-02-24T02:09:34Z \x1b[35mDEBUG\x1b[0m message` (ANSI) | `parseControllerRuntimeLines` |
| `{ip}/kubernetes-logs/**/*.log` | CRI: `2025-12-24T21:47Z stderr F I1224 21:47:08 1 file.go:10] msg` | `parseKubeLogLines` |

The correct parser is selected in `loadLog()` in `app.js` by matching on path.

## Key enums (parser.js)

```js
CLUSTER_PHASES  = { 0:Unknown, 1:Scaling Up, 2:Scaling Down, 3:Running, 4:Destroying }
MACHINE_STAGES  = { 0:Unknown, 1:Booting, 2:Installing, 3:Maintenance, 4:Running,
                    5:Rebooting, 6:Shutting Down, 7:Resetting, 8:Upgrading }
UPGRADE_PHASES  = { 0:Unknown, 1:Upgrading, 2:Done, 3:Failed }
```

## YAML resource naming convention

Omni resource files follow: `{Type}.{domain}-{id}.yaml`, e.g.
`MachineStatuses.omni.sidero.dev-0091cc88-9aa9-4c50-b573-e52382ac2c72.yaml`

The type name used for grouping is everything before the first `.` in `metadata.type`.

## Omni product references

- Support bundle collection code: `~/Projects/siderolabs/omni/internal/backend/grpc/support.go`
- Proto definitions: `~/Projects/siderolabs/omni/client/api/omni/specs/omni.proto`
- Resource types: `~/Projects/siderolabs/omni/client/pkg/omni/resources/omni/`
- Docs: https://docs.siderolabs.com/

## Design conventions

- **No framework.** Vanilla JS only. Prefer editing existing files over adding new ones.
- **HTML strings, not DOM nodes.** Render functions return template-literal strings. Use `esc()` on all untrusted values.
- **Lazy file reads.** Only `omni/resources/*.yaml` and `{ip}/summary` are read eagerly. Logs and node data are read on demand in `loadNodeTab` / `loadLog`.
- **CSS variables** for all colours — defined in `:root` in `style.css`. The accent is `--accent: #f97316` (orange, matching Siderolabs brand).
- **No external state management.** Everything is in `S`. Re-render by calling `navigate(S.view)` or the relevant `render*` + `bind*Events` pair directly.

## Adding a new view

1. Add a `<div class="nav-item" data-view="myview">` in `index.html`
2. Write `renderMyView()` in `render.js` returning an HTML string
3. Add a `case 'myview':` in the `render()` switch in `app.js`
4. If the view needs event listeners, write `bindMyViewEvents()` and call it from the `case`

## Adding a new log parser

1. Write `parseXyzLines(text)` in `parser.js` returning `[{ time, level, msg }]`
2. Add a condition in `loadLog()` in `app.js` to call it when the path matches
3. If the files need to be surfaced in the Logs left panel, extend the `serviceLogs` or `dmesgLogs` collection in `parseBundle()`

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/pages.yml`) deploys automatically.
GitHub Pages source must be set to **GitHub Actions** (not branch) in repo Settings → Pages.
