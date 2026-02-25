// ════════════════════════════════════════
// APPLICATION STATE
// ════════════════════════════════════════

const S = {
  data: null,
  view: 'overview',
  machines: {
    sort:     { col: 'hostname', dir: 1 },
    filter:   { role: '', status: '', search: '' },
    expanded: null,
  },
  logs:      { selected: null },
  nodes:     { selected: null, tab: 'processes' },
  resources: { selected: null, content: null, groups: {} },
};

// ════════════════════════════════════════
// SCREEN MANAGEMENT
// ════════════════════════════════════════

function showScreen(id) {
  ['screen-upload', 'screen-loading', 'screen-app'].forEach(s => {
    document.getElementById(s).hidden = (s !== id);
  });
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════

function navigate(view) {
  S.view = view;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );
  render();
}

function render() {
  const main = document.getElementById('main');
  switch (S.view) {
    case 'overview':    main.innerHTML = renderOverview();    break;
    case 'machines':    main.innerHTML = renderMachines();    bindMachineEvents(); break;
    case 'machinesets': main.innerHTML = renderMachineSets(); break;
    case 'nodes':       main.innerHTML = renderNodes();       bindNodeEvents();    break;
    case 'logs':        main.innerHTML = renderLogs();        bindLogEvents(); if (S.logs.selected) loadLog(S.logs.selected); break;
    case 'resources':   main.innerHTML = renderResources();   bindResourceEvents(); break;
  }
}

// ════════════════════════════════════════
// EVENT BINDING: MACHINES
// ════════════════════════════════════════

function bindMachineEvents() {
  document.getElementById('m-search')?.addEventListener('input', e => {
    S.machines.filter.search = e.target.value;
    refreshMachineTable();
  });
  document.getElementById('m-role')?.addEventListener('change', e => {
    S.machines.filter.role = e.target.value;
    refreshMachineTable();
  });
  document.getElementById('m-status')?.addEventListener('change', e => {
    S.machines.filter.status = e.target.value;
    refreshMachineTable();
  });

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (S.machines.sort.col === col) S.machines.sort.dir *= -1;
      else { S.machines.sort.col = col; S.machines.sort.dir = 1; }
      refreshMachineTable();
    });
  });

  document.getElementById('machine-tbody')?.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-machine]');
    if (!tr) return;
    const id = tr.dataset.machine;
    S.machines.expanded = S.machines.expanded === id ? null : id;
    refreshMachineTable();
  });
}

function refreshMachineTable() {
  const filtered = getFilteredMachines();
  document.getElementById('machine-tbody').innerHTML = renderMachineRows(filtered);
  const cnt = document.getElementById('filter-count');
  if (cnt) cnt.textContent = `${filtered.length} of ${S.data.machines.length}`;
  // Re-bind sort headers and row clicks (tbody only — headers are outside tbody)
  bindMachineSortHeaders();
  bindMachineRowClicks();
}

function bindMachineSortHeaders() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (S.machines.sort.col === col) S.machines.sort.dir *= -1;
      else { S.machines.sort.col = col; S.machines.sort.dir = 1; }
      refreshMachineTable();
    };
  });
}

function bindMachineRowClicks() {
  document.getElementById('machine-tbody')?.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-machine]');
    if (!tr) return;
    const id = tr.dataset.machine;
    S.machines.expanded = S.machines.expanded === id ? null : id;
    refreshMachineTable();
  }, { once: true });
}

// ════════════════════════════════════════
// EVENT BINDING: NODES
// ════════════════════════════════════════

function bindNodeEvents() {
  document.querySelectorAll('[data-node]').forEach(el => {
    el.addEventListener('click', () => {
      S.nodes.selected = el.dataset.node;
      S.nodes.tab = 'processes';
      document.querySelectorAll('[data-node]').forEach(e =>
        e.classList.toggle('active', e.dataset.node === S.nodes.selected)
      );
      const right = document.getElementById('node-right');
      right.innerHTML = renderNodeShell(S.nodes.selected);
      bindNodeTabEvents();
      loadNodeTab(S.nodes.selected, S.nodes.tab);
    });
  });

  if (S.nodes.selected) {
    bindNodeTabEvents();
    loadNodeTab(S.nodes.selected, S.nodes.tab);
  }
}

function bindNodeTabEvents() {
  document.querySelectorAll('.node-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      S.nodes.tab = tab.dataset.tab;
      document.querySelectorAll('.node-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === S.nodes.tab)
      );
      loadNodeTab(S.nodes.selected, S.nodes.tab);
    });
  });
}

