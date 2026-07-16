import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, userApi, getToken, setToken, clearToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | anon

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('anon');
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const me = await userApi.me();
      setUser(me);
      setStatus('authed');
      return me;
    } catch (e) {
      clearToken();
      setUser(null);
      setStatus('anon');
      throw e;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, [logout]);

  useEffect(() => {
    if (getToken()) {
      loadUser().catch(() => {});
    } else {
      setStatus('anon');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email, password, turnstileToken) => {
      const data = await authApi.login(email, password, turnstileToken);
      setToken(data.access_token);
      await loadUser();
    },
    [loadUser]
  );

  const isManager = user?.role === 'manager';

  return (
    <AuthContext.Provider value={{ user, status, login, logout, isManager, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
