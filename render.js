// ════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function badge(cls, text) {
  return `<span class="badge badge-${cls}">${esc(text)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtMem(mb) {
  if (!mb) return '—';
  const gib = mb / 1024;
  return gib >= 1 ? `${Math.round(gib)} GiB` : `${mb} MiB`;
}

function fmtBytes(b) {
  if (!b) return '—';
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(b / 1e6).toFixed(0)} MB`;
}

function fmtFreq(mhz) {
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(1)} GHz` : `${mhz} MHz`;
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function phaseColor(phase) {
  return { 1:'yellow', 2:'yellow', 3:'green', 4:'red' }[phase] || 'gray';
}

function stageColor(stage) {
  return { 4:'green', 3:'yellow', 1:'blue', 2:'blue', 5:'orange', 6:'yellow', 7:'yellow', 8:'orange' }[stage] || 'gray';
}

function upgradeBadge(phase) {
  const cls = { 0:'badge-gray', 1:'badge-yellow', 2:'badge-green', 3:'badge-red' }[phase] || 'badge-gray';
  return `<span class="badge ${cls}">${UPGRADE_PHASES[phase] || 'Unknown'}</span>`;
}

function syntaxHighlightYaml(text) {
  return esc(text)
    .replace(/^(\s*)([\w-]+):/gm, (_, ws, key) => `${ws}<span class="y-key">${key}</span>:`)
    .replace(/: (true|false)/g, (_, v) => `: <span class="y-bool">${v}</span>`)
    .replace(/: (null|~)\s*$/gm, (_, v) => `: <span class="y-null">${v}</span>`)
    .replace(/: (-?\d+(?:\.\d+)?)\s*$/gm, (_, n) => `: <span class="y-num">${n}</span>`)
    .replace(/: ([^\s<][^\n<]*)\s*$/gm, (_, s) => `: <span class="y-str">${s}</span>`);
}

// ════════════════════════════════════════
// VIEW: OVERVIEW
// ════════════════════════════════════════

function renderOverview() {
  const { cluster, machines, machineSets } = S.data;

  if (!cluster) {
    return `<div class="card"><p class="text-muted">No cluster data found in this bundle.</p></div>`;
  }

  const st      = cluster.status || {};
  const mTotal  = st.machines?.total || machines.length;
  const mHealthy = st.machines?.healthy ?? machines.filter(m => m.clusterStatus?.ready).length;
  const mConnected = st.machines?.connected ?? machines.filter(m => m.connected).length;
  const cpCount = machines.filter(m => m.role === 'controlplane').length;
  const wCount  = machines.filter(m => m.role === 'worker').length;

  // Collect alerts
  const alerts = [];
  if (!st.ready) alerts.push({ type:'warning', msg:`Cluster is not fully ready — phase: ${CLUSTER_PHASES[st.phase] || st.phase}` });
  if (mHealthy < mTotal) alerts.push({ type:'warning', msg:`${mTotal - mHealthy} machine(s) unhealthy (${mHealthy}/${mTotal} healthy)` });
  if (cluster.k8sUpgrade?.status) {
    const s = cluster.k8sUpgrade.status;
    alerts.push({ type:'info', msg:`K8s: ${s.length > 120 ? s.substring(0, 120) + '…' : s}` });
  }
  if (cluster.k8sUpgrade?.error)   alerts.push({ type:'error',   msg:`K8s upgrade error: ${cluster.k8sUpgrade.error}` });
  if (cluster.talosUpgrade?.error) alerts.push({ type:'error',   msg:`Talos upgrade error: ${cluster.talosUpgrade.error}` });
  machines.filter(m => m.lastError).slice(0, 3).forEach(m =>
    alerts.push({ type:'error', msg:`${m.hostname}: ${m.lastError}` })
  );
  machines.filter(m => m.clusterStatus?.lastConfigError).slice(0, 3).forEach(m =>
    alerts.push({ type:'error', msg:`${m.hostname} config error: ${m.clusterStatus.lastConfigError}` })
  );

  const alertsHtml = alerts.slice(0, 6).map(a =>
    `<div class="alert alert-${a.type}">
       <span class="alert-icon">${a.type==='error'?'✖':a.type==='warning'?'▲':'ℹ'}</span>
       <span>${esc(a.msg)}</span>
     </div>`
  ).join('');

  const msCards = machineSets.map(ms => {
    const mst    = ms.status;
    const total  = mst?.machines?.total || 0;
    const healthy= mst?.machines?.healthy || 0;
    return `
      <div class="card">
        <div class="card-title">${esc(ms.id)}</div>
        <div style="display:flex;gap:0.375rem;margin-bottom:0.625rem">
          ${badge(ms.role === 'controlplane' ? 'blue' : 'gray', ms.role === 'controlplane' ? 'Control Plane' : 'Worker')}
          ${badge(mst?.ready ? 'green' : 'yellow', mst?.ready ? 'Ready' : 'Not Ready')}
        </div>
        <div class="metric-value">${healthy}<span style="font-size:1rem;color:var(--muted)">/${total}</span></div>
        <div class="metric-label">Healthy machines</div>
        ${mst?.error ? `<div class="text-red" style="font-size:0.75rem;margin-top:0.375rem">${esc(mst.error)}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <div class="page-title">${esc(cluster.id)}</div>
        <div class="page-subtitle">Cluster overview &bull; Bundle captured ${fmtDate(cluster.updated)}</div>
      </div>
      <div style="display:flex;gap:0.375rem">
        ${badge(st.available ? 'green' : 'red', st.available ? 'Available' : 'Unavailable')}
        ${badge(phaseColor(st.phase), CLUSTER_PHASES[st.phase] || '?')}
      </div>
    </div>

    ${alertsHtml}

    <div class="section grid-4">
      <div class="card">
        <div class="card-title">Total Machines</div>
        <div class="metric-value">${mTotal}</div>
        <div class="metric-sub">${cpCount} control planes &bull; ${wCount} workers</div>
      </div>
      <div class="card">
        <div class="card-title">Healthy</div>
        <div class="metric-value" style="color:${mHealthy===mTotal?'var(--green)':'var(--yellow)'}">${mHealthy}</div>
        <div class="metric-sub">${mTotal - mHealthy} unhealthy</div>
      </div>
      <div class="card">
        <div class="card-title">Connected</div>
        <div class="metric-value">${mConnected}</div>
        <div class="metric-sub">${mTotal - mConnected} disconnected</div>
      </div>
      <div class="card">
        <div class="card-title">Kubernetes API</div>
        <div class="metric-value" style="font-size:1.125rem;padding-top:0.25rem">
          ${st.kubernetesApiReady ? '<span class="text-green">Ready</span>' : '<span class="text-red">Not Ready</span>'}
        </div>
        <div class="metric-sub">Control plane: ${st.controlPlaneReady ? '<span class="text-green">ready</span>' : '<span class="text-red">not ready</span>'}</div>
      </div>
    </div>

    <div class="section grid-2">
      <div class="card">
        <div class="card-title">Cluster Configuration</div>
        <div class="info-grid">
          <span class="info-key">Cluster ID</span>      <span class="info-val">${esc(cluster.id)}</span>
          <span class="info-key">Kubernetes</span>      <span class="info-val">${esc(cluster.kubernetesVersion)}</span>
          <span class="info-key">Talos</span>           <span class="info-val">${esc(cluster.talosVersion)}</span>
          <span class="info-key">Bootstrapped</span>    <span class="info-val">${cluster.bootstrapped ? '✓ Yes' : '✗ No'}</span>
          <span class="info-key">Disk Encryption</span> <span class="info-val">${cluster.features?.diskencryption ? 'Enabled' : 'Disabled'}</span>
          <span class="info-key">Workload Proxy</span>  <span class="info-val">${cluster.features?.enableworkloadproxy ? 'Enabled' : 'Disabled'}</span>
          <span class="info-key">Created</span>         <span class="info-val">${fmtDate(cluster.created)}</span>
          <span class="info-key">Updated</span>         <span class="info-val">${fmtDate(cluster.updated)}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Upgrade &amp; Infrastructure Status</div>
        <div style="margin-bottom:0.875rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
            <span style="font-size:0.8125rem;font-weight:500">Talos</span>
            ${upgradeBadge(cluster.talosUpgrade?.phase)}
          </div>
          <div class="info-grid">
            <span class="info-key">Version</span><span class="info-val">${esc(cluster.talosUpgrade?.lastVersion || '?')}</span>
            ${cluster.talosUpgrade?.currentVersion ? `<span class="info-key">Target</span><span class="info-val">${esc(cluster.talosUpgrade.currentVersion)}</span>` : ''}
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:0.75rem;margin-bottom:0.875rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
            <span style="font-size:0.8125rem;font-weight:500">Kubernetes</span>
            ${upgradeBadge(cluster.k8sUpgrade?.phase)}
          </div>
          <div class="info-grid">
            <span class="info-key">Version</span><span class="info-val">${esc(cluster.k8sUpgrade?.lastVersion || '?')}</span>
            ${cluster.k8sUpgrade?.currentVersion ? `<span class="info-key">Target</span><span class="info-val">${esc(cluster.k8sUpgrade.currentVersion)}</span>` : ''}
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.8125rem;font-weight:500">Load Balancer</span>
          ${badge(cluster.lbHealthy ? 'green' : 'red', cluster.lbHealthy ? 'Healthy' : 'Unhealthy')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card-title" style="margin-bottom:0.625rem">Machine Sets</div>
      <div style="display:grid;grid-template-columns:repeat(${Math.max(2, machineSets.length)},1fr);gap:1rem">${msCards}</div>
    </div>`;
}

