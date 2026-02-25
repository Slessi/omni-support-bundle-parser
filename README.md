# Omni Support Bundle Parser

A browser-based diagnostic viewer for [Omni](https://omni.siderolabs.com/) support bundles. No server, no install — open the page, load a bundle, explore.

**Live:** https://slessi.github.io/omni-support-bundle-parser/

---

## Usage

1. Open the page (or `index.html` locally in any modern browser)
2. Click **Open Directory** and select an extracted support bundle folder, **or** click **Open ZIP** to load a `.zip` archive directly
3. Drag-and-drop of either a folder or a `.zip` is also supported

### Generating a bundle

From the Omni UI, navigate to your cluster → **Support Bundle** → Download. Alternatively, via `omnictl`:

```sh
omnictl support --cluster <cluster-name> support.zip
```

---

## Features

| View | What it shows |
|---|---|
| **Overview** | Cluster health, machine counts, Kubernetes/Talos versions, upgrade status, load balancer status, alerts |
| **Machines** | Sortable, filterable table of all machines with hardware specs and expandable detail rows |
| **Machine Sets** | Per-set breakdown of control-plane and worker groups with per-machine status |
| **Node Diagnostics** | Per-node: top processes (by CPU), disk mount usage, service logs, Talos resources |
| **Logs** | Unified log viewer with level filter and text search, covering: machine logs, dmesg, Talos service logs, controller-runtime, and Kubernetes pod logs |
| **Resources** | Collapsible browser for all raw YAML resource files with syntax highlighting |

---

## Local development

No build step. Edit the files and reload the browser.

```sh
cd omni-support-bundle-parser

# Any static file server works, e.g.:
python3 -m http.server 8080
# then open http://localhost:8080
```

The CDN dependencies (`js-yaml`, `jszip`) are loaded from jsDelivr. An internet connection is required on first load; after that the browser cache takes over.

---

## Disclaimer

> **This project was generated entirely by [Claude](https://claude.ai/) (Anthropic), an AI assistant.**
>
> The code was produced through a conversation in which Claude explored the Omni codebase and a sample support bundle, then designed and wrote all HTML, CSS, and JavaScript. No human-authored code was written for this project.

---

## Tech

- Vanilla HTML / CSS / JavaScript — no framework, no build tooling
- [`js-yaml`](https://github.com/nodeca/js-yaml) for YAML parsing
- [`jszip`](https://stuk.github.io/jszip/) for in-browser ZIP extraction
- Hosted on GitHub Pages
