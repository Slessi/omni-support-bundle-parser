export default function LoadingScreen({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:'1rem' }}>
      <div className="spinner" />
      <div className="progress-text">{msg || 'Loading…'}</div>
    </div>
  );
}
