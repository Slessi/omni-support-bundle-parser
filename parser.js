// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════
const CLUSTER_PHASES = { 0:'Unknown', 1:'Scaling Up', 2:'Scaling Down', 3:'Running', 4:'Destroying' };
const MACHINE_STAGES = { 0:'Unknown', 1:'Booting', 2:'Installing', 3:'Maintenance', 4:'Running', 5:'Rebooting', 6:'Shutting Down', 7:'Resetting', 8:'Upgrading' };
const UPGRADE_PHASES = { 0:'Unknown', 1:'Upgrading', 2:'Done', 3:'Failed' };

// ════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════

async function loadDirectory(fileList) {
  const files = {};
  let rootDir = null;
  for (const f of fileList) {
    const parts = f.webkitRelativePath.split('/');
    if (!rootDir) rootDir = parts[0];
    const rel = parts.slice(1).join('/');
    if (rel) files[rel] = f;
  }
  return files;
}

async function loadZip(file) {
  const zip = await JSZip.loadAsync(file);
  const files = {};

  // Collect all unique top-level names from actual files (not directory entries)
  const topLevel = new Set();
  zip.forEach((path, entry) => {
    if (!entry.dir) topLevel.add(path.split('/')[0]);
  });

  // Only strip a root prefix when every file shares the exact same one
  const rootDir = topLevel.size === 1 ? [...topLevel][0] : null;

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const parts = relPath.split('/');
    const rel = rootDir ? parts.slice(1).join('/') : relPath;
    if (rel) {
      files[rel] = {
        text: () => entry.async('string'),
        _isZipEntry: true,
      };
    }
  });
  return files;
}

async function readText(file) {
  if (file._isZipEntry || typeof file.text === 'function') return file.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file);
  });
}

// ════════════════════════════════════════
// BUNDLE PARSING
// ════════════════════════════════════════

