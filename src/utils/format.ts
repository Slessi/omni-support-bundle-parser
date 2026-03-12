export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtMem(mb: number): string {
  if (!mb) return '—';
  const gib = mb / 1024;
  return gib >= 1 ? `${Math.round(gib)} GiB` : `${mb} MiB`;
}

export function fmtBytes(b?: number): string {
  if (!b) return '—';
  const gb = b / 1e9;
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(b / 1e6).toFixed(0)} MB`;
}

export function fmtFreq(mhz: number): string {
  return mhz >= 1000 ? `${(mhz / 1000).toFixed(1)} GHz` : `${mhz} MHz`;
}

export function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function phaseColor(phase?: number): string {
  return ({ 1:'yellow', 2:'yellow', 3:'green', 4:'red' } as Record<number, string>)[phase ?? -1] || 'gray';
}

export function stageColor(stage?: number): string {
  return ({ 4:'green', 3:'yellow', 1:'blue', 2:'blue', 5:'orange', 6:'yellow', 7:'yellow', 8:'orange' } as Record<number, string>)[stage ?? -1] || 'gray';
}
