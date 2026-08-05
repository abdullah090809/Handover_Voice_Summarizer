import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileAudio,
  Users,
  Clock,
  UserCog,
  Bell,
  ShieldCheck,
  UserRound,
  Stethoscope,
  X,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { Avatar } from './States.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import { roleLabel, displayName } from '../lib/format.js';
import { resolveFileUrl } from '../lib/api.js';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, all: true },
  { to: '/handovers', label: 'Handovers', icon: FileAudio, all: true },
  { to: '/residents', label: 'Residents', icon: Users, all: true },
  { to: '/shifts', label: 'Shifts', icon: Clock, all: true },
  { to: '/team', label: 'Team', icon: UserCog, managerOnly: true },
  { to: '/notifications', label: 'Alerts', icon: Bell, managerOnly: true, badge: true },
  { to: '/audit', label: 'Audit', icon: ShieldCheck, managerOnly: true },
];

export default function Sidebar({ mobileOpen, collapsed, onClose }) {
  const { user, isManager, logout } = useAuth();
  const { unreadCount } = useLiveUpdates();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showToast = useToast();
  const { isDark, toggleTheme } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const menuRef = useRef(null);

  const items = NAV_ITEMS.filter((item) => item.all || (item.managerOnly && isManager));

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    function onEscape(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  // Collapsing the rail or closing the mobile drawer should never leave a
  // stale open menu behind it.
  useEffect(() => {
    if (collapsed || !mobileOpen) setMenuOpen(false);
  }, [collapsed]);

  function goTo(path) {
    setMenuOpen(false);
    onClose?.();
    navigate(path);
  }

  async function onLogout() {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Sign out',
      message: 'You\u2019ll need to sign in again to access your account.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (ok) logout();
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}${collapsed ? ' collapsed' : ''}`}>
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
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
            >
              <item.icon />
              <span className="sidebar-link-label">{item.label}</span>
              {item.badge && unreadCount > 0 && <span className="sidebar-link-badge">{unreadCount}</span>}
            </NavLink>
          ))}

          <div className="sidebar-section-label">Account</div>
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
            title={collapsed ? 'Profile' : undefined}
          >
            <UserRound />
            <span className="sidebar-link-label">Profile</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer" ref={menuRef}>
          {menuOpen && (
            <div className="profile-menu" role="menu" aria-label="Account menu">
              <div className="profile-menu-header">
                <Avatar text={displayName(user)} size="md" src={resolveFileUrl(user?.profile_photo_url)} />
                <div className="profile-menu-header-info">
                  <strong>{displayName(user)}</strong>
                  <span>{user?.email}</span>
                </div>
              </div>
              <div className="divider" style={{ margin: 'var(--space-1) 0' }} />
              <button type="button" className="profile-menu-item" role="menuitem" onClick={() => goTo('/profile')}>
                <UserRound size={16} />
                <span>Profile</span>
              </button>
              <button
                type="button"
                className="profile-menu-item profile-menu-item-toggle"
                role="menuitemcheckbox"
                aria-checked={isDark}
                onClick={toggleTheme}
              >
                {isDark ? <Moon size={16} /> : <Sun size={16} />}
                <span style={{ flex: 1 }}>Dark mode</span>
                <span className={`toggle-switch-visual ${isDark ? 'checked' : ''}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="profile-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setPasswordModalOpen(true);
                }}
              >
                <KeyRound size={16} />
                <span>Change password</span>
              </button>
              <div className="divider" style={{ margin: 'var(--space-1) 0' }} />
              <button type="button" className="profile-menu-item profile-menu-item-danger" role="menuitem" onClick={onLogout}>
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className={`sidebar-user ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={collapsed ? displayName(user) : undefined}
          >
            <Avatar text={displayName(user)} size="md" src={resolveFileUrl(user?.profile_photo_url)} />
            <div className="sidebar-user-info">
              <strong>{displayName(user)}</strong>
              <span>{roleLabel(user?.role)}</span>
            </div>
            <ChevronsUpDown size={15} className="sidebar-user-chevron" />
          </button>
        </div>
      </aside>

      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordModalOpen(false)}
          onSuccess={() => {
            setPasswordModalOpen(false);
            showToast('Password updated.', 'success');
          }}
        />
      )}
    </>
  );
}