async function parseBundle(files) {
  const omniResFiles = Object.entries(files).filter(([p]) =>
    p.startsWith('omni/resources/') && p.endsWith('.yaml')
  );
  const nodeIps = [...new Set(
    Object.keys(files)
      .filter(p => /^\d+\.\d+\.\d+\.\d+\//.test(p))
      .map(p => p.split('/')[0])
  )].sort((a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
  });
  const machineLogFiles = Object.entries(files).filter(([p]) =>
    p.startsWith('omni/machine-logs/') && p.endsWith('.log')
  );

  setProgress(5, `Reading ${omniResFiles.length} Omni resource files…`);

  // Parse all omni resources
  const omniRes = {};
  let done = 0;
  for (const [path, file] of omniResFiles) {
    try {
      const text = await readText(file);
      const parsed = jsyaml.load(text);
      if (parsed?.metadata) omniRes[path] = parsed;
    } catch(e) { /* skip malformed */ }
    done++;
    if (done % 30 === 0) setProgress(5 + (done / omniResFiles.length * 60), `Parsed ${done}/${omniResFiles.length} resources…`);
  }
  setProgress(65, 'Parsing cluster data…');

  // Parse node summaries (lightweight version info)
  const nodeSummaries = {};
  for (const ip of nodeIps) {
    const sf = files[`${ip}/summary`];
    if (sf) {
      try { nodeSummaries[ip] = await readText(sf); } catch(e) {}
    }
  }

  setProgress(78, 'Building data model…');

  // Group by resource type
  const byType = {};
  for (const res of Object.values(omniRes)) {
    const typeName = (res.metadata.type || '').split('.')[0];
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(res);
  }

  const single = t => (byType[t] || [])[0];
  const many   = t => byType[t] || [];

  // ── Cluster ──
  const clusterRes    = single('Clusters');
  const clusterStatus = single('ClusterStatuses');
  const bootstrapSt   = single('ClusterBootstrapStatuses');
  const lbStatus      = single('LoadBalancerStatuses');
  const talosUpgrade  = single('TalosUpgradeStatuses');
  const k8sUpgrade    = single('KubernetesUpgradeStatuses');

  const cluster = clusterRes ? {
    id: clusterRes.metadata.id,
    kubernetesVersion: clusterRes.spec?.kubernetesversion || '?',
    talosVersion:      clusterRes.spec?.talosversion || '?',
    created:           clusterRes.metadata.created,
    updated:           clusterRes.metadata.updated,
    labels:            clusterRes.metadata.labels || {},
    features:          clusterRes.spec?.features || {},
    status: clusterStatus ? {
      available:         clusterStatus.spec?.available,
      phase:             clusterStatus.spec?.phase,
      ready:             clusterStatus.spec?.ready,
      machines:          clusterStatus.spec?.machines || {},
      kubernetesApiReady:clusterStatus.spec?.kubernetesapiready,
      controlPlaneReady: clusterStatus.spec?.controlplaneready,
    } : null,
    bootstrapped: bootstrapSt?.spec?.bootstrapped,
    lbHealthy:    lbStatus?.spec?.healthy,
    lbStopped:    lbStatus?.spec?.stopped,
    talosUpgrade: talosUpgrade ? {
      phase:          talosUpgrade.spec?.phase,
      error:          talosUpgrade.spec?.error,
      lastVersion:    talosUpgrade.spec?.lastupgradeversion,
      currentVersion: talosUpgrade.spec?.currentupgradeversion,
    } : null,
    k8sUpgrade: k8sUpgrade ? {
      phase:          k8sUpgrade.spec?.phase,
      error:          k8sUpgrade.spec?.error,
      status:         k8sUpgrade.spec?.status,
      lastVersion:    k8sUpgrade.spec?.lastupgradeversion,
      currentVersion: k8sUpgrade.spec?.currentupgradeversion,
    } : null,
  } : null;

  // ── Machines ──
  const machineStatusMap   = Object.fromEntries(many('MachineStatuses').map(m => [m.metadata.id, m]));
  const cmStatusMap        = Object.fromEntries(many('ClusterMachineStatuses').map(m => [m.metadata.id, m]));
  const cmConfigStatusMap  = Object.fromEntries(many('ClusterMachineConfigStatuses').map(m => [m.metadata.id, m]));

  const machines = Object.entries(machineStatusMap).map(([id, ms]) => {
    const cms  = cmStatusMap[id];
    const cmcs = cmConfigStatusMap[id];
    const labels   = ms.metadata.labels || {};
    const isCP     = 'omni.sidero.dev/role-controlplane' in labels;
    const isWorker = 'omni.sidero.dev/role-worker' in labels;
    const addresses = (ms.spec?.network?.addresses || []).map(a => a.split('/')[0]);
    const nodeIp    = nodeIps.find(ip => addresses.includes(ip)) || null;

    return {
      id,
      hostname:    ms.spec?.network?.hostname || labels['omni.sidero.dev/hostname'] || cms?.metadata?.labels?.['omni.sidero.dev/hostname'] || id.substring(0, 8),
      role:        isCP ? 'controlplane' : isWorker ? 'worker' : 'unknown',
      machineSet:  cms?.metadata?.labels?.['omni.sidero.dev/machine-set'] || '',
      talosVersion:ms.spec?.talosversion || '?',
      connected:   ms.spec?.connected ?? false,
      maintenance: ms.spec?.maintenance ?? false,
      lastError:   ms.spec?.lasterror || '',
      platform:    ms.spec?.platformmetadata?.platform || 'metal',
      addresses,
      nodeIp,
      hardware: {
        cpuCores:       ms.spec?.hardware?.processors?.[0]?.corecount || 0,
        cpuThreads:     ms.spec?.hardware?.processors?.[0]?.threadcount || 0,
        cpuFreqMhz:     ms.spec?.hardware?.processors?.[0]?.frequency || 0,
        cpuManufacturer:ms.spec?.hardware?.processors?.[0]?.manufacturer || '',
        cpuDesc:        ms.spec?.hardware?.processors?.[0]?.description || '',
        memMb:          (ms.spec?.hardware?.memorymodules || []).reduce((s, m) => s + (m.sizemb || 0), 0),
        disks:          ms.spec?.hardware?.blockdevices || [],
      },
      schematic:     ms.spec?.schematic || null,
      securityState: ms.spec?.securitystate || null,
      clusterStatus: cms ? {
        ready:           cms.spec?.ready,
        stage:           cms.spec?.stage,
        apiAvailable:    cms.spec?.apidavailable,
        configUpToDate:  cms.spec?.configuptodate,
        lastConfigError: cms.spec?.lastconfigerror || '',
        configApplyStatus: cms.spec?.configapplystatus,
        isRemoved:       cms.spec?.isremoved,
      } : null,
      configStatus: cmcs ? {
        talosVersion:    cmcs.spec?.talosversion,
        schematicId:     cmcs.spec?.schematicid,
        lastConfigError: cmcs.spec?.lastconfigerror || '',
      } : null,
      created: ms.metadata.created,
      updated: ms.metadata.updated,
    };
  });

  // ── Machine Sets ──
  const msStatusMap = Object.fromEntries(many('MachineSetStatuses').map(m => [m.metadata.id, m]));
  const machineSets = many('MachineSets').map(ms => {
    const status = msStatusMap[ms.metadata.id];
    const labels = ms.metadata.labels || {};
    return {
      id:   ms.metadata.id,
      role: 'omni.sidero.dev/role-controlplane' in labels ? 'controlplane' : 'worker',
      status: status ? {
        phase:    status.spec?.phase,
        ready:    status.spec?.ready,
        error:    status.spec?.error || '',
        machines: status.spec?.machines || {},
      } : null,
    };
  });

  setProgress(88, 'Indexing log sources…');

  // ── Log Sources ──
  const machineLogs = machineLogFiles.map(([path]) => {
    const id = path.replace('omni/machine-logs/', '').replace('.log', '');
    const machine = machines.find(m => m.id === id);
    return { id, path, hostname: machine?.hostname || id.substring(0, 12) };
  });

  const serviceLogs = [];
  for (const ip of nodeIps) {
    // Talos service logs
    const prefix = `${ip}/service-logs/`;
    for (const p of Object.keys(files).filter(k => k.startsWith(prefix) && k.endsWith('.log'))) {
      serviceLogs.push({ ip, service: p.replace(prefix, '').replace('.log', ''), path: p, type: 'jsonl' });
    }
    // Controller runtime log
    if (files[`${ip}/controller-runtime.log`]) {
      serviceLogs.push({ ip, service: 'controller-runtime', path: `${ip}/controller-runtime.log`, type: 'controller-runtime' });
    }
    // Kubernetes pod logs
    const kubePrefix = `${ip}/kubernetes-logs/`;
    for (const p of Object.keys(files).filter(k => k.startsWith(kubePrefix) && k.endsWith('.log'))) {
      const podName = p.replace(kubePrefix, '').replace(/^[^/]+\//, '').replace('.log', '');
      serviceLogs.push({ ip, service: `k8s/${podName}`, path: p, type: 'kubernetes' });
    }
  }

  // ── dmesg logs (one per node) ──
  const dmesgLogs = nodeIps
    .filter(ip => files[`${ip}/dmesg.log`])
    .map(ip => {
      const machine = machines.find(m => m.nodeIp === ip || m.addresses.includes(ip));
      return { ip, path: `${ip}/dmesg.log`, hostname: machine?.hostname || ip };
    });

  // ── Resource Browser Groups ──
  const resGroups = {};
  for (const [path, res] of Object.entries(omniRes)) {
    const typeName = (res.metadata.type || path.split('/').pop()).split('.')[0];
    if (!resGroups[typeName]) resGroups[typeName] = [];
    resGroups[typeName].push({ path, id: res.metadata.id, res });
  }
  // Add kubernetes resources
  for (const path of Object.keys(files).filter(p => p.startsWith('kubernetesResources/') && p.endsWith('.yaml'))) {
    const name = 'k8s:' + path.split('/').pop().replace('.yaml', '');
    if (!resGroups[name]) resGroups[name] = [];
    resGroups[name].push({ path, id: path.split('/').pop().replace('.yaml', '') });
  }

  setProgress(100, 'Done');

  return { cluster, machines, machineSets, nodeIps, nodeSummaries, machineLogs, serviceLogs, dmesgLogs, resGroups, files };
}

function setProgress(pct, msg) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = msg;
}

// ════════════════════════════════════════
// LOG PARSING
// ════════════════════════════════════════

function parseLogLines(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    try {
      const obj = JSON.parse(line);
      return {
        time:  obj['talos-time'] || obj.time || '',
        level: (obj['talos-level'] || obj.level || 'info').toLowerCase(),
        msg:   (obj.msg || obj.message || line).trim(),
      };
    } catch {
      return { time: '', level: 'info', msg: line };
    }
  });
}

