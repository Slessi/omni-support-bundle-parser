import type { AppState, Action } from './types';

export const initialState: AppState = {
  data: null,
  view: 'overview',
  loading: false,
  loadingMsg: '',
  machines: {
    sort:   { col: 'hostname', dir: 1 },
    filter: { role: '', status: '', search: '' },
    expanded: null,
  },
  logs:      { selected: null, lines: [], filter: '', levelFilter: '' },
  nodes:     { selected: null, tab: 'processes' },
  resources: { selected: null, content: null, groups: {} },
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, loadingMsg: action.msg };

    case 'BUNDLE_LOADED':
      return {
        ...state,
        loading: false,
        data: action.payload,
        view: 'overview',
        nodes: { ...state.nodes, selected: action.payload.nodeIps[0] || null },
        logs: { selected: null, lines: [], filter: '', levelFilter: '' },
        resources: { selected: null, content: null, groups: {} },
      };

    case 'LOAD_ERROR':
      return { ...state, loading: false };

    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'SELECT_LOG':
      return { ...state, logs: { ...state.logs, selected: action.path, lines: action.lines, filter: '', levelFilter: '' } };

    case 'SET_LOG_FILTER':
      return { ...state, logs: { ...state.logs, filter: action.filter, levelFilter: action.levelFilter } };

    case 'SELECT_NODE':
      return { ...state, nodes: { selected: action.ip, tab: 'processes' } };

    case 'SET_NODE_TAB':
      return { ...state, nodes: { ...state.nodes, tab: action.tab } };

    case 'SELECT_RESOURCE':
      return { ...state, resources: { ...state.resources, selected: action.path, content: action.content } };

    case 'TOGGLE_MACHINE': {
      const expanded = state.machines.expanded === action.id ? null : action.id;
      return { ...state, machines: { ...state.machines, expanded } };
    }

    case 'SET_MACHINE_SORT': {
      const { sort } = state.machines;
      const dir = sort.col === action.col ? (sort.dir === 1 ? -1 : 1) as 1 | -1 : 1;
      return { ...state, machines: { ...state.machines, sort: { col: action.col, dir } } };
    }

    case 'SET_MACHINE_FILTER':
      return { ...state, machines: { ...state.machines, filter: { ...state.machines.filter, [action.field]: action.value } } };

    case 'TOGGLE_RES_GROUP': {
      const current = state.resources.groups[action.key];
      const isOpen = current !== false;
      return { ...state, resources: { ...state.resources, groups: { ...state.resources.groups, [action.key]: !isOpen } } };
    }

    default:
      return state;
  }
}
