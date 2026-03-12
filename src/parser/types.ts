export interface FileEntry {
  text: () => Promise<string>;
  _isZipEntry?: boolean;
}

export type FileMap = Record<string, FileEntry | File>;

export interface LogLine {
  time: string;
  level: string;
  msg: string;
}

export interface ProcessEntry {
  pid: string;
  state: string;
  threads: string;
  cpuTime: number;
  virtMem: string;
  resMem: string;
  cmd: string;
}

export interface MountEntry {
  fs: string;
  size: number;
  used: number;
  avail: number;
  pct: number;
  pctStr: string;
  mount: string;
}

export interface DiskDevice {
  linuxname?: string;
  size?: number;
  type?: string;
  systemdisk?: boolean;
}

export interface Hardware {
  cpuCores: number;
  cpuThreads: number;
  cpuFreqMhz: number;
  cpuManufacturer: string;
  cpuDesc: string;
  memMb: number;
  disks: DiskDevice[];
}

export interface ClusterStatus {
  available?: boolean;
  phase?: number;
  ready?: boolean;
  machines?: { total?: number; healthy?: number; connected?: number };
  kubernetesApiReady?: boolean;
  controlPlaneReady?: boolean;
}

export interface UpgradeStatus {
  phase?: number;
  error?: string;
  lastVersion?: string;
  currentVersion?: string;
  status?: string;
}

export interface Cluster {
  id: string;
  kubernetesVersion: string;
  talosVersion: string;
  created?: string;
  updated?: string;
  labels: Record<string, string>;
  features: Record<string, boolean>;
  status: ClusterStatus | null;
  bootstrapped?: boolean;
  lbHealthy?: boolean;
  lbStopped?: boolean;
  talosUpgrade: UpgradeStatus | null;
  k8sUpgrade: (UpgradeStatus & { status?: string }) | null;
}

export interface MachineClusterStatus {
  ready?: boolean;
  stage?: number;
  apiAvailable?: boolean;
  configUpToDate?: boolean;
  lastConfigError?: string;
  configApplyStatus?: number;
  isRemoved?: boolean;
}

export interface MachineConfigStatus {
  talosVersion?: string;
  schematicId?: string;
  lastConfigError?: string;
}

export interface Machine {
  id: string;
  hostname: string;
  role: 'controlplane' | 'worker' | 'unknown';
  machineSet: string;
  talosVersion: string;
  connected: boolean;
  maintenance: boolean;
  lastError: string;
  platform: string;
  addresses: string[];
  nodeIp: string | null;
  hardware: Hardware;
  schematic: unknown;
  securityState: { secureboot?: boolean; bootedwithuki?: boolean } | null;
  clusterStatus: MachineClusterStatus | null;
  configStatus: MachineConfigStatus | null;
  created?: string;
  updated?: string;
}

export interface MachineSetStatus {
  phase?: number;
  ready?: boolean;
  error?: string;
  machines?: { total?: number; healthy?: number; connected?: number };
}

export interface MachineSet {
  id: string;
  role: 'controlplane' | 'worker';
  status: MachineSetStatus | null;
}

export interface MachineLog {
  id: string;
  path: string;
  hostname: string;
}

export interface ServiceLog {
  ip: string;
  service: string;
  path: string;
  type: 'jsonl' | 'controller-runtime' | 'kubernetes';
}

export interface DmesgLog {
  ip: string;
  path: string;
  hostname: string;
}

export interface ResourceEntry {
  path: string;
  id: string;
  res?: unknown;
}

export interface ParsedBundle {
  cluster: Cluster | null;
  machines: Machine[];
  machineSets: MachineSet[];
  nodeIps: string[];
  nodeSummaries: Record<string, string>;
  machineLogs: MachineLog[];
  serviceLogs: ServiceLog[];
  dmesgLogs: DmesgLog[];
  resGroups: Record<string, ResourceEntry[]>;
  files: FileMap;
}
