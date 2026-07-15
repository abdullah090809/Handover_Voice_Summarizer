import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileAudio,
  Users,
  Clock,
  UserCog,
  Bell,
  UserRound,
  LogOut,
  Stethoscope,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';
import { Avatar } from './States.jsx';
import { roleLabel } from '../lib/format.js';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, all: true },
  { to: '/handovers', label: 'Handovers', icon: FileAudio, all: true },
  { to: '/residents', label: 'Residents', icon: Users, all: true },
  { to: '/shifts', label: 'Shifts', icon: Clock, all: true },
  { to: '/team', label: 'Team', icon: UserCog, managerOnly: true },
  { to: '/notifications', label: 'Alerts', icon: Bell, managerOnly: true, badge: true },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, isManager, logout } = useAuth();
  const { unreadCount } = useLiveUpdates();

  const items = NAV_ITEMS.filter((item) => item.all || (item.managerOnly && isManager));

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <Stethoscope size={18} />
          </div>
          <div className="sidebar-brand-text">
            <strong>Handover</strong>
            <span>Shift &amp; Care Records</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <item.icon />
              {item.label}
              {item.badge && unreadCount > 0 && <span className="sidebar-link-badge">{unreadCount}</span>}
            </NavLink>
          ))}

          <div className="sidebar-section-label">Account</div>
          <NavLink to="/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <UserRound />
            My Profile
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <Avatar text={user?.email} size="md" />
            <div className="sidebar-user-info">
              <strong>{user?.email}</strong>
              <span>{roleLabel(user?.role)}</span>
            </div>
          </div>
          <button className="btn btn-on-dark btn-block" style={{ marginTop: 'var(--space-2)' }} onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
