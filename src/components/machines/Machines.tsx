import { useApp } from '../../state/context';
import { MACHINE_STAGES } from '../../parser/parser';
import { fmtDate, fmtMem, fmtBytes, fmtFreq, stageColor } from '../../utils/format';
import type { Machine } from '../../parser/types';

function Badge({ color, text }: { color: string; text: string }) {
  return <span className={`badge badge-${color}`}>{text}</span>;
}

function getFilteredMachines(machines: Machine[], sort: { col: string; dir: 1 | -1 }, filter: { role: string; status: string; search: string }): Machine[] {
  let list = machines.filter(m => {
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

  list = [...list].sort((a, b) => {
    let av: number | string, bv: number | string;
    switch (sort.col) {
      case 'hostname': av = a.hostname; bv = b.hostname; break;
      case 'role':     av = a.role;     bv = b.role;     break;
      case 'ip':       av = a.addresses[0]||''; bv = b.addresses[0]||''; break;
      case 'stage':    av = a.clusterStatus?.stage??0; bv = b.clusterStatus?.stage??0; break;
      case 'cpu':      av = a.hardware.cpuCores; bv = b.hardware.cpuCores; break;
      case 'mem':      av = a.hardware.memMb;    bv = b.hardware.memMb;    break;
      case 'version':  av = a.talosVersion; bv = b.talosVersion; break;
      default:         av = a.hostname; bv = b.hostname;
    }
    const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return c * sort.dir;
  });
  return list;
}

export default function Machines() {
  const { state, dispatch } = useApp();
  const { sort, filter, expanded } = state.machines;
  const machines = state.data!.machines;
  const filtered = getFilteredMachines(machines, sort, filter);

  function SortTh({ col, label, nosort }: { col: string; label: string; nosort?: boolean }) {
    const active = sort.col === col;
    const arrow  = active ? (sort.dir === 1 ? '↑' : '↓') : '↕';
    return (
      <th
        className={!nosort && active ? 'sorted' : undefined}
        style={nosort ? { cursor:'default' } : undefined}
        onClick={nosort ? undefined : () => dispatch({ type: 'SET_MACHINE_SORT', col })}
      >
        {label}{!nosort && <span className="sort-arrow">{arrow}</span>}
      </th>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Machines</div>
          <div className="page-subtitle">{machines.length} total</div>
        </div>
      </div>
      <div className="filter-row">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search hostname, IP, UUID…"
            value={filter.search}
            onChange={e => dispatch({ type:'SET_MACHINE_FILTER', field:'search', value:e.target.value })}
          />
        </div>
        <select className="filter-select" value={filter.role} onChange={e => dispatch({ type:'SET_MACHINE_FILTER', field:'role', value:e.target.value })}>
          <option value="">All Roles</option>
          <option value="controlplane">Control Plane</option>
          <option value="worker">Worker</option>
        </select>
        <select className="filter-select" value={filter.status} onChange={e => dispatch({ type:'SET_MACHINE_FILTER', field:'status', value:e.target.value })}>
          <option value="">All Statuses</option>
          <option value="ready">Ready</option>
          <option value="notready">Not Ready</option>
          <option value="disconnected">Disconnected</option>
          <option value="error">Has Error</option>
        </select>
        <span className="filter-count">{filtered.length} of {machines.length}</span>
      </div>

      <div className="card" style={{ padding:0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh col="hostname" label="Hostname" />
                <SortTh col="role"    label="Role" />
                <SortTh col="ip"      label="IP Address" />
                <SortTh col="stage"   label="Stage" />
                <SortTh col="version" label="Talos Version" />
                <SortTh col="cpu"     label="CPU" />
                <SortTh col="mem"     label="Memory" />
                <SortTh col="" label="Status" nosort />
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const stage   = m.clusterStatus?.stage ?? -1;
                const sc      = stageColor(stage);
                const isExp   = expanded === m.id;
                const hasErr  = m.lastError || m.clusterStatus?.lastConfigError;
                const dotCls  = hasErr ? 'dot-red' : m.connected ? `dot-${sc}` : 'dot-gray';

                return (
                  <>
                    <tr
                      key={m.id}
                      className={isExp ? 'expanded' : undefined}
                      style={{ cursor:'pointer' }}
                      onClick={() => dispatch({ type:'TOGGLE_MACHINE', id:m.id })}
                    >
                      <td>
                        <div className="flex">
                          <span className={`status-dot ${dotCls}`} />
                          <strong>{m.hostname}</strong>
                          <span className="mono text-muted" style={{ fontSize:'0.6875rem' }}>{m.id.substring(0,8)}</span>
                        </div>
                      </td>
                      <td><Badge color={m.role === 'controlplane' ? 'blue' : 'gray'} text={m.role === 'controlplane' ? 'Control Plane' : m.role === 'worker' ? 'Worker' : 'Unknown'} /></td>
                      <td><span className="mono">{m.addresses[0] || '—'}</span></td>
                      <td><Badge color={sc} text={MACHINE_STAGES[stage] || '?'} /></td>
                      <td><span className="mono">{m.talosVersion}</span></td>
                      <td>{m.hardware.cpuCores ? `${m.hardware.cpuCores}c / ${m.hardware.cpuThreads}t` : '—'}</td>
                      <td>{fmtMem(m.hardware.memMb)}</td>
                      <td>
                        <div className="flex gap-2">
                          <Badge color={m.connected ? 'green' : 'red'} text={m.connected ? 'Connected' : 'Disconnected'} />
                          {!m.clusterStatus?.configUpToDate && <Badge color="yellow" text="Config Drift" />}
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${m.id}-detail`} className="expand-row">
                        <td colSpan={8}>
                          <div className="expand-content">
                            <div className="grid-3" style={{ gap:'1rem' }}>
                              <div>
                                <div className="card-title">Identity</div>
                                <div className="info-grid">
                                  <span className="info-key">UUID</span>        <span className="info-val">{m.id}</span>
                                  <span className="info-key">Machine Set</span> <span className="info-val">{m.machineSet || '—'}</span>
                                  <span className="info-key">Platform</span>    <span className="info-val">{m.platform}</span>
                                  <span className="info-key">Secure Boot</span> <span className="info-val">{m.securityState?.secureboot ? 'Enabled' : 'Disabled'}</span>
                                  <span className="info-key">UKI Boot</span>    <span className="info-val">{m.securityState?.bootedwithuki ? 'Yes' : 'No'}</span>
                                  <span className="info-key">Created</span>     <span className="info-val">{fmtDate(m.created)}</span>
                                  <span className="info-key">Updated</span>     <span className="info-val">{fmtDate(m.updated)}</span>
                                </div>
                              </div>
                              <div>
                                <div className="card-title">Hardware</div>
                                <div className="info-grid">
                                  <span className="info-key">CPU Cores</span>  <span className="info-val">{m.hardware.cpuCores}c / {m.hardware.cpuThreads}t @ {fmtFreq(m.hardware.cpuFreqMhz)}</span>
                                  <span className="info-key">CPU Model</span>  <span className="info-val">{m.hardware.cpuManufacturer || '—'}</span>
                                  <span className="info-key">Memory</span>     <span className="info-val">{fmtMem(m.hardware.memMb)}</span>
                                  {m.hardware.disks.slice(0, 3).map((d, i) => (
                                    <>
                                      <span key={`dk-${i}`} className="info-key">{d.linuxname || 'Disk'}</span>
                                      <span key={`dv-${i}`} className="info-val">{fmtBytes(d.size)} {d.type || ''} {d.systemdisk ? '(system)' : ''}</span>
                                    </>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="card-title">Network &amp; Status</div>
                                <div className="info-grid">
                                  {m.addresses.map((a, i) => (
                                    <>
                                      <span key={`ak-${i}`} className="info-key">Address</span>
                                      <span key={`av-${i}`} className="info-val">{a}</span>
                                    </>
                                  ))}
                                  <span className="info-key">Config</span>
                                  <span className="info-val"><Badge color={m.clusterStatus?.configUpToDate ? 'green' : 'yellow'} text={m.clusterStatus?.configUpToDate ? 'Up to Date' : 'Drifted'} /></span>
                                </div>
                                {m.lastError && <div className="alert alert-error" style={{ marginTop:'0.625rem' }}><span className="alert-icon">✖</span><span>{m.lastError}</span></div>}
                                {m.clusterStatus?.lastConfigError && <div className="alert alert-error" style={{ marginTop:'0.375rem' }}><span className="alert-icon">✖</span><span>Config: {m.clusterStatus.lastConfigError}</span></div>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