// ════════════════════════════════════════
// VIEW: MACHINES
// ════════════════════════════════════════

function getFilteredMachines() {
  const { filter, sort } = S.machines;
  let list = S.data.machines.filter(m => {
    if (filter.role   && m.role !== filter.role) return false;
    if (filter.status === 'ready'        && !m.clusterStatus?.ready) return false;
    if (filter.status === 'notready'     &&  m.clusterStatus?.ready) return false;
    if (filter.status === 'disconnected' &&  m.connected)            return false;
    if (filter.status === 'error'        && !m.lastError && !m.clusterStatus?.lastConfigError) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      return m.hostname.toLowerCase().includes(q)
          || m.id.toLowerCase().includes(q)
          || m.addresses.some(a => a.includes(q))
          || m.machineSet.toLowerCase().includes(q);
    }
    return true;
  });

  list.sort((a, b) => {
    let av, bv;
    switch(sort.col) {
      case 'hostname': av = a.hostname; bv = b.hostname; break;
      case 'role':     av = a.role;     bv = b.role;     break;
      case 'ip':       av = a.addresses[0]||''; bv = b.addresses[0]||''; break;
      case 'stage':    av = a.clusterStatus?.stage||0; bv = b.clusterStatus?.stage||0; break;
      case 'cpu':      av = a.hardware.cpuCores; bv = b.hardware.cpuCores; break;
      case 'mem':      av = a.hardware.memMb;    bv = b.hardware.memMb;    break;
      case 'version':  av = a.talosVersion; bv = b.talosVersion; break;
      default:         av = a.hostname; bv = b.hostname;
    }
    const c = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return c * sort.dir;
  });

  return list;
}

