import { useApp } from './state/context';
import UploadScreen from './components/layout/UploadScreen';
import LoadingScreen from './components/layout/LoadingScreen';
import Sidebar from './components/layout/Sidebar';
import Overview from './components/overview/Overview';
import Machines from './components/machines/Machines';
import MachineSets from './components/machineSets/MachineSets';
import Nodes from './components/nodes/Nodes';
import Logs from './components/logs/Logs';
import Resources from './components/resources/Resources';

export default function App() {
  const { state } = useApp();

  if (state.loading) return <LoadingScreen msg={state.loadingMsg} />;
  if (!state.data)   return <UploadScreen />;

  const views: Record<string, React.ReactNode> = {
    overview:   <Overview />,
    machines:   <Machines />,
    machinesets:<MachineSets />,
    nodes:      <Nodes />,
    logs:       <Logs />,
    resources:  <Resources />,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100vh' }}>
      <Sidebar />
      <main style={{ overflowY: 'auto', padding: '1.25rem' }}>
        {views[state.view]}
      </main>
    </div>
  );
}