async function loadNodeTab(ip, tab) {
  const el = document.getElementById('node-tab-content');
  if (!el) return;
  el.innerHTML = '<div class="log-empty">Loading…</div>';

  try {
    const { files } = S.data;

    if (tab === 'processes') {
      const f = files[`${ip}/processes`];
      if (!f) { el.innerHTML = '<div class="log-empty">No process data available</div>'; return; }
      const text = await readText(f);
      el.innerHTML = renderProcessTable(parseProcesses(text));

    } else if (tab === 'mounts') {
      const f = files[`${ip}/mounts`];
      if (!f) { el.innerHTML = '<div class="log-empty">No mount data available</div>'; return; }
      const text = await readText(f);
      el.innerHTML = renderMountsTable(parseMounts(text));

    } else if (tab === 'services') {
      const prefix  = `${ip}/service-logs/`;
      const svcLogs = Object.keys(files).filter(p => p.startsWith(prefix) && p.endsWith('.log'));
      if (!svcLogs.length) { el.innerHTML = '<div class="log-empty">No service logs available</div>'; return; }

      const items = svcLogs.map(p => {
        const svc = p.replace(prefix, '').replace('.log', '');
        return `<div class="panel-list-item" data-svclog="${esc(p)}">${esc(svc)}</div>`;
      }).join('');

      el.innerHTML = `
        <div style="font-size:0.8125rem;color:var(--muted);margin-bottom:0.5rem">Click a service to view its log</div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-height:220px;overflow-y:auto">${items}</div>
        <div id="svc-log-viewer" style="margin-top:0.875rem"></div>`;

      el.querySelectorAll('[data-svclog]').forEach(item => {
        item.addEventListener('click', async () => {
          el.querySelectorAll('[data-svclog]').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          await loadServiceLog(item.dataset.svclog);
        });
      });

    } else if (tab === 'resources') {
      const prefix   = `${ip}/resources/`;
      const resFiles = Object.keys(files).filter(p => p.startsWith(prefix) && p.endsWith('.yaml'));
      if (!resFiles.length) { el.innerHTML = '<div class="log-empty">No resource files</div>'; return; }

      const items = resFiles.map(p => {
        const name = p.replace(prefix, '').replace('.yaml', '');
        return `<div class="panel-list-item" data-resfile="${esc(p)}">${esc(name)}</div>`;
      }).join('');

      el.innerHTML = `
        <div style="font-size:0.8125rem;color:var(--muted);margin-bottom:0.5rem">${resFiles.length} resource files — click to view</div>
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-height:220px;overflow-y:auto">${items}</div>
        <div id="node-res-viewer" style="margin-top:0.875rem"></div>`;

      el.querySelectorAll('[data-resfile]').forEach(item => {
        item.addEventListener('click', async () => {
          el.querySelectorAll('[data-resfile]').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          const f = S.data.files[item.dataset.resfile];
          if (!f) return;
          const text = await readText(f);
          document.getElementById('node-res-viewer').innerHTML =
            `<div class="yaml-viewer">${syntaxHighlightYaml(text)}</div>`;
        });
      });
    }
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error"><span class="alert-icon">✖</span> Error: ${esc(e.message)}</div>`;
  }
}