function renderMachineRows(list) {
  return list.map(m => {
    const stage  = m.clusterStatus?.stage ?? -1;
    const sc     = stageColor(stage);
    const isExp  = S.machines.expanded === m.id;
    const hasErr = m.lastError || m.clusterStatus?.lastConfigError;

    const dotCls = hasErr ? 'dot-red' : m.connected ? `dot-${sc}` : 'dot-gray';

    const row = `
      <tr class="${isExp ? 'expanded' : ''}" data-machine="${esc(m.id)}" style="cursor:pointer">
        <td>
          <div class="flex">
            <span class="status-dot ${dotCls}"></span>
            <strong>${esc(m.hostname)}</strong>
            <span class="mono text-muted" style="font-size:0.6875rem">${m.id.substring(0,8)}</span>
          </div>
        </td>
        <td>${badge(m.role === 'controlplane' ? 'blue' : 'gray', m.role === 'controlplane' ? 'Control Plane' : m.role === 'worker' ? 'Worker' : 'Unknown')}</td>
        <td><span class="mono">${esc(m.addresses[0] || '—')}</span></td>
        <td>${badge(sc, MACHINE_STAGES[stage] || '?')}</td>
        <td><span class="mono">${esc(m.talosVersion)}</span></td>
        <td>${m.hardware.cpuCores ? `${m.hardware.cpuCores}c / ${m.hardware.cpuThreads}t` : '—'}</td>
        <td>${fmtMem(m.hardware.memMb)}</td>
        <td>
          <div class="flex gap-2">
            ${badge(m.connected ? 'green' : 'red', m.connected ? 'Connected' : 'Disconnected')}
            ${!m.clusterStatus?.configUpToDate ? badge('yellow', 'Config Drift') : ''}
          </div>
        </td>
      </tr>`;

    if (!isExp) return row;

    const detail = `
      <tr class="expand-row">
        <td colspan="8">
          <div class="expand-content">
            <div class="grid-3" style="gap:1rem">
              <div>
                <div class="card-title">Identity</div>
                <div class="info-grid">
                  <span class="info-key">UUID</span>       <span class="info-val">${esc(m.id)}</span>
                  <span class="info-key">Machine Set</span><span class="info-val">${esc(m.machineSet) || '—'}</span>
                  <span class="info-key">Platform</span>   <span class="info-val">${esc(m.platform)}</span>
                  <span class="info-key">Secure Boot</span><span class="info-val">${m.securityState?.secureboot ? 'Enabled' : 'Disabled'}</span>
                  <span class="info-key">UKI Boot</span>   <span class="info-val">${m.securityState?.bootedwithuki ? 'Yes' : 'No'}</span>
                  <span class="info-key">Created</span>    <span class="info-val">${fmtDate(m.created)}</span>
                  <span class="info-key">Updated</span>    <span class="info-val">${fmtDate(m.updated)}</span>
                </div>
              </div>
              <div>
                <div class="card-title">Hardware</div>
                <div class="info-grid">
                  <span class="info-key">CPU Cores</span>  <span class="info-val">${m.hardware.cpuCores}c / ${m.hardware.cpuThreads}t @ ${fmtFreq(m.hardware.cpuFreqMhz)}</span>
                  <span class="info-key">CPU Model</span>  <span class="info-val">${esc(m.hardware.cpuManufacturer || '—')}</span>
                  <span class="info-key">Memory</span>     <span class="info-val">${fmtMem(m.hardware.memMb)}</span>
                  ${m.hardware.disks.slice(0, 3).map(d =>
                    `<span class="info-key">${esc(d.linuxname || 'Disk')}</span>
                     <span class="info-val">${fmtBytes(d.size)} ${esc(d.type || '')} ${d.systemdisk ? '(system)' : ''}</span>`
                  ).join('')}
                </div>
              </div>
              <div>
                <div class="card-title">Network &amp; Status</div>
                <div class="info-grid">
                  ${m.addresses.map(a =>
                    `<span class="info-key">Address</span><span class="info-val">${esc(a)}</span>`
                  ).join('')}
                  <span class="info-key">Config</span>
                  <span class="info-val">${badge(m.clusterStatus?.configUpToDate ? 'green' : 'yellow', m.clusterStatus?.configUpToDate ? 'Up to Date' : 'Drifted')}</span>
                </div>
                ${m.lastError ? `<div class="alert alert-error" style="margin-top:0.625rem"><span class="alert-icon">✖</span><span>${esc(m.lastError)}</span></div>` : ''}
                ${m.clusterStatus?.lastConfigError ? `<div class="alert alert-error" style="margin-top:0.375rem"><span class="alert-icon">✖</span><span>Config: ${esc(m.clusterStatus.lastConfigError)}</span></div>` : ''}
              </div>
            </div>
          </div>
        </td>
      </tr>`;
    return row + detail;
  }).join('');
}