// Format: "2026-02-24T02:09:34.228Z \x1b[35mDEBUG\x1b[0m message {json-fields}"
function parseControllerRuntimeLines(text) {
  const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');
  return text.trim().split('\n').filter(Boolean).map(line => {
    const clean = stripAnsi(line);
    const m = clean.match(/^(\S+)\s+(\S+)\s+(.*)/);
    if (m) return { time: m[1], level: m[2].toLowerCase(), msg: m[3] };
    return { time: '', level: 'info', msg: clean };
  });
}

// Format (CRI): "2025-12-24T21:47:08.549Z stderr F I1224 21:47:08.549 1 file.go:10] message"
function parseKubeLogLines(text) {
  const klogLevel = { I: 'info', W: 'warn', E: 'error', F: 'error' };
  return text.trim().split('\n').filter(Boolean).map(line => {
    const m = line.match(/^(\S+)\s+\S+\s+\S+\s+(.*)/);
    if (m) {
      const time = m[1];
      const rest = m[2];
      const klog = rest.match(/^([IWEF])\d{4}\s+\S+\s+\S+\s+(.*)/);
      if (klog) return { time, level: klogLevel[klog[1]] || 'info', msg: klog[2] };
      return { time, level: 'info', msg: rest };
    }
    return { time: '', level: 'info', msg: line };
  });
}

