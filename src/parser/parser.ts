import * as jsyaml from 'js-yaml';
import JSZip from 'jszip';
import type {
  FileMap, FileEntry, LogLine, ProcessEntry, MountEntry,
  ParsedBundle, Cluster, Machine, MachineSet, MachineLog, ServiceLog, DmesgLog,
} from './types';

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════

export const CLUSTER_PHASES: Record<number, string> = { 0:'Unknown', 1:'Scaling Up', 2:'Scaling Down', 3:'Running', 4:'Destroying' };
export const MACHINE_STAGES: Record<number, string> = { 0:'Unknown', 1:'Booting', 2:'Installing', 3:'Maintenance', 4:'Running', 5:'Rebooting', 6:'Shutting Down', 7:'Resetting', 8:'Upgrading' };
export const UPGRADE_PHASES: Record<number, string> = { 0:'Unknown', 1:'Upgrading', 2:'Done', 3:'Failed' };

// ════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════

export async function loadDirectory(fileList: FileList): Promise<FileMap> {
  const files: FileMap = {};
  let rootDir: string | null = null;
  for (const f of fileList) {
    const parts = f.webkitRelativePath.split('/');
    if (!rootDir) rootDir = parts[0];
    const rel = parts.slice(1).join('/');
    if (rel) files[rel] = f;
  }
  return files;
}

export async function loadZip(file: File): Promise<FileMap> {
  const zip = await JSZip.loadAsync(file);
  const files: FileMap = {};

  const topLevel = new Set<string>();
  zip.forEach((path, entry) => {
    if (!entry.dir) topLevel.add(path.split('/')[0]);
  });

  const rootDir = topLevel.size === 1 ? [...topLevel][0] : null;

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const parts = relPath.split('/');
    const rel = rootDir ? parts.slice(1).join('/') : relPath;
    if (rel) {
      files[rel] = {
        text: () => entry.async('string'),
        _isZipEntry: true,
      } as FileEntry;
    }
  });
  return files;
}

export async function readText(file: FileEntry | File): Promise<string> {
  if ('_isZipEntry' in file && file._isZipEntry) return (file as FileEntry).text();
  if (typeof (file as FileEntry).text === 'function' && !('size' in file)) return (file as FileEntry).text();
  const f = file as File;
  if (typeof f.text === 'function') return f.text();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res((e.target as FileReader).result as string);
    r.onerror = rej;
    r.readAsText(f);
  });
}

// ════════════════════════════════════════
// BUNDLE PARSING
// ════════════════════════════════════════

