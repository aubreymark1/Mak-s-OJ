import axios from 'axios';

export const TOKEN_STORAGE_KEY = 'matrix_oj_access_token';
export const USER_STORAGE_KEY = 'matrix_oj_user';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