// Format: "kern:    info: [2026-02-08T06:56:25.151824594Z]: message"
function parseDmesgLines(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const m = line.match(/^\S+:\s+(\S+):\s+\[([^\]]+)\]:\s*(.*)/);
    if (m) {
      return { time: m[2], level: m[1].toLowerCase(), msg: m[3].trim() };
    }
    return { time: '', level: 'info', msg: line };
  });
}

// ════════════════════════════════════════
// TEXT FILE PARSERS
// ════════════════════════════════════════

function parseProcesses(text) {
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) return null;
    return {
      pid:     parts[0],
      state:   parts[1],
      threads: parts[2],
      cpuTime: parseFloat(parts[3]) || 0,
      virtMem: parts[4] + ' ' + parts[5],
      resMem:  parts[6] + ' ' + parts[7],
      cmd:     parts.slice(8).join(' '),
    };
  }).filter(Boolean).sort((a, b) => b.cpuTime - a.cpuTime);
}

function parseMounts(text) {
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const [fs, size, used, avail, pctStr, ...mountParts] = parts;
    const mount = mountParts.join(' ');
    const pct   = parseFloat(pctStr) || 0;
    if (parseFloat(size) === 0) return null;
    return { fs, size: parseFloat(size), used: parseFloat(used), avail: parseFloat(avail), pct, pctStr, mount };
  }).filter(Boolean);
}
