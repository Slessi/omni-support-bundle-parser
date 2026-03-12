import { useApp } from '../../state/context';
import { CLUSTER_PHASES, MACHINE_STAGES } from '../../parser/parser';
import { phaseColor, stageColor } from '../../utils/format';

function Badge({ color, text }: { color: string; text: string }) {
  return <span className={`badge badge-${color}`}>{text}</span>;
}

export default function MachineSets() {
  const { state } = useApp();
  const { machineSets, machines } = state.data!;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Machine Sets</div>
      </div>

      {machineSets.map(ms => {
        const mst     = ms.status;
        const msm     = machines.filter(m => m.machineSet === ms.id);
        const total   = mst?.machines?.total  ?? msm.length;
        const healthy = mst?.machines?.healthy ?? msm.filter(m => m.clusterStatus?.ready).length;
        const connected = mst?.machines?.connected ?? msm.filter(m => m.connected).length;

        return (
          <div key={ms.id} className="card section">
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem' }}>
              <div>
                <div style={{ fontSize:'1rem', fontWeight:600 }}>{ms.id}</div>
                <div style={{ marginTop:'0.25rem', display:'flex', gap:'0.375rem' }}>
                  <Badge color={ms.role === 'controlplane' ? 'blue' : 'gray'} text={ms.role === 'controlplane' ? 'Control Plane' : 'Worker'} />
                  <Badge color={mst?.ready ? 'green' : 'yellow'} text={mst?.ready ? 'Ready' : 'Not Ready'} />
                  <Badge color={phaseColor(mst?.phase)} text={CLUSTER_PHASES[mst?.phase ?? 0] || '?'} />
                </div>
              </div>
              <div style={{ display:'flex', gap:'1.5rem', textAlign:'center' }}>
                <div><div className="metric-value" style={{ fontSize:'1.5rem' }}>{total}</div><div className="metric-label">Total</div></div>
                <div><div className="metric-value" style={{ fontSize:'1.5rem', color:'var(--green)' }}>{healthy}</div><div className="metric-label">Healthy</div></div>
                <div><div className="metric-value" style={{ fontSize:'1.5rem' }}>{connected}</div><div className="metric-label">Connected</div></div>
              </div>
            </div>

            {mst?.error && <div className="alert alert-error"><span className="alert-icon">✖</span>{mst.error}</div>}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Hostname</th><th>IP</th><th>Talos Version</th><th>Stage</th><th>Config</th><th>Error</th></tr>
                </thead>
                <tbody>
                  {msm.map(m => {
                    const stage = m.clusterStatus?.stage ?? -1;
                    return (
                      <tr key={m.id}>
                        <td>
                          <span className={`status-dot ${m.connected ? `dot-${stageColor(stage)}` : 'dot-gray'}`} />
                          {m.hostname}
                        </td>
                        <td><span className="mono">{m.addresses[0] || '—'}</span></td>
                        <td><span className="mono">{m.talosVersion}</span></td>
                        <td><Badge color={stageColor(stage)} text={MACHINE_STAGES[stage] || '?'} /></td>
                        <td>{m.clusterStatus?.configUpToDate ? <Badge color="green" text="✓ Applied" /> : <Badge color="yellow" text="⚠ Drift" />}</td>
                        <td>
                          {m.lastError
                            ? <span className="text-red">{m.lastError.substring(0, 60)}{m.lastError.length > 60 ? '…' : ''}</span>
                            : <span className="text-muted">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