function renderMachines() {
  const { sort, filter } = S.machines;
  const filtered = getFilteredMachines();

  const sortTh = (col, label, nosort) => {
    const active = sort.col === col;
    const arrow  = active ? (sort.dir === 1 ? '↑' : '↓') : '↕';
    return `<th ${nosort ? 'style="cursor:default"' : `data-sort="${col}" class="${active ? 'sorted' : ''}"`}>
      ${label}${nosort ? '' : ` <span class="sort-arrow">${arrow}</span>`}
    </th>`;
  };

  return `
    <div class="page-header">
      <div>
        <div class="page-title">Machines</div>
        <div class="page-subtitle">${S.data.machines.length} total</div>
      </div>
    </div>
    <div class="filter-row">
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input class="search-input" id="m-search" placeholder="Search hostname, IP, UUID…" value="${esc(filter.search)}">
      </div>
      <select class="filter-select" id="m-role">
        <option value="">All Roles</option>
        <option value="controlplane" ${filter.role === 'controlplane' ? 'selected' : ''}>Control Plane</option>
        <option value="worker"       ${filter.role === 'worker'       ? 'selected' : ''}>Worker</option>
      </select>
      <select class="filter-select" id="m-status">
        <option value="">All Statuses</option>
        <option value="ready"        ${filter.status === 'ready'        ? 'selected' : ''}>Ready</option>
        <option value="notready"     ${filter.status === 'notready'     ? 'selected' : ''}>Not Ready</option>
        <option value="disconnected" ${filter.status === 'disconnected' ? 'selected' : ''}>Disconnected</option>
        <option value="error"        ${filter.status === 'error'        ? 'selected' : ''}>Has Error</option>
      </select>
      <span class="filter-count" id="filter-count">${filtered.length} of ${S.data.machines.length}</span>
    </div>
    <div class="card" style="padding:0">
      <div class="table-wrap">
        <table>
          <thead><tr>
            ${sortTh('hostname','Hostname')}
            ${sortTh('role','Role')}
            ${sortTh('ip','IP Address')}
            ${sortTh('stage','Stage')}
            ${sortTh('version','Talos Version')}
            ${sortTh('cpu','CPU')}
            ${sortTh('mem','Memory')}
            ${sortTh('','Status',true)}
          </tr></thead>
          <tbody id="machine-tbody">${renderMachineRows(filtered)}</tbody>
        </table>
      </div>
    </div>`;
}

