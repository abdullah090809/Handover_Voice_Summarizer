import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { ToastProvider } from './lib/ToastContext.jsx';
import { ConfirmProvider } from './lib/ConfirmContext.jsx';
import { AuthProvider } from './lib/AuthContext.jsx';
import { WebSocketProvider } from './lib/WebSocketContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';

import { RequireAuth, RequireManager, RedirectIfAuthed } from './components/RouteGuards.jsx';
import AppShell from './components/AppShell.jsx';

import AuthPage from './pages/AuthPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HandoversPage from './pages/HandoversPage.jsx';
import ResidentsPage from './pages/ResidentsPage.jsx';
import ResidentProfilePage from './pages/ResidentProfilePage.jsx';
import ShiftsPage from './pages/ShiftsPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import CareWorkerProfilePage from './pages/CareWorkerProfilePage.jsx';
import ManagerProfilePage from './pages/ManagerProfilePage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AuditPage from './pages/AuditPage.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <WebSocketProvider>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <RedirectIfAuthed>
                      <AuthPage />
                    </RedirectIfAuthed>
                  }
                />

                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/handovers" element={<HandoversPage />} />
                  <Route path="/residents" element={<ResidentsPage />} />
                  <Route path="/residents/:id" element={<ResidentProfilePage />} />
                  <Route path="/shifts" element={<ShiftsPage />} />
                  <Route
                    path="/team"
                    element={
                      <RequireManager>
                        <TeamPage />
                      </RequireManager>
                    }
                  />
                  <Route
                    path="/team/:id"
                    element={
                      <RequireManager>
                        <CareWorkerProfilePage />
                      </RequireManager>
                    }
                  />
                  <Route
                    path="/managers/:id"
                    element={
                      <RequireManager>
                        <ManagerProfilePage />
                      </RequireManager>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <RequireManager>
                        <NotificationsPage />
                      </RequireManager>
                    }
                  />
                  <Route path="/profile" element={<ProfilePage />} />
                  {/* Profile details was merged into /profile; keep old links/bookmarks working. */}
                  <Route path="/profile/details" element={<Navigate to="/profile" replace />} />
                  <Route
                    path="/audit"
                    element={
                      <RequireManager>
                        <AuditPage />
                      </RequireManager>
                    }
                  />
                </Route>

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </WebSocketProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}