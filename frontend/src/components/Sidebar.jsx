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
  Stethoscope,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';
import { Avatar } from './States.jsx';
import { roleLabel, displayName } from '../lib/format.js';
import { resolveFileUrl } from '../lib/api.js';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, all: true },
  { to: '/handovers', label: 'Handovers', icon: FileAudio, all: true },
  { to: '/residents', label: 'Residents', icon: Users, all: true },
  { to: '/shifts', label: 'Shifts', icon: Clock, all: true },
  { to: '/team', label: 'Team', icon: UserCog, managerOnly: true },
  { to: '/notifications', label: 'Alerts', icon: Bell, managerOnly: true, badge: true },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, isManager } = useAuth();
  const { unreadCount } = useLiveUpdates();

  const items = NAV_ITEMS.filter((item) => item.all || (item.managerOnly && isManager));

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {mobileOpen && (
          <button type="button" className="sidebar-close-btn" aria-label="Close menu" onClick={onClose}>
            <X size={18} />
          </button>
        )}
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
              viewTransition
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <item.icon />
              {item.label}
              {item.badge && unreadCount > 0 && <span className="sidebar-link-badge">{unreadCount}</span>}
            </NavLink>
          ))}

          <div className="sidebar-section-label">Account</div>
          <NavLink to="/profile" viewTransition className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
            <UserRound />
            My Profile
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/profile" viewTransition className="sidebar-user" onClick={onClose}>
            <Avatar text={displayName(user)} size="md" src={resolveFileUrl(user?.profile_photo_url)} />
            <div className="sidebar-user-info">
              <strong>{displayName(user)}</strong>
              <span>{roleLabel(user?.role)}</span>
            </div>
          </NavLink>
        </div>
      </aside>
    </>
  );
}