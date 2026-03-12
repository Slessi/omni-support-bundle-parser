# Omni Support Bundle Parser — Claude Context

This file is read automatically by Claude Code at the start of every session.

## What this project is

A **zero-server, single-page browser app** that parses and visualises [Omni](https://omni.siderolabs.com/) support bundles. Built with Vite + React 18 + TypeScript + Tailwind CSS v4. Hosted on GitHub Pages at https://slessi.github.io/omni-support-bundle-parser/.

The Omni product source is at https://github.com/siderolabs/omni. A sample bundle (extracted directory or `.zip`) is needed for local testing — generate one from the Omni UI or via `omnictl support --cluster <name> support.zip`.

## Stack

- **Vite 6** + **React 18** + **TypeScript** (strict)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- **js-yaml** + **jszip** as npm packages (no CDN scripts)
- State: `useReducer` + `Context` (`src/state/`)
- Zero external state management libs

## File structure

```
src/
  main.tsx              — ReactDOM.createRoot mount
  App.tsx               — Top-level router (view switch)
  index.css             — Global styles (dark theme CSS vars + custom classes)
  vite-env.d.ts         — Vite/TS declarations
  state/
    types.ts            — AppState, Action, View types
    reducer.ts          — Pure reducer; initialState exported
    context.tsx         — AppProvider + useApp() hook
  parser/
    parser.ts           — All parsing logic (ported from parser.js); parseBundle(files, onProgress)
    types.ts            — ParsedBundle, Machine, Cluster, LogLine, etc.
  components/
    layout/
      Sidebar.tsx       — Left nav; dispatches SET_VIEW
      UploadScreen.tsx  — Dir/ZIP/drag-drop input; calls parseBundle
      LoadingScreen.tsx — Spinner shown during parse
    overview/Overview.tsx
    machines/Machines.tsx
    machineSets/MachineSets.tsx
    nodes/Nodes.tsx
    logs/Logs.tsx
    resources/Resources.tsx
  utils/
    esc.ts              — HTML escaping (for dangerouslySetInnerHTML)
    format.ts           — fmtDate, fmtMem, fmtBytes, fmtFreq, fmtTime, phaseColor, stageColor
    syntaxHighlight.ts  — syntaxHighlightYaml (returns HTML string)
```

## Dev workflow

```sh
npm run dev    # start Vite dev server
npm run build  # tsc -b && vite build → dist/
```

## State model (src/state/types.ts)

```ts
type View = 'overview' | 'machines' | 'machinesets' | 'nodes' | 'logs' | 'resources';

interface AppState {
  data: ParsedBundle | null;
  view: View;
  loading: boolean;
  loadingMsg: string;
  machines: { sort: MachineSort; filter: MachineFilter; expanded: string | null };
  logs: { selected: string | null; lines: LogLine[]; filter: string; levelFilter: string };
  nodes: { selected: string | null; tab: string };
  resources: { selected: string | null; content: string | null; groups: Record<string, boolean> };
}
```

Key actions: `SET_LOADING`, `BUNDLE_LOADED`, `LOAD_ERROR`, `SET_VIEW`, `SELECT_LOG`, `SET_LOG_FILTER`, `SELECT_NODE`, `SET_NODE_TAB`, `SELECT_RESOURCE`, `TOGGLE_MACHINE`, `SET_MACHINE_SORT`, `SET_MACHINE_FILTER`, `TOGGLE_RES_GROUP`.

## Data model (output of parseBundle)

```ts
ParsedBundle {
  cluster: Cluster | null,
  machines: Machine[],
  machineSets: MachineSet[],
  nodeIps: string[],
  nodeSummaries: Record<string, string>,
  machineLogs: { id, path, hostname }[],
  serviceLogs: { ip, service, path, type }[],
  dmesgLogs:   { ip, path, hostname }[],
  resGroups: Record<string, { path, id, res? }[]>,
  files: FileMap,
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
    dmesg.log           — kernel log (custom text format)
    controller-runtime.log — Talos controller log (ANSI text)
    service-logs/       — {service}.log + {service}.state (JSONL)
    kubernetes-logs/
      kube-system/      — {pod}.log (CRI format)
    resources/          — 73 YAML files (Talos node resources)
  kubernetesResources/
    nodes.yaml          — Kubernetes Node objects
    systemPods.yaml     — kube-system pod specs
```

## Log formats and parsers (parser.ts)

| File pattern | Format | Parser function |
|---|---|---|
| `omni/machine-logs/*.log` | JSONL: `{"talos-level":"info","talos-time":"...","msg":"..."}` | `parseLogLines` |
| `{ip}/service-logs/*.log` | Same JSONL | `parseLogLines` |
| `{ip}/dmesg.log` | `kern:    info: [2026-02-08T06:56:25Z]: message` | `parseDmesgLines` |
| `{ip}/controller-runtime.log` | `2026-02-24T02:09:34Z DEBUG message` (ANSI stripped) | `parseControllerRuntimeLines` |
| `{ip}/kubernetes-logs/**/*.log` | CRI: `2025-12-24T21:47Z stderr F I1224 21:47:08 1 file.go:10] msg` | `parseKubeLogLines` |

`parseLogFile(path, text)` is a convenience dispatcher used in `Logs.tsx`.

## Key enums (parser.ts exports)

```ts
CLUSTER_PHASES  = { 0:Unknown, 1:Scaling Up, 2:Scaling Down, 3:Running, 4:Destroying }
MACHINE_STAGES  = { 0:Unknown, 1:Booting, 2:Installing, 3:Maintenance, 4:Running,
                    5:Rebooting, 6:Shutting Down, 7:Resetting, 8:Upgrading }
UPGRADE_PHASES  = { 0:Unknown, 1:Upgrading, 2:Done, 3:Failed }
```

## Design conventions

- **CSS variables** for all colours — defined in `src/index.css` `:root`. Accent = `#f97316`.
- **Lazy file reads.** Only omni resources + node summaries are read eagerly in `parseBundle`. Logs and node tabs are read on demand.
- **dangerouslySetInnerHTML** used in `YamlViewer` / `NodeResourcesList` for YAML syntax highlighting via `syntaxHighlightYaml()`. Always call `esc()` on untrusted strings first (syntaxHighlightYaml does this internally).
- **No extra abstractions.** Keep components focused; avoid over-engineering.

## Adding a new view

1. Add to the `View` union in `src/state/types.ts`
2. Add a `case` in `App.tsx`'s `views` map
3. Add a `NAV_ITEMS` entry in `Sidebar.tsx`
4. Write the component in `src/components/<view>/`

## Adding a new log parser

1. Write `parseXyzLines(text: string): LogLine[]` in `parser.ts`
2. Add a condition in `parseLogFile()` in `parser.ts`
3. If surfaced in the left panel, extend `serviceLogs` / `dmesgLogs` collection in `parseBundle()`

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/pages.yml`) runs `npm ci && npm run build` then deploys `dist/` to GitHub Pages.
GitHub Pages source must be set to **GitHub Actions** (not branch) in repo Settings → Pages.

## Omni product references

- Support bundle collection: [`internal/backend/grpc/support.go`](https://github.com/siderolabs/omni/blob/main/internal/backend/grpc/support.go)
- Proto definitions: [`client/api/omni/specs/omni.proto`](https://github.com/siderolabs/omni/blob/main/client/api/omni/specs/omni.proto)
- Resource types: [`client/pkg/omni/resources/omni/`](https://github.com/siderolabs/omni/tree/main/client/pkg/omni/resources/omni)
- Docs: https://docs.siderolabs.com/
