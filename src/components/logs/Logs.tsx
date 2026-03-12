import { useRef, useEffect } from 'react';
import { useApp } from '../../state/context';
import { readText, parseLogFile } from '../../parser/parser';
import type { LogLine } from '../../parser/types';
import { fmtTime } from '../../utils/format';

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
            <span className="log-time">{fmtTime(l.time)}</span>
            <span className={`log-level ${levelCls}`}>{l.level.substring(0,4).toUpperCase()}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Logs() {
  const { state, dispatch } = useApp();
  const { machineLogs, serviceLogs, dmesgLogs, machines, files } = state.data!;
  const { selected, lines, filter, levelFilter } = state.logs;
  const viewerRef = useRef<HTMLDivElement>(null);

  const svcByIp: Record<string, typeof serviceLogs> = {};
  serviceLogs.forEach(sl => {
    if (!svcByIp[sl.ip]) svcByIp[sl.ip] = [];
    svcByIp[sl.ip].push(sl);
  });

  async function selectLog(path: string) {
    try {
      const f = files[path];
      if (!f) return;
      const text = await readText(f);
      const parsed = parseLogFile(path, text);
      dispatch({ type: 'SELECT_LOG', path, lines: parsed });
    } catch (e) {
      console.error(e);
    }
  }

  // Scroll to bottom when log changes
  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.scrollTop = viewerRef.current.scrollHeight;
    }
  }, [selected, filter, levelFilter]);

  // Apply filters
  let filtered = lines;
  if (levelFilter) filtered = filtered.filter(l => l.level.startsWith(levelFilter.substring(0, 4)));
  if (filter)      filtered = filtered.filter(l => l.msg.toLowerCase().includes(filter.toLowerCase()));
  const display  = filtered.length > 2000 ? filtered.slice(-2000) : filtered;
  const truncated = filtered.length > 2000;

  return (
    <>
      <div className="page-header" style={{ marginBottom:'0.875rem' }}>
        <div className="page-title">Logs</div>
      </div>
      <div className="split-layout">
        <div className="panel-list">
          {machineLogs.length > 0 && (
            <>
              <div className="panel-list-header">Machine Logs ({machineLogs.length})</div>
              {machineLogs.map(ml => (
                <div
                  key={ml.path}
                  className={`panel-list-item${selected===ml.path?' active':''}`}
                  onClick={() => selectLog(ml.path)}
                >
                  <div className="item-name">{ml.hostname}</div>
                  <div className="item-sub">{ml.id.substring(0,12)}…</div>
                </div>
              ))}
            </>
          )}

          {dmesgLogs.length > 0 && (
            <>
              <div className="panel-list-header">dmesg ({dmesgLogs.length})</div>
              {dmesgLogs.map(dl => (
                <div
                  key={dl.path}
                  className={`panel-list-item${selected===dl.path?' active':''}`}
                  onClick={() => selectLog(dl.path)}
                >
                  <div className="item-name">{dl.hostname}</div>
                  <div className="item-sub">{dl.ip}</div>
                </div>
              ))}
            </>
          )}

          {serviceLogs.length > 0 && (
            <>
              <div className="panel-list-header">Service Logs</div>
              {Object.entries(svcByIp).map(([ip, logs]) => {
                const m = machines.find(x => x.nodeIp === ip || x.addresses.includes(ip));
                return (
                  <div key={ip}>
                    <div className="panel-list-section">{m?.hostname || ip}</div>
                    {logs.map(sl => (
                      <div
                        key={sl.path}
                        className={`panel-list-item${selected===sl.path?' active':''}`}
                        style={{ paddingLeft:'1.25rem' }}
                        onClick={() => selectLog(sl.path)}
                      >
                        <div className="item-name">{sl.service}</div>
                        <div className="item-sub">{ip}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="panel-right">
          {selected ? (
            <>
              <div className="log-toolbar">
                <span style={{ fontSize:'0.8125rem', fontWeight:500, flex:1 }}>{selected.split('/').pop()}</span>
                <div className="search-wrap" style={{ flex:'0 0 200px' }}>
                  <span className="search-icon">🔍</span>
                  <input
                    className="search-input"
                    placeholder="Filter lines…"
                    value={filter}
                    onChange={e => dispatch({ type:'SET_LOG_FILTER', filter:e.target.value, levelFilter })}
                  />
                </div>
                <select
                  className="filter-select"
                  value={levelFilter}
                  onChange={e => dispatch({ type:'SET_LOG_FILTER', filter, levelFilter:e.target.value })}
                >
                  <option value="">All Levels</option>
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
              <div className="log-viewer" ref={viewerRef}>
                {truncated && (
                  <div className="log-empty" style={{ color:'var(--yellow)' }}>
                    Showing last 2,000 of {filtered.length} matching lines
                  </div>
                )}
                <LogLines lines={display} />
              </div>
            </>
          ) : (
            <div className="log-viewer">
              <div className="log-empty">Select a log from the list</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
