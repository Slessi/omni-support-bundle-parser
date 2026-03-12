import { useApp } from '../../state/context';
import { CLUSTER_PHASES, UPGRADE_PHASES } from '../../parser/parser';
import { fmtDate, phaseColor } from '../../utils/format';

function Badge({ color, text }: { color: string; text: string }) {
  return <span className={`badge badge-${color}`}>{text}</span>;
}

function UpgradeBadge({ phase }: { phase?: number }) {
  const cls = ({ 0:'badge-gray', 1:'badge-yellow', 2:'badge-green', 3:'badge-red' } as Record<number, string>)[phase ?? 0] || 'badge-gray';
  return <span className={`badge ${cls}`}>{UPGRADE_PHASES[phase ?? 0] || 'Unknown'}</span>;
}

export default function Overview() {
  const { state } = useApp();
  const { cluster, machines, machineSets } = state.data!;

  if (!cluster) {
    return <div className="card"><p className="text-muted">No cluster data found in this bundle.</p></div>;
  }

  const st       = cluster.status || {};
  const mTotal   = st.machines?.total ?? machines.length;
  const mHealthy = st.machines?.healthy ?? machines.filter(m => m.clusterStatus?.ready).length;
  const mConnected = st.machines?.connected ?? machines.filter(m => m.connected).length;
  const cpCount  = machines.filter(m => m.role === 'controlplane').length;
  const wCount   = machines.filter(m => m.role === 'worker').length;

  const alerts: Array<{ type: string; msg: string }> = [];
  if (!st.ready) alerts.push({ type:'warning', msg:`Cluster is not fully ready — phase: ${CLUSTER_PHASES[st.phase ?? 0] || st.phase}` });
  if (mHealthy < mTotal) alerts.push({ type:'warning', msg:`${mTotal - mHealthy} machine(s) unhealthy (${mHealthy}/${mTotal} healthy)` });
  if (cluster.k8sUpgrade?.status) {
    const s = cluster.k8sUpgrade.status;
    alerts.push({ type:'info', msg:`K8s: ${s.length > 120 ? s.substring(0, 120) + '…' : s}` });
  }
  if (cluster.k8sUpgrade?.error)   alerts.push({ type:'error', msg:`K8s upgrade error: ${cluster.k8sUpgrade.error}` });
  if (cluster.talosUpgrade?.error) alerts.push({ type:'error', msg:`Talos upgrade error: ${cluster.talosUpgrade.error}` });
  machines.filter(m => m.lastError).slice(0, 3).forEach(m =>
    alerts.push({ type:'error', msg:`${m.hostname}: ${m.lastError}` })
  );
  machines.filter(m => m.clusterStatus?.lastConfigError).slice(0, 3).forEach(m =>
    alerts.push({ type:'error', msg:`${m.hostname} config error: ${m.clusterStatus!.lastConfigError}` })
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">{cluster.id}</div>
          <div className="page-subtitle">Cluster overview · Bundle captured {fmtDate(cluster.updated)}</div>
        </div>
        <div style={{ display:'flex', gap:'0.375rem' }}>
          <Badge color={st.available ? 'green' : 'red'} text={st.available ? 'Available' : 'Unavailable'} />
          <Badge color={phaseColor(st.phase)} text={CLUSTER_PHASES[st.phase ?? 0] || '?'} />
        </div>
      </div>

      {alerts.slice(0, 6).map((a, i) => (
        <div key={i} className={`alert alert-${a.type}`}>
          <span className="alert-icon">{a.type==='error'?'✖':a.type==='warning'?'▲':'ℹ'}</span>
          <span>{a.msg}</span>
        </div>
      ))}

      <div className="section grid-4">
        <div className="card">
          <div className="card-title">Total Machines</div>
          <div className="metric-value">{mTotal}</div>
          <div className="metric-sub">{cpCount} control planes · {wCount} workers</div>
        </div>
        <div className="card">
          <div className="card-title">Healthy</div>
          <div className="metric-value" style={{ color: mHealthy===mTotal ? 'var(--green)' : 'var(--yellow)' }}>{mHealthy}</div>
          <div className="metric-sub">{mTotal - mHealthy} unhealthy</div>
        </div>
        <div className="card">
          <div className="card-title">Connected</div>
          <div className="metric-value">{mConnected}</div>
          <div className="metric-sub">{mTotal - mConnected} disconnected</div>
        </div>
        <div className="card">
          <div className="card-title">Kubernetes API</div>
          <div className="metric-value" style={{ fontSize:'1.125rem', paddingTop:'0.25rem' }}>
            {st.kubernetesApiReady ? <span className="text-green">Ready</span> : <span className="text-red">Not Ready</span>}
          </div>
          <div className="metric-sub">Control plane: {st.controlPlaneReady ? <span className="text-green">ready</span> : <span className="text-red">not ready</span>}</div>
        </div>
      </div>

      <div className="section grid-2">
        <div className="card">
          <div className="card-title">Cluster Configuration</div>
          <div className="info-grid">
            <span className="info-key">Cluster ID</span>      <span className="info-val">{cluster.id}</span>
            <span className="info-key">Kubernetes</span>      <span className="info-val">{cluster.kubernetesVersion}</span>
            <span className="info-key">Talos</span>           <span className="info-val">{cluster.talosVersion}</span>
            <span className="info-key">Bootstrapped</span>    <span className="info-val">{cluster.bootstrapped ? '✓ Yes' : '✗ No'}</span>
            <span className="info-key">Disk Encryption</span> <span className="info-val">{cluster.features?.diskencryption ? 'Enabled' : 'Disabled'}</span>
            <span className="info-key">Workload Proxy</span>  <span className="info-val">{cluster.features?.enableworkloadproxy ? 'Enabled' : 'Disabled'}</span>
            <span className="info-key">Created</span>         <span className="info-val">{fmtDate(cluster.created)}</span>
            <span className="info-key">Updated</span>         <span className="info-val">{fmtDate(cluster.updated)}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Upgrade &amp; Infrastructure Status</div>
          <div style={{ marginBottom:'0.875rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' }}>
              <span style={{ fontSize:'0.8125rem', fontWeight:500 }}>Talos</span>
              <UpgradeBadge phase={cluster.talosUpgrade?.phase} />
            </div>
            <div className="info-grid">
              <span className="info-key">Version</span><span className="info-val">{cluster.talosUpgrade?.lastVersion || '?'}</span>
              {cluster.talosUpgrade?.currentVersion && <><span className="info-key">Target</span><span className="info-val">{cluster.talosUpgrade.currentVersion}</span></>}
            </div>
          </div>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', marginBottom:'0.875rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' }}>
              <span style={{ fontSize:'0.8125rem', fontWeight:500 }}>Kubernetes</span>
              <UpgradeBadge phase={cluster.k8sUpgrade?.phase} />
            </div>
            <div className="info-grid">
              <span className="info-key">Version</span><span className="info-val">{cluster.k8sUpgrade?.lastVersion || '?'}</span>
              {cluster.k8sUpgrade?.currentVersion && <><span className="info-key">Target</span><span className="info-val">{cluster.k8sUpgrade.currentVersion}</span></>}
            </div>
          </div>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'0.8125rem', fontWeight:500 }}>Load Balancer</span>
            <Badge color={cluster.lbHealthy ? 'green' : 'red'} text={cluster.lbHealthy ? 'Healthy' : 'Unhealthy'} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card-title" style={{ marginBottom:'0.625rem' }}>Machine Sets</div>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(2, machineSets.length)},1fr)`, gap:'1rem' }}>
          {machineSets.map(ms => {
            const mst     = ms.status;
            const total   = mst?.machines?.total || 0;
            const healthy = mst?.machines?.healthy || 0;
            return (
              <div key={ms.id} className="card">
                <div className="card-title">{ms.id}</div>
                <div style={{ display:'flex', gap:'0.375rem', marginBottom:'0.625rem' }}>
                  <Badge color={ms.role === 'controlplane' ? 'blue' : 'gray'} text={ms.role === 'controlplane' ? 'Control Plane' : 'Worker'} />
                  <Badge color={mst?.ready ? 'green' : 'yellow'} text={mst?.ready ? 'Ready' : 'Not Ready'} />
                </div>
                <div className="metric-value">{healthy}<span style={{ fontSize:'1rem', color:'var(--muted)' }}>/{total}</span></div>
                <div className="metric-label">Healthy machines</div>
                {mst?.error && <div className="text-red" style={{ fontSize:'0.75rem', marginTop:'0.375rem' }}>{mst.error}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
