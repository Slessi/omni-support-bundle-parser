import { useApp } from '../../state/context';
import { readText } from '../../parser/parser';
import { syntaxHighlightYaml } from '../../utils/syntaxHighlight';

export default function Resources() {
  const { state, dispatch } = useApp();
  const { resGroups, files } = state.data!;
  const { selected, content, groups } = state.resources;

  const omniKeys = Object.keys(resGroups).filter(k => !k.startsWith('k8s:')).sort();
  const k8sKeys  = Object.keys(resGroups).filter(k => k.startsWith('k8s:'));

  async function selectRes(path: string) {
    try {
      const f = files[path];
      const text = f ? await readText(f) : '';
      dispatch({ type:'SELECT_RESOURCE', path, content:text });
    } catch { dispatch({ type:'SELECT_RESOURCE', path, content:'' }); }
  }

  function GroupItem({ groupKey, label }: { groupKey: string; label: string }) {
    const items  = resGroups[groupKey] || [];
    const isOpen = groups[groupKey] !== false;
    return (
      <div className="res-group">
        <div className="res-group-header" onClick={() => dispatch({ type:'TOGGLE_RES_GROUP', key:groupKey })}>
          {isOpen ? '▾' : '▸'} {label} <span className="res-count">{items.length}</span>
        </div>
        {isOpen && items.map(item => (
          <div
            key={item.path}
            className={`res-item${selected===item.path?' active':''}`}
            onClick={() => selectRes(item.path)}
          >
            {item.id}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom:'0.875rem' }}>
        <div className="page-title">Resources</div>
      </div>
      <div className="split-layout">
        <div className="panel-list">
          <div className="res-tree">
            {omniKeys.map(k => <GroupItem key={k} groupKey={k} label={k} />)}
            {k8sKeys.length > 0 && (
              <>
                <div className="panel-list-header" style={{ padding:'0.5rem 0.625rem', marginTop:'0.5rem' }}>Kubernetes</div>
                {k8sKeys.map(k => <GroupItem key={k} groupKey={k} label={k.replace('k8s:', '')} />)}
              </>
            )}
          </div>
        </div>

        <div className="panel-right" style={{ overflow:'hidden' }}>
          {selected && content ? (
            <div className="card" style={{ padding:0, flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'0.625rem 1rem', borderBottom:'1px solid var(--border)', fontSize:'0.8125rem', fontWeight:500, flexShrink:0 }}>
                {selected.split('/').pop()}
              </div>
              <div className="yaml-viewer" style={{ flex:1, border:'none', borderRadius:0 }} dangerouslySetInnerHTML={{ __html: syntaxHighlightYaml(content) }} />
            </div>
          ) : (
            <div className="log-viewer">
              <div className="log-empty">Select a resource to view its YAML</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
