import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Board, User } from '../shared/types';

export interface AppState {
  me: User;
  users: User[];
  boards: Board[];
  reloadBoards: () => Promise<void>;
  setMe: (u: User) => void;
}

export const AppCtx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(AppCtx);
