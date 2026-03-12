import { useApp } from '../../state/context';
import type { View } from '../../state/types';

const NAV_ITEMS: Array<{ view: View; icon: string; label: string }> = [
  { view: 'overview',    icon: '◈', label: 'Overview' },
  { view: 'machines',    icon: '⬡', label: 'Machines' },
  { view: 'machinesets', icon: '⬡', label: 'Machine Sets' },
  { view: 'nodes',       icon: '⬡', label: 'Node Diagnostics' },
  { view: 'logs',        icon: '☰', label: 'Logs' },
  { view: 'resources',   icon: '☰', label: 'Resources' },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();
  const c = state.data?.cluster;
  const fileCount = state.data ? Object.keys(state.data.files).length : 0;

  return (
    <div style={{ background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'1rem', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontWeight:600, fontSize:'0.9375rem', color:'var(--accent)' }}>
          {c?.id || 'Unknown Cluster'}
        </div>
        <div style={{ fontSize:'0.75rem', color:'var(--muted)', marginTop:'0.25rem', lineHeight:1.4 }}>
          K8s {c?.kubernetesVersion || '?'} · Talos {c?.talosVersion || '?'}<br />
          {state.data?.machines.length} machines
        </div>
      </div>

      <nav style={{ padding:'0.5rem 0', flex:1 }}>
        {NAV_ITEMS.map(({ view, icon, label }) => (
          <div
            key={view}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: view })}
            style={{
              display:'flex', alignItems:'center', gap:'0.625rem',
              padding:'0.5625rem 1rem', cursor:'pointer',
              fontSize:'0.8125rem',
              color: state.view === view ? 'var(--text)' : 'var(--muted)',
              background: state.view === view ? 'var(--accent-dim)' : undefined,
              borderLeft: `2px solid ${state.view === view ? 'var(--accent)' : 'transparent'}`,
              transition:'all 0.12s', userSelect:'none',
            }}
          >
            <span style={{ fontSize:'0.875rem', width:16, textAlign:'center', flexShrink:0 }}>{icon}</span>
            {label}
          </div>
        ))}
      </nav>

      <div style={{ padding:'0.75rem 1rem', borderTop:'1px solid var(--border)', fontSize:'0.6875rem', color:'var(--muted)' }}>
        {fileCount} files loaded
      </div>
    </div>
  );
}