async function loadServiceLog(path) {
  const el = document.getElementById('svc-log-viewer');
  if (!el) return;
  el.innerHTML = '<div class="log-empty">Loading…</div>';
  try {
    const f = S.data.files[path];
    if (!f) { el.innerHTML = '<div class="log-empty">File not found</div>'; return; }
    const text  = await readText(f);
    const lines = parseLogLines(text);
    el.innerHTML = `<div class="log-viewer" style="max-height:400px">${renderLogLines(lines)}</div>`;
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

// ════════════════════════════════════════
// EVENT BINDING: LOGS
// ════════════════════════════════════════

function bindLogEvents() {
  document.querySelectorAll('[data-log]').forEach(el => {
    el.addEventListener('click', async () => {
      S.logs.selected = el.dataset.log;
      // Re-render to show toolbar + update active state
      document.getElementById('main').innerHTML = renderLogs();
      bindLogEvents();
      await loadLog(S.logs.selected);
    });
  });

  document.getElementById('log-search')?.addEventListener('input', applyLogFilter);
  document.getElementById('log-level')?.addEventListener('change', applyLogFilter);
}

async function loadLog(path) {
  const viewer = document.getElementById('log-viewer');
  if (!viewer) return;
  viewer.innerHTML = '<div class="log-empty">Loading…</div>';
  try {
    const f = S.data.files[path];
    if (!f) { viewer.innerHTML = '<div class="log-empty">File not found</div>'; return; }
    const text = await readText(f);
    viewer._allLines =
      path.endsWith('/dmesg.log')              ? parseDmesgLines(text) :
      path.endsWith('/controller-runtime.log') ? parseControllerRuntimeLines(text) :
      path.includes('/kubernetes-logs/')       ? parseKubeLogLines(text) :
                                                 parseLogLines(text);
    applyLogFilter();
  } catch(e) {
    viewer.innerHTML = `<div class="alert alert-error">Error loading log: ${esc(e.message)}</div>`;
  }
}

// ════════════════════════════════════════
// EVENT BINDING: RESOURCES
// ════════════════════════════════════════

function bindResourceEvents() {
  document.querySelectorAll('[data-resgroup]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.resgroup;
      S.resources.groups[key] = (S.resources.groups[key] === false) ? true : false;
      document.getElementById('main').innerHTML = renderResources();
      bindResourceEvents();
    });
  });

  document.querySelectorAll('[data-res]').forEach(el => {
    el.addEventListener('click', async () => {
      S.resources.selected = el.dataset.res;
      try {
        const f = S.data.files[el.dataset.res];
        if (f) S.resources.content = await readText(f);
      } catch(e) {}
      document.getElementById('main').innerHTML = renderResources();
      bindResourceEvents();
    });
  });
}

// ════════════════════════════════════════
// BUNDLE LOADING
// ════════════════════════════════════════

async function processFiles(files) {
  showScreen('screen-loading');
  try {
    S.data = await parseBundle(files);

    const c = S.data.cluster;
    document.getElementById('cluster-name').textContent = c?.id || 'Unknown Cluster';
    document.getElementById('cluster-meta').innerHTML =
      `K8s ${c?.kubernetesVersion || '?'} &bull; Talos ${c?.talosVersion || '?'}<br>${S.data.machines.length} machines`;
    document.getElementById('bundle-meta').textContent =
      `${Object.keys(files).length} files loaded`;

    // Reset state for new bundle
    S.nodes.selected  = S.data.nodeIps[0] || null;
    S.logs.selected   = null;
    S.resources.selected = null;
    S.resources.content  = null;

    showScreen('screen-app');
    navigate('overview');
  } catch(e) {
    showScreen('screen-upload');
    console.error(e);
    alert('Failed to parse bundle:\n' + e.message);
  }
}

// ════════════════════════════════════════
// FILE INPUT HANDLERS
// ════════════════════════════════════════

document.getElementById('btn-dir').addEventListener('click', () =>
  document.getElementById('input-dir').click()
);
document.getElementById('input-dir').addEventListener('change', async e => {
  const files = await loadDirectory(e.target.files);
  await processFiles(files);
});

document.getElementById('btn-zip').addEventListener('click', () =>
  document.getElementById('input-zip').click()
);
document.getElementById('input-zip').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  showScreen('screen-loading');
  setProgress(5, 'Reading ZIP…');
  const files = await loadZip(file);
  await processFiles(files);
});

// Drag & drop
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', async e => {
  e.preventDefault();
  dz.classList.remove('drag-over');

  const items = [...(e.dataTransfer.items || [])];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const allFiles = [];
      await collectEntries(entry, '', allFiles);
      const map = {};
      for (const { path, file } of allFiles) map[path] = file;
      await processFiles(map);
      return;
    }
    const f = item.getAsFile?.();
    if (f?.name.endsWith('.zip')) {
      showScreen('screen-loading');
      setProgress(5, 'Reading ZIP…');
      await processFiles(await loadZip(f));
      return;
    }
  }
});

async function collectEntries(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise(r => entry.file(r));
    out.push({ path: prefix + entry.name, file });
  } else if (entry.isDirectory) {
    const reader  = entry.createReader();
    const entries = await new Promise(r => reader.readEntries(r));
    for (const e of entries) await collectEntries(e, prefix + entry.name + '/', out);
  }
}

// ════════════════════════════════════════
// SIDEBAR NAVIGATION
// ════════════════════════════════════════

document.getElementById('nav').addEventListener('click', e => {
  const item = e.target.closest('[data-view]');
  if (item && S.data) navigate(item.dataset.view);
});
