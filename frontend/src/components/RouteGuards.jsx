import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';

export function FullScreenLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)' }}>
      <div className="spinner spinner-dark" style={{ width: 28, height: 28, borderWidth: 3 }} />
    </div>
  );
}

export function RequireAuth({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return children;
}

export function RequireManager({ children }) {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/dashboard" replace />;
  return children;
}

export function RedirectIfAuthed({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authed') return <Navigate to="/dashboard" replace />;
  return children;
}