// ════════════════════════════════════════
// VIEW: MACHINE SETS
// ════════════════════════════════════════

function renderMachineSets() {
  const { machineSets, machines } = S.data;

  const cards = machineSets.map(ms => {
    const mst    = ms.status;
    const msm    = machines.filter(m => m.machineSet === ms.id);
    const total  = mst?.machines?.total  || msm.length;
    const healthy= mst?.machines?.healthy ?? msm.filter(m => m.clusterStatus?.ready).length;
    const connected = mst?.machines?.connected ?? msm.filter(m => m.connected).length;

    const rows = msm.map(m => {
      const stage = m.clusterStatus?.stage ?? -1;
      return `<tr>
        <td>
          <span class="status-dot ${m.connected ? 'dot-'+stageColor(stage) : 'dot-gray'}"></span>
          ${esc(m.hostname)}
        </td>
        <td><span class="mono">${esc(m.addresses[0] || '—')}</span></td>
        <td><span class="mono">${esc(m.talosVersion)}</span></td>
        <td>${badge(stageColor(stage), MACHINE_STAGES[stage] || '?')}</td>
        <td>${m.clusterStatus?.configUpToDate ? badge('green','✓ Applied') : badge('yellow','⚠ Drift')}</td>
        <td>${m.lastError
          ? `<span class="text-red">${esc(m.lastError.substring(0, 60))}${m.lastError.length > 60 ? '…' : ''}</span>`
          : '<span class="text-muted">—</span>'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="card section">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1rem">
          <div>
            <div style="font-size:1rem;font-weight:600">${esc(ms.id)}</div>
            <div style="margin-top:0.25rem;display:flex;gap:0.375rem">
              ${badge(ms.role === 'controlplane' ? 'blue' : 'gray', ms.role === 'controlplane' ? 'Control Plane' : 'Worker')}
              ${badge(mst?.ready ? 'green' : 'yellow', mst?.ready ? 'Ready' : 'Not Ready')}
              ${badge(phaseColor(mst?.phase), CLUSTER_PHASES[mst?.phase] || '?')}
            </div>
          </div>
          <div style="display:flex;gap:1.5rem;text-align:center">
            <div><div class="metric-value" style="font-size:1.5rem">${total}</div><div class="metric-label">Total</div></div>
            <div><div class="metric-value" style="font-size:1.5rem;color:var(--green)">${healthy}</div><div class="metric-label">Healthy</div></div>
            <div><div class="metric-value" style="font-size:1.5rem">${connected}</div><div class="metric-label">Connected</div></div>
          </div>
        </div>
        ${mst?.error ? `<div class="alert alert-error"><span class="alert-icon">✖</span>${esc(mst.error)}</div>` : ''}
        <div class="table-wrap">
          <table>
            <thead><tr><th>Hostname</th><th>IP</th><th>Talos Version</th><th>Stage</th><th>Config</th><th>Error</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-header"><div class="page-title">Machine Sets</div></div>
    ${cards}`;
}

// ════════════════════════════════════════
// VIEW: NODE DIAGNOSTICS
// ════════════════════════════════════════

function renderNodes() {
  const { nodeIps, machines } = S.data;
  const selected = S.nodes.selected || nodeIps[0];

  const items = nodeIps.map(ip => {
    const machine  = machines.find(m => m.nodeIp === ip || m.addresses.includes(ip));
    const hostname = machine?.hostname || ip;
    return `<div class="panel-list-item ${ip === selected ? 'active' : ''}" data-node="${esc(ip)}">
      <div class="item-name">${esc(hostname)}</div>
      <div class="item-sub">${esc(ip)}</div>
    </div>`;
  }).join('');

  return `
    <div class="page-header" style="margin-bottom:0.875rem">
      <div class="page-title">Node Diagnostics</div>
      <div class="page-subtitle">${nodeIps.length} nodes</div>
    </div>
    <div class="split-layout">
      <div class="panel-list">
        <div class="panel-list-header">Nodes (${nodeIps.length})</div>
        ${items}
      </div>
      <div class="panel-right" id="node-right">
        ${selected ? renderNodeShell(selected) : '<div class="log-empty">Select a node</div>'}
      </div>
    </div>`;
}

function renderNodeShell(ip) {
  const { machines, nodeSummaries } = S.data;
  const machine = machines.find(m => m.nodeIp === ip || m.addresses.includes(ip));
  const summary = nodeSummaries[ip] || '';
  const serverVer = summary.match(/Tag:\s+(\S+)/g)?.[1]?.replace('Tag:', '').trim() || '?';
  const tab = S.nodes.tab;

  const tabs = ['processes', 'mounts', 'services', 'resources'].map(t =>
    `<div class="node-tab ${tab === t ? 'active' : ''}" data-tab="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</div>`
  ).join('');

  return `
    <div class="card" style="flex-shrink:0;padding:0.75rem 1rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="flex gap-2">
          <strong>${esc(machine?.hostname || ip)}</strong>
          <span class="mono text-muted">${esc(ip)}</span>
          ${machine ? badge(machine.role === 'controlplane' ? 'blue' : 'gray', machine.role === 'controlplane' ? 'Control Plane' : 'Worker') : ''}
        </div>
        <div style="font-size:0.75rem;color:var(--muted)">Talos <span class="mono">${esc(serverVer)}</span></div>
      </div>
    </div>
    <div class="card" style="flex:1;overflow:hidden;display:flex;flex-direction:column;padding:0">
      <div class="node-tabs">${tabs}</div>
      <div id="node-tab-content" style="flex:1;overflow:auto;padding:0.875rem 1rem">
        <div class="log-empty">Loading…</div>
      </div>
    </div>`;
}

function renderLogLines(lines) {
  if (!lines.length) return '<div class="log-empty">Empty log</div>';
  return '<div class="log-content">' + lines.map(l => {
    const levelCls = l.level === 'error' || l.level === 'err' ? 'log-level-error'
                   : l.level === 'warning' || l.level === 'warn' ? 'log-level-warn'
                   : l.level === 'debug' ? 'log-level-debug'
                   : 'log-level-info';
    const levelLabel = l.level.substring(0, 4).toUpperCase();
    return `<div class="log-line">
      <span class="log-time">${esc(fmtTime(l.time))}</span>
      <span class="log-level ${levelCls}">${esc(levelLabel)}</span>
      <span class="log-msg">${esc(l.msg)}</span>
    </div>`;
  }).join('') + '</div>';
}

function renderProcessTable(processes) {
  if (!processes.length) return '<div class="log-empty">No process data</div>';
  const rows = processes.slice(0, 60).map(p =>
    `<tr>
      <td class="mono">${esc(p.pid)}</td>
      <td class="mono">${esc(p.state)}</td>
      <td class="mono">${esc(p.threads)}</td>
      <td class="mono">${p.cpuTime.toFixed(2)}</td>
      <td class="mono">${esc(p.resMem)}</td>
      <td class="mono" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.cmd)}">${esc(p.cmd.substring(0, 80))}</td>
    </tr>`
  ).join('');
  return `<div class="table-wrap">
    <table>
      <thead><tr><th>PID</th><th>State</th><th>Threads</th><th>CPU Time (s)</th><th>Res Mem</th><th>Command</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${processes.length > 60 ? `<div class="text-muted" style="padding:0.5rem;font-size:0.75rem">Top 60 of ${processes.length} by CPU time</div>` : ''}
  </div>`;
}

function renderMountsTable(mounts) {
  if (!mounts.length) return '<div class="log-empty">No mount data</div>';
  // Deduplicate by mount point, keep unique fs+mount combos
  const seen = new Set();
  const rows = mounts.filter(m => {
    const key = `${m.fs}:${m.mount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(m => {
    const barCls = m.pct > 85 ? 'usage-high' : m.pct > 60 ? 'usage-med' : 'usage-low';
    return `<tr>
      <td class="mono">${esc(m.fs)}</td>
      <td>${m.size.toFixed(1)} GB</td>
      <td>${m.used.toFixed(1)} GB</td>
      <td>${m.avail.toFixed(1)} GB</td>
      <td>
        <div class="usage-row">
          <div class="usage-bar"><div class="usage-fill ${barCls}" style="width:${Math.min(100, m.pct)}%"></div></div>
          <span class="mono" style="white-space:nowrap;min-width:40px">${esc(m.pctStr)}</span>
        </div>
      </td>
      <td class="mono" style="font-size:0.6875rem">${esc(m.mount)}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap">
    <table>
      <thead><tr><th>Filesystem</th><th>Size</th><th>Used</th><th>Available</th><th>Usage</th><th>Mounted On</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ════════════════════════════════════════
// VIEW: LOGS
// ════════════════════════════════════════

function renderLogs() {
  const { machineLogs, serviceLogs, dmesgLogs, machines } = S.data;
  const sel = S.logs.selected;

  const mlItems = machineLogs.map(ml =>
    `<div class="panel-list-item ${sel === ml.path ? 'active' : ''}" data-log="${esc(ml.path)}">
      <div class="item-name">${esc(ml.hostname)}</div>
      <div class="item-sub">${ml.id.substring(0, 12)}…</div>
    </div>`
  ).join('');

  const dmesgItems = dmesgLogs.map(dl =>
    `<div class="panel-list-item ${sel === dl.path ? 'active' : ''}" data-log="${esc(dl.path)}">
      <div class="item-name">${esc(dl.hostname)}</div>
      <div class="item-sub">${esc(dl.ip)}</div>
    </div>`
  ).join('');

  // Group service logs by node
  const svcByIp = {};
  serviceLogs.forEach(sl => { if (!svcByIp[sl.ip]) svcByIp[sl.ip] = []; svcByIp[sl.ip].push(sl); });

  const svcItems = Object.entries(svcByIp).map(([ip, logs]) => {
    const m        = machines.find(m => m.nodeIp === ip || m.addresses.includes(ip));
    const hostname = m?.hostname || ip;
    return `<div class="panel-list-section">${esc(hostname)}</div>` +
      logs.map(sl =>
        `<div class="panel-list-item ${sel === sl.path ? 'active' : ''}" data-log="${esc(sl.path)}" style="padding-left:1.25rem">
          <div class="item-name">${esc(sl.service)}</div>
          <div class="item-sub">${esc(ip)}</div>
        </div>`
      ).join('');
  }).join('');

  const logToolbar = `
    <div class="log-toolbar">
      <span style="font-size:0.8125rem;font-weight:500;flex:1">${esc(sel?.split('/').pop() || '')}</span>
      <div class="search-wrap" style="flex:0 0 200px">
        <span class="search-icon">🔍</span>
        <input class="search-input" id="log-search" placeholder="Filter lines…">
      </div>
      <select class="filter-select" id="log-level">
        <option value="">All Levels</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
    </div>`;

  const right = sel
    ? `${logToolbar}<div class="log-viewer" id="log-viewer"><div class="log-empty">Loading…</div></div>`
    : `<div class="log-viewer"><div class="log-empty">Select a log from the list</div></div>`;

  return `
    <div class="page-header" style="margin-bottom:0.875rem">
      <div class="page-title">Logs</div>
    </div>
    <div class="split-layout">
      <div class="panel-list">
        ${machineLogs.length ? `<div class="panel-list-header">Machine Logs (${machineLogs.length})</div>${mlItems}` : ''}
        ${dmesgLogs.length   ? `<div class="panel-list-header">dmesg (${dmesgLogs.length})</div>${dmesgItems}` : ''}
        ${serviceLogs.length ? `<div class="panel-list-header">Service Logs</div>${svcItems}` : ''}
      </div>
      <div class="panel-right" id="log-panel-right">${right}</div>
    </div>`;
}

function applyLogFilter() {
  const viewer = document.getElementById('log-viewer');
  if (!viewer?._allLines) return;
  const search = document.getElementById('log-search')?.value?.toLowerCase() || '';
  const level  = document.getElementById('log-level')?.value || '';

  let lines = viewer._allLines;
  if (level)  lines = lines.filter(l => l.level.startsWith(level.substring(0, 4)));
  if (search) lines = lines.filter(l => l.msg.toLowerCase().includes(search));

  const display = lines.length > 2000 ? lines.slice(-2000) : lines;
  const header  = lines.length > 2000
    ? `<div class="log-empty" style="color:var(--yellow)">Showing last 2,000 of ${lines.length} matching lines</div>`
    : '';
  viewer.innerHTML = header + renderLogLines(display);
  requestAnimationFrame(() => { viewer.scrollTop = viewer.scrollHeight; });
}

// ════════════════════════════════════════
// VIEW: RESOURCES
// ════════════════════════════════════════

function renderResources() {
  const { resGroups } = S.data;
  const sel = S.resources.selected;

  const omniKeys = Object.keys(resGroups).filter(k => !k.startsWith('k8s:')).sort();
  const k8sKeys  = Object.keys(resGroups).filter(k => k.startsWith('k8s:'));

  const groupHtml = (key, label) => {
    const items  = resGroups[key] || [];
    const isOpen = S.resources.groups[key] !== false;
    const arrow  = isOpen ? '▾' : '▸';
    const inner  = isOpen ? items.map(item =>
      `<div class="res-item ${sel === item.path ? 'active' : ''}" data-res="${esc(item.path)}">${esc(item.id)}</div>`
    ).join('') : '';
    return `<div class="res-group">
      <div class="res-group-header" data-resgroup="${esc(key)}">${arrow} ${esc(label)} <span class="res-count">${items.length}</span></div>
      ${inner}
    </div>`;
  };

  const tree = omniKeys.map(k => groupHtml(k, k)).join('')
    + (k8sKeys.length ? `<div class="panel-list-header" style="padding:0.5rem 0.625rem;margin-top:0.5rem">Kubernetes</div>` + k8sKeys.map(k => groupHtml(k, k.replace('k8s:',''))).join('') : '');

  const rightContent = sel && S.resources.content
    ? `<div class="card" style="padding:0;flex:1;overflow:hidden;display:flex;flex-direction:column">
         <div style="padding:0.625rem 1rem;border-bottom:1px solid var(--border);font-size:0.8125rem;font-weight:500;flex-shrink:0">${esc(sel.split('/').pop())}</div>
         <div class="yaml-viewer" style="flex:1;border:none;border-radius:0">${syntaxHighlightYaml(S.resources.content)}</div>
       </div>`
    : `<div class="log-viewer"><div class="log-empty">Select a resource to view its YAML</div></div>`;

  return `
    <div class="page-header" style="margin-bottom:0.875rem">
      <div class="page-title">Resources</div>
    </div>
    <div class="split-layout">
      <div class="panel-list"><div class="res-tree">${tree}</div></div>
      <div class="panel-right" id="res-panel-right" style="overflow:hidden">${rightContent}</div>
    </div>`;
}
