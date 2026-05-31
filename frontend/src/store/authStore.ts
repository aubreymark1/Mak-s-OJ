import { create } from 'zustand';
import { api, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../lib/api';
import type { AuthResponse, User } from '../types/oj';

interface LoginPayload {
  username: string;
  password: string;
}

interface RegisterPayload {
  username: string;
  email: string;
  full_name?: string;
  password: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  bootstrap: () => void;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
}

const readStoredUser = (): User | null => {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  bootstrap: () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const user = readStoredUser();
    set({ token, user, isAuthenticated: Boolean(token && user) });
  },
  login: async (payload: LoginPayload): Promise<User> => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<AuthResponse>('/auth/login', payload);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.access_token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
      set({ token: data.access_token, user: data.user, isAuthenticated: true, isLoading: false });
      return data.user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  register: async (payload: RegisterPayload): Promise<User> => {
    set({ isLoading: true });
    try {
      await api.post<User>('/auth/register', payload);
      const user = await get().login({ username: payload.username, password: payload.password });
      set({ isLoading: false });
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    set({ token: null, user: null, isAuthenticated: false, isLoading: false });
  },
}));

