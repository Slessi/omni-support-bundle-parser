import type { ParsedBundle, LogLine } from '../parser/types';

export type View = 'overview' | 'machines' | 'machinesets' | 'nodes' | 'logs' | 'resources';

export interface MachineSort { col: string; dir: 1 | -1; }
export interface MachineFilter { role: string; status: string; search: string; }

export interface AppState {
  data: ParsedBundle | null;
  view: View;
  loading: boolean;
  loadingMsg: string;
  machines: {
    sort: MachineSort;
    filter: MachineFilter;
    expanded: string | null;
  };
  logs: {
    selected: string | null;
    lines: LogLine[];
    filter: string;
    levelFilter: string;
    listFilter: string;
  };
  nodes: {
    selected: string | null;
    tab: string;
  };
  resources: {
    selected: string | null;
    content: string | null;
    groups: Record<string, boolean>;
  };
}

export type Action =
  | { type: 'SET_LOADING'; msg: string }
  | { type: 'BUNDLE_LOADED'; payload: ParsedBundle }
  | { type: 'LOAD_ERROR' }
  | { type: 'SET_VIEW'; payload: View }
  | { type: 'SELECT_LOG'; path: string; lines: LogLine[] }
  | { type: 'SET_LOG_FILTER'; filter: string; levelFilter: string }
  | { type: 'SET_LOG_LIST_FILTER'; listFilter: string }
  | { type: 'SELECT_NODE'; ip: string }
  | { type: 'SET_NODE_TAB'; tab: string }
  | { type: 'SELECT_RESOURCE'; path: string; content: string }
  | { type: 'TOGGLE_MACHINE'; id: string }
  | { type: 'SET_MACHINE_SORT'; col: string }
  | { type: 'SET_MACHINE_FILTER'; field: keyof MachineFilter; value: string }
  | { type: 'TOGGLE_RES_GROUP'; key: string };
