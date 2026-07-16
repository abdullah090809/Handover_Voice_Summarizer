import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileAudio, Users, Clock, Menu } from 'lucide-react';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';

const TABS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/handovers', label: 'Handovers', icon: FileAudio },
  { to: '/residents', label: 'Residents', icon: Users },
  { to: '/shifts', label: 'Shifts', icon: Clock },
];

/**
 * Bottom tab bar shown only on narrow (phone) viewports — see
 * `.mobile-tabbar` in styles/mobile.css. Covers the four screens staff reach
 * for most during a shift; everything else (Team, Alerts, Profile, sign out)
 * stays one tap away behind "More", which opens the existing sidebar drawer
 * so we don't duplicate role-based nav logic.
 */
export default function BottomNav({ onOpenMore, moreActive, unreadCount }) {
  return (
    <nav className="mobile-tabbar" aria-label="Primary">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          viewTransition
          className={({ isActive }) => `mobile-tabbar-item${isActive ? ' active' : ''}`}
        >
          <tab.icon size={21} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={`mobile-tabbar-item${moreActive ? ' active' : ''}`}
        onClick={onOpenMore}
        aria-label={`More${unreadCount ? `, ${unreadCount} unread alerts` : ''}`}
      >
        <span className="mobile-tabbar-more-icon">
          <Menu size={21} />
          {unreadCount > 0 && <span className="icon-btn-dot" />}
        </span>
        <span>More</span>
      </button>
    </nav>
  );
}
