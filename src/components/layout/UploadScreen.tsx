import { useRef, useState } from 'react';
import { useApp } from '../../state/context';
import { loadDirectory, loadZip, parseBundle, collectEntries } from '../../parser/parser';
import type { FileMap } from '../../parser/types';

export default function UploadScreen() {
  const { dispatch } = useApp();
  const dirRef  = useRef<HTMLInputElement>(null);
  const zipRef  = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function processFiles(files: FileMap) {
    dispatch({ type: 'SET_LOADING', msg: 'Reading files…' });
    try {
      const data = await parseBundle(files, msg => dispatch({ type: 'SET_LOADING', msg }));
      dispatch({ type: 'BUNDLE_LOADED', payload: data });
    } catch (e) {
      dispatch({ type: 'LOAD_ERROR' });
      alert('Failed to parse bundle:\n' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleDirChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const files = await loadDirectory(e.target.files);
    await processFiles(files);
  }

  async function handleZipChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    dispatch({ type: 'SET_LOADING', msg: 'Reading ZIP…' });
    const files = await loadZip(file);
    await processFiles(files);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const items = [...(e.dataTransfer.items || [])];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        const allFiles: Array<{ path: string; file: File }> = [];
        await collectEntries(entry, '', allFiles);
        const map: FileMap = {};
        for (const { path, file } of allFiles) map[path] = file;
        await processFiles(map);
        return;
      }
      const f = item.getAsFile?.();
      if (f?.name.endsWith('.zip')) {
        dispatch({ type: 'SET_LOADING', msg: 'Reading ZIP…' });
        await processFiles(await loadZip(f));
        return;
      }
    }
  }

  return (
    <div
      style={{
        display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', height:'100vh', gap:'2rem',
        background:'radial-gradient(ellipse at 50% 30%, rgba(249,115,22,0.05) 0%, transparent 60%)',
      }}
    >
      <div className="logo">
        <svg viewBox="0 0 36 36" fill="none">
          <rect width="36" height="36" rx="8" fill="#1c2333"/>
          <path d="M18 8L28 14V22L18 28L8 22V14L18 8Z" stroke="#f97316" strokeWidth="1.5" fill="none"/>
          <circle cx="18" cy="18" r="4" fill="#f97316" opacity="0.9"/>
        </svg>
        <div>
          <h1>Omni <span>Bundle</span> Parser</h1>
          <p>Support bundle diagnostic viewer</p>
        </div>
      </div>

      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="drop-zone-icon">📦</div>
        <h2>Open a support bundle</h2>
        <p>Select an extracted bundle directory or a .zip archive</p>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={() => dirRef.current?.click()}>📁 Open Directory</button>
          <button className="btn" onClick={() => zipRef.current?.click()}>🗜 Open ZIP</button>
        </div>
      </div>

      <input ref={dirRef} type="file" multiple hidden onChange={handleDirChange} {...{ webkitdirectory: '' }} />
      <input ref={zipRef} type="file" accept=".zip" hidden onChange={handleZipChange} />
    </div>
  );
}
