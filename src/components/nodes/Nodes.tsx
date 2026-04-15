import { useState } from 'react';
import { useApp } from '../../state/context';
import { readText } from '../../parser/parser';
import { parseProcesses, parseMounts } from '../../parser/parser';
import { syntaxHighlightYaml } from '../../utils/syntaxHighlight';
import { parseLogLines } from '../../parser/parser';
import type { ProcessEntry, MountEntry, LogLine } from '../../parser/types';

function Badge({ color, text }: { color: string; text: string }) {
  return <span className={`badge badge-${color}`}>{text}</span>;
}

function LogLines({ lines }: { lines: LogLine[] }) {
  if (!lines.length) return <div className="log-empty">Empty log</div>;
  return (
    <div className="log-content">
      {lines.map((l, i) => {
        const levelCls = l.level === 'error' || l.level === 'err' ? 'log-level-error'
                       : l.level === 'warning' || l.level === 'warn' ? 'log-level-warn'
                       : l.level === 'debug' ? 'log-level-debug'
                       : 'log-level-info';
        return (
          <div key={i} className="log-line">
            <span className="log-time">{l.time ? new Date(l.time).toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }) : ''}</span>
            <span className={`log-level ${levelCls}`}>{l.level.substring(0,4).toUpperCase()}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProcessTable({ processes }: { processes: ProcessEntry[] }) {
  if (!processes.length) return <div className="log-empty">No process data</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>PID</th><th>State</th><th>Threads</th><th>CPU Time (s)</th><th>Res Mem</th><th>Command</th></tr></thead>
        <tbody>
          {processes.slice(0, 60).map((p, i) => (
            <tr key={i}>
              <td className="mono">{p.pid}</td>
              <td className="mono">{p.state}</td>
              <td className="mono">{p.threads}</td>
              <td className="mono">{p.cpuTime.toFixed(2)}</td>
              <td className="mono">{p.resMem}</td>
              <td className="mono" style={{ maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.cmd}>{p.cmd.substring(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {processes.length > 60 && <div className="text-muted" style={{ padding:'0.5rem', fontSize:'0.75rem' }}>Top 60 of {processes.length} by CPU time</div>}
    </div>
  );
}

function MountsTable({ mounts }: { mounts: MountEntry[] }) {
  if (!mounts.length) return <div className="log-empty">No mount data</div>;
  const seen = new Set<string>();
  const unique = mounts.filter(m => {
    const key = `${m.fs}:${m.mount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Filesystem</th><th>Size</th><th>Used</th><th>Available</th><th>Usage</th><th>Mounted On</th></tr></thead>
        <tbody>
          {unique.map((m, i) => {
            const barCls = m.pct > 85 ? 'usage-high' : m.pct > 60 ? 'usage-med' : 'usage-low';
            return (
              <tr key={i}>
                <td className="mono">{m.fs}</td>
                <td>{m.size.toFixed(1)} GB</td>
                <td>{m.used.toFixed(1)} GB</td>
                <td>{m.avail.toFixed(1)} GB</td>
                <td>
                  <div className="usage-row">
                    <div className="usage-bar"><div className={`usage-fill ${barCls}`} style={{ width:`${Math.min(100,m.pct)}%` }} /></div>
                    <span className="mono" style={{ whiteSpace:'nowrap', minWidth:40 }}>{m.pctStr}</span>
                  </div>
                </td>
                <td className="mono" style={{ fontSize:'0.6875rem' }}>{m.mount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NodeTabContent({ ip, tab }: { ip: string; tab: string }) {
  const { state } = useApp();
  const { files } = state.data!;
  const [content, setContent] = useState<React.ReactNode>(<div className="log-empty">Loading…</div>);
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    setLoaded(true);
    (async () => {
      try {
        if (tab === 'processes') {
          const f = files[`${ip}/processes`];
          if (!f) { setContent(<div className="log-empty">No process data available</div>); return; }
          const text = await readText(f);
          setContent(<ProcessTable processes={parseProcesses(text)} />);

        } else if (tab === 'mounts') {
          const f = files[`${ip}/mounts`];
          if (!f) { setContent(<div className="log-empty">No mount data available</div>); return; }
          const text = await readText(f);
          setContent(<MountsTable mounts={parseMounts(text)} />);

        } else if (tab === 'services') {
          const prefix  = `${ip}/service-logs/`;
          const svcLogs = Object.keys(files).filter(p => p.startsWith(prefix) && p.endsWith('.log'));
          if (!svcLogs.length) { setContent(<div className="log-empty">No service logs available</div>); return; }
          setContent(<ServicesList ip={ip} svcLogs={svcLogs} files={files} />);

        } else if (tab === 'resources') {
          const prefix   = `${ip}/resources/`;
          const resFiles = Object.keys(files).filter(p => p.startsWith(prefix) && p.endsWith('.yaml'));
          if (!resFiles.length) { setContent(<div className="log-empty">No resource files</div>); return; }
          setContent(<NodeResourcesList prefix={prefix} resFiles={resFiles} files={files} />);
        }
      } catch (e) {
        setContent(<div className="alert alert-error"><span className="alert-icon">✖</span>Error: {String(e)}</div>);
      }
    })();
  }

  return <>{content}</>;
}

function ServicesList({ ip: _ip, svcLogs, files }: { ip: string; svcLogs: string[]; files: Record<string, unknown> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadSvc(path: string) {
    setSelected(path);
    setLoading(true);
    try {
      const text = await readText(files[path] as File);
      setLogLines(parseLogLines(text));
    } catch { setLogLines([]); }
    setLoading(false);
  }

  const prefix = svcLogs[0]?.substring(0, svcLogs[0].lastIndexOf('/') + 1) || '';
  return (
    <>
      <div style={{ fontSize:'0.8125rem', color:'var(--muted)', marginBottom:'0.5rem' }}>Click a service to view its log</div>
      <div style={{ border:'1px solid var(--border)', borderRadius:6, overflow:'hidden', maxHeight:220, overflowY:'auto' }}>
        {svcLogs.map(p => (
          <div
            key={p}
            className={`panel-list-item${selected===p?' active':''}`}
            onClick={() => loadSvc(p)}
          >
            {p.replace(prefix, '').replace('.log', '')}
          </div>
        ))}
      </div>
      {selected && (
        <div style={{ marginTop:'0.875rem' }}>
          {loading
            ? <div className="log-empty">Loading…</div>
            : <div className="log-viewer" style={{ maxHeight:400 }}><LogLines lines={logLines} /></div>
          }
        </div>
      )}
    </>
  );
}

function NodeResourcesList({ prefix, resFiles, files }: { prefix: string; resFiles: string[]; files: Record<string, unknown> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [yaml, setYaml] = useState<string | null>(null);

  async function load(path: string) {
    setSelected(path);
    const text = await readText(files[path] as File);
    setYaml(text);
  }

  return (
    <>
      <div style={{ fontSize:'0.8125rem', color:'var(--muted)', marginBottom:'0.5rem' }}>{resFiles.length} resource files — click to view</div>
      <div style={{ border:'1px solid var(--border)', borderRadius:6, overflow:'hidden', maxHeight:220, overflowY:'auto' }}>
        {resFiles.map(p => (
          <div key={p} className={`panel-list-item${selected===p?' active':''}`} onClick={() => load(p)}>
            {p.replace(prefix, '').replace('.yaml', '')}
          </div>
        ))}
      </div>
      {yaml && (
        <div style={{ marginTop:'0.875rem' }}>
          <div className="yaml-viewer" dangerouslySetInnerHTML={{ __html: syntaxHighlightYaml(yaml) }} />
        </div>
      )}
    </>
  );
}

export default function Nodes() {
  const { state, dispatch } = useApp();
  const [nodeSearch, setNodeSearch] = useState('');
  const { nodeIps, machines, nodeSummaries } = state.data!;
  const selected = state.nodes.selected || nodeIps[0];

  const visibleNodeIps = nodeIps.filter(ip => {
    if (!nodeSearch) return true;
    const q = nodeSearch.toLowerCase();
    const m = machines.find(x => x.nodeIp === ip || x.addresses.includes(ip));
    return ip.includes(q) || (m?.hostname || '').toLowerCase().includes(q);
  });
  const tab      = state.nodes.tab;

  const machine  = machines.find(m => m.nodeIp === selected || m.addresses.includes(selected));
  const summary  = nodeSummaries[selected] || '';
  const serverVer = summary.match(/Tag:\s+(\S+)/g)?.[1]?.replace('Tag:', '').trim() || '?';

  return (
    <>
      <div className="page-header" style={{ marginBottom:'0.875rem' }}>
        <div className="page-title">Node Diagnostics</div>
        <div className="page-subtitle">{nodeIps.length} nodes</div>
      </div>
      <div className="split-layout">
        <div className="panel-list">
          <div style={{ padding:'0.5rem 0.625rem', borderBottom:'1px solid var(--border)' }}>
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="Filter by hostname or IP…"
                value={nodeSearch}
                onChange={e => setNodeSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="panel-list-header">Nodes ({visibleNodeIps.length})</div>
          {visibleNodeIps.map(ip => {
            const m = machines.find(x => x.nodeIp === ip || x.addresses.includes(ip));
            return (
              <div
                key={ip}
                className={`panel-list-item${selected===ip?' active':''}`}
                onClick={() => dispatch({ type:'SELECT_NODE', ip })}
              >
                <div className="item-name">{m?.hostname || ip}</div>
                <div className="item-sub">{ip}</div>
              </div>
            );
          })}
        </div>

        <div className="panel-right">
          {selected ? (
            <>
              <div className="card" style={{ flexShrink:0, padding:'0.75rem 1rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div className="flex gap-2">
                    <strong>{machine?.hostname || selected}</strong>
                    <span className="mono text-muted">{selected}</span>
                    {machine && <Badge color={machine.role === 'controlplane' ? 'blue' : 'gray'} text={machine.role === 'controlplane' ? 'Control Plane' : 'Worker'} />}
                  </div>
                  <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Talos <span className="mono">{serverVer}</span></div>
                </div>
              </div>

              <div className="card" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', padding:0 }}>
                <div className="node-tabs">
                  {['processes','mounts','services','resources'].map(t => (
                    <div
                      key={t}
                      className={`node-tab${tab===t?' active':''}`}
                      onClick={() => dispatch({ type:'SET_NODE_TAB', tab:t })}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </div>
                  ))}
                </div>
                <div style={{ flex:1, overflow:'auto', padding:'0.875rem 1rem' }}>
                  <NodeTabContent key={`${selected}-${tab}`} ip={selected} tab={tab} />
                </div>
              </div>
            </>
          ) : (
            <div className="log-empty">Select a node</div>
          )}
        </div>
      </div>
    </>
  );
}