export async function parseBundle(files: FileMap, onProgress: (msg: string) => void): Promise<ParsedBundle> {
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

  onProgress(`Reading ${omniResFiles.length} Omni resource files…`);

  // Parse all omni resources
  const omniRes: Record<string, Record<string, unknown>> = {};
  let done = 0;
  for (const [path, file] of omniResFiles) {
    try {
      const text = await readText(file);
      const parsed = jsyaml.load(text) as Record<string, unknown>;
      if (parsed?.metadata) omniRes[path] = parsed;
    } catch { /* skip malformed */ }
    done++;
    if (done % 30 === 0) onProgress(`Parsed ${done}/${omniResFiles.length} resources…`);
  }
  onProgress('Parsing cluster data…');

  // Parse node summaries
  const nodeSummaries: Record<string, string> = {};
  for (const ip of nodeIps) {
    const sf = files[`${ip}/summary`];
    if (sf) {
      try { nodeSummaries[ip] = await readText(sf); } catch { /* ignore */ }
    }
  }

  onProgress('Building data model…');

  // Group by resource type
  const byType: Record<string, Record<string, unknown>[]> = {};
  for (const res of Object.values(omniRes)) {
    const typeName = ((res.metadata as Record<string, unknown>)?.type as string || '').split('.')[0];
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(res);
  }

  const single = (t: string) => (byType[t] || [])[0] as Record<string, unknown> | undefined;
  const many   = (t: string) => (byType[t] || []) as Record<string, unknown>[];

  // ── Cluster ──
  const clusterRes    = single('Clusters');
  const clusterStatus = single('ClusterStatuses');
  const bootstrapSt   = single('ClusterBootstrapStatuses');
  const lbStatus      = single('LoadBalancerStatuses');
  const talosUpgrade  = single('TalosUpgradeStatuses');
  const k8sUpgrade    = single('KubernetesUpgradeStatuses');

  const getSpec = (r: Record<string, unknown> | undefined) => r?.spec as Record<string, unknown> | undefined;
  const getMeta = (r: Record<string, unknown> | undefined) => r?.metadata as Record<string, unknown> | undefined;

  const cluster: Cluster | null = clusterRes ? {
    id: getMeta(clusterRes)?.id as string,
    kubernetesVersion: (getSpec(clusterRes)?.kubernetesversion as string) || '?',
    talosVersion:      (getSpec(clusterRes)?.talosversion as string) || '?',
    created:           getMeta(clusterRes)?.created as string | undefined,
    updated:           getMeta(clusterRes)?.updated as string | undefined,
    labels:            (getMeta(clusterRes)?.labels as Record<string, string>) || {},
    features:          (getSpec(clusterRes)?.features as Record<string, boolean>) || {},
    status: clusterStatus ? {
      available:         getSpec(clusterStatus)?.available as boolean | undefined,
      phase:             getSpec(clusterStatus)?.phase as number | undefined,
      ready:             getSpec(clusterStatus)?.ready as boolean | undefined,
      machines:          (getSpec(clusterStatus)?.machines as { total?: number; healthy?: number; connected?: number }) || {},
      kubernetesApiReady:getSpec(clusterStatus)?.kubernetesapiready as boolean | undefined,
      controlPlaneReady: getSpec(clusterStatus)?.controlplaneready as boolean | undefined,
    } : null,
    bootstrapped: getSpec(bootstrapSt)?.bootstrapped as boolean | undefined,
    lbHealthy:    getSpec(lbStatus)?.healthy as boolean | undefined,
    lbStopped:    getSpec(lbStatus)?.stopped as boolean | undefined,
    talosUpgrade: talosUpgrade ? {
      phase:          getSpec(talosUpgrade)?.phase as number | undefined,
      error:          getSpec(talosUpgrade)?.error as string | undefined,
      lastVersion:    getSpec(talosUpgrade)?.lastupgradeversion as string | undefined,
      currentVersion: getSpec(talosUpgrade)?.currentupgradeversion as string | undefined,
    } : null,
    k8sUpgrade: k8sUpgrade ? {
      phase:          getSpec(k8sUpgrade)?.phase as number | undefined,
      error:          getSpec(k8sUpgrade)?.error as string | undefined,
      status:         getSpec(k8sUpgrade)?.status as string | undefined,
      lastVersion:    getSpec(k8sUpgrade)?.lastupgradeversion as string | undefined,
      currentVersion: getSpec(k8sUpgrade)?.currentupgradeversion as string | undefined,
    } : null,
  } : null;

  // ── Machines ──
  const machineStatusMap   = Object.fromEntries(many('MachineStatuses').map(m => [getMeta(m)?.id as string, m]));
  const cmStatusMap        = Object.fromEntries(many('ClusterMachineStatuses').map(m => [getMeta(m)?.id as string, m]));
  const cmConfigStatusMap  = Object.fromEntries(many('ClusterMachineConfigStatuses').map(m => [getMeta(m)?.id as string, m]));

  const machines: Machine[] = Object.entries(machineStatusMap).map(([id, ms]) => {
    const cms  = cmStatusMap[id];
    const cmcs = cmConfigStatusMap[id];
    const labels   = (getMeta(ms)?.labels as Record<string, string>) || {};
    const isCP     = 'omni.sidero.dev/role-controlplane' in labels;
    const isWorker = 'omni.sidero.dev/role-worker' in labels;
    const network = (getSpec(ms)?.network as Record<string, unknown>) || {};
    const addresses = ((network.addresses as string[]) || []).map((a: string) => a.split('/')[0]);
    const nodeIp    = nodeIps.find(ip => addresses.includes(ip)) || null;

    const processors = (((getSpec(ms)?.hardware as Record<string, unknown>)?.processors as unknown[]) || []) as Record<string, unknown>[];
    const proc0 = processors[0] || {};
    const memModules = (((getSpec(ms)?.hardware as Record<string, unknown>)?.memorymodules as unknown[]) || []) as Record<string, unknown>[];
    const blockDevices = (((getSpec(ms)?.hardware as Record<string, unknown>)?.blockdevices as unknown[]) || []) as Record<string, unknown>[];

    return {
      id,
      hostname:    (network.hostname as string) || (labels['omni.sidero.dev/hostname']) || ((getMeta(cms)?.labels as Record<string, string>)?.['omni.sidero.dev/hostname']) || id.substring(0, 8),
      role:        isCP ? 'controlplane' : isWorker ? 'worker' : 'unknown',
      machineSet:  ((getMeta(cms)?.labels as Record<string, string>)?.['omni.sidero.dev/machine-set']) || '',
      talosVersion:(getSpec(ms)?.talosversion as string) || '?',
      connected:   (getSpec(ms)?.connected as boolean) ?? false,
      maintenance: (getSpec(ms)?.maintenance as boolean) ?? false,
      lastError:   (getSpec(ms)?.lasterror as string) || '',
      platform:    ((getSpec(ms)?.platformmetadata as Record<string, unknown>)?.platform as string) || 'metal',
      addresses,
      nodeIp,
      hardware: {
        cpuCores:       (proc0.corecount as number) || 0,
        cpuThreads:     (proc0.threadcount as number) || 0,
        cpuFreqMhz:     (proc0.frequency as number) || 0,
        cpuManufacturer:(proc0.manufacturer as string) || '',
        cpuDesc:        (proc0.description as string) || '',
        memMb:          memModules.reduce((s, m) => s + ((m.sizemb as number) || 0), 0),
        disks:          blockDevices,
      },
      schematic:     getSpec(ms)?.schematic ?? null,
      securityState: (getSpec(ms)?.securitystate as { secureboot?: boolean; bootedwithuki?: boolean }) ?? null,
      clusterStatus: cms ? {
        ready:           getSpec(cms)?.ready as boolean | undefined,
        stage:           getSpec(cms)?.stage as number | undefined,
        apiAvailable:    getSpec(cms)?.apidavailable as boolean | undefined,
        configUpToDate:  getSpec(cms)?.configuptodate as boolean | undefined,
        lastConfigError: (getSpec(cms)?.lastconfigerror as string) || '',
        configApplyStatus: getSpec(cms)?.configapplystatus as number | undefined,
        isRemoved:       getSpec(cms)?.isremoved as boolean | undefined,
      } : null,
      configStatus: cmcs ? {
        talosVersion:    getSpec(cmcs)?.talosversion as string | undefined,
        schematicId:     getSpec(cmcs)?.schematicid as string | undefined,
        lastConfigError: (getSpec(cmcs)?.lastconfigerror as string) || '',
      } : null,
      created: getMeta(ms)?.created as string | undefined,
      updated: getMeta(ms)?.updated as string | undefined,
    };
  });

  // ── Machine Sets ──
  const msStatusMap = Object.fromEntries(many('MachineSetStatuses').map(m => [getMeta(m)?.id as string, m]));
  const machineSets: MachineSet[] = many('MachineSets').map(ms => {
    const status = msStatusMap[getMeta(ms)?.id as string];
    const labels = (getMeta(ms)?.labels as Record<string, string>) || {};
    return {
      id:   getMeta(ms)?.id as string,
      role: 'omni.sidero.dev/role-controlplane' in labels ? 'controlplane' : 'worker',
      status: status ? {
        phase:    getSpec(status)?.phase as number | undefined,
        ready:    getSpec(status)?.ready as boolean | undefined,
        error:    (getSpec(status)?.error as string) || '',
        machines: (getSpec(status)?.machines as { total?: number; healthy?: number; connected?: number }) || {},
      } : null,
    };
  });

  onProgress('Indexing log sources…');

  // ── Log Sources ──
  const machineLogs: MachineLog[] = machineLogFiles.map(([path]) => {
    const id = path.replace('omni/machine-logs/', '').replace('.log', '');
    const machine = machines.find(m => m.id === id);
    return { id, path, hostname: machine?.hostname || id.substring(0, 12) };
  });

  const serviceLogs: ServiceLog[] = [];
  for (const ip of nodeIps) {
    const prefix = `${ip}/service-logs/`;
    for (const p of Object.keys(files).filter(k => k.startsWith(prefix) && k.endsWith('.log'))) {
      serviceLogs.push({ ip, service: p.replace(prefix, '').replace('.log', ''), path: p, type: 'jsonl' });
    }
    if (files[`${ip}/controller-runtime.log`]) {
      serviceLogs.push({ ip, service: 'controller-runtime', path: `${ip}/controller-runtime.log`, type: 'controller-runtime' });
    }
    const kubePrefix = `${ip}/kubernetes-logs/`;
    for (const p of Object.keys(files).filter(k => k.startsWith(kubePrefix) && k.endsWith('.log'))) {
      const podName = p.replace(kubePrefix, '').replace(/^[^/]+\//, '').replace('.log', '');
      serviceLogs.push({ ip, service: `k8s/${podName}`, path: p, type: 'kubernetes' });
    }
  }

  const dmesgLogs: DmesgLog[] = nodeIps
    .filter(ip => files[`${ip}/dmesg.log`])
    .map(ip => {
      const machine = machines.find(m => m.nodeIp === ip || m.addresses.includes(ip));
      return { ip, path: `${ip}/dmesg.log`, hostname: machine?.hostname || ip };
    });

  // ── Resource Browser Groups ──
  const resGroups: Record<string, { path: string; id: string; res?: unknown }[]> = {};
  for (const [path, res] of Object.entries(omniRes)) {
    const typeName = ((getMeta(res)?.type as string) || path.split('/').pop() || '').split('.')[0];
    if (!resGroups[typeName]) resGroups[typeName] = [];
    resGroups[typeName].push({ path, id: getMeta(res)?.id as string, res });
  }
  for (const path of Object.keys(files).filter(p => p.startsWith('kubernetesResources/') && p.endsWith('.yaml'))) {
    const name = 'k8s:' + path.split('/').pop()!.replace('.yaml', '');
    if (!resGroups[name]) resGroups[name] = [];
    resGroups[name].push({ path, id: path.split('/').pop()!.replace('.yaml', '') });
  }

  onProgress('Done');

  return { cluster, machines, machineSets, nodeIps, nodeSummaries, machineLogs, serviceLogs, dmesgLogs, resGroups, files };
}

// ════════════════════════════════════════
// LOG PARSING
// ════════════════════════════════════════

export function parseLogLines(text: string): LogLine[] {
  return text.trim().split('\n').filter(Boolean).map(line => {
    try {
      const obj = JSON.parse(line) as Record<string, string>;
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

export function parseControllerRuntimeLines(text: string): LogLine[] {
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
  return text.trim().split('\n').filter(Boolean).map(line => {
    const clean = stripAnsi(line);
    const m = clean.match(/^(\S+)\s+(\S+)\s+(.*)/);
    if (m) return { time: m[1], level: m[2].toLowerCase(), msg: m[3] };
    return { time: '', level: 'info', msg: clean };
  });
}

export function parseKubeLogLines(text: string): LogLine[] {
  const klogLevel: Record<string, string> = { I: 'info', W: 'warn', E: 'error', F: 'error' };
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

export function parseDmesgLines(text: string): LogLine[] {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const m = line.match(/^\S+:\s+(\S+):\s+\[([^\]]+)\]:\s*(.*)/);
    if (m) {
      return { time: m[2], level: m[1].toLowerCase(), msg: m[3].trim() };
    }
    return { time: '', level: 'info', msg: line };
  });
}

export function parseLogFile(path: string, text: string): LogLine[] {
  if (path.endsWith('/dmesg.log'))              return parseDmesgLines(text);
  if (path.endsWith('/controller-runtime.log')) return parseControllerRuntimeLines(text);
  if (path.includes('/kubernetes-logs/'))       return parseKubeLogLines(text);
  return parseLogLines(text);
}

// ════════════════════════════════════════
// TEXT FILE PARSERS
// ════════════════════════════════════════

export function parseProcesses(text: string): ProcessEntry[] {
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
  }).filter((x): x is ProcessEntry => x !== null).sort((a, b) => b.cpuTime - a.cpuTime);
}

export function parseMounts(text: string): MountEntry[] {
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const [fs, size, used, avail, pctStr, ...mountParts] = parts;
    const mount = mountParts.join(' ');
    const pct   = parseFloat(pctStr) || 0;
    if (parseFloat(size) === 0) return null;
    return { fs, size: parseFloat(size), used: parseFloat(used), avail: parseFloat(avail), pct, pctStr, mount };
  }).filter((x): x is MountEntry => x !== null);
}

export async function collectEntries(entry: FileSystemEntry, prefix: string, out: Array<{ path: string; file: File }>): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>(r => (entry as FileSystemFileEntry).file(r));
    out.push({ path: prefix + entry.name, file });
  } else if (entry.isDirectory) {
    const reader  = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await new Promise<FileSystemEntry[]>(r => reader.readEntries(r));
    for (const e of entries) await collectEntries(e, prefix + entry.name + '/', out);
  }
}
