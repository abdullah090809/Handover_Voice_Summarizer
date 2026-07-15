import React, { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';

const TITLES = {
  '/dashboard': { title: 'Dashboard', crumb: 'Overview' },
  '/handovers': { title: 'Handover Notes', crumb: 'Handovers' },
  '/residents': { title: 'Residents', crumb: 'Residents' },
  '/shifts': { title: 'Shifts', crumb: 'Shifts' },
  '/team': { title: 'Team', crumb: 'Team' },
  '/notifications': { title: 'Alerts', crumb: 'Alerts' },
  '/profile': { title: 'My Profile', crumb: 'Profile' },
};

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { unreadCount } = useLiveUpdates();

  const meta = TITLES[location.pathname] || { title: 'Handover', crumb: '' };

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="main-column">
        <header className="topbar">
          <button className="icon-btn topbar-menu-btn" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar-titles">
            <div className="breadcrumbs">
              <span>Handover</span>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{meta.crumb}</span>
            </div>
            <h1 className="topbar-title">{meta.title}</h1>
          </div>
          <GlobalSearch />
          <div className="topbar-actions">
            <Link to="/notifications" className="icon-btn" aria-label={`Alerts${unreadCount ? `, ${unreadCount} unread` : ''}`}>
              <Bell size={19} />
              {unreadCount > 0 && <span className="icon-btn-dot" />}
            </Link>
          </div>
        </header>
        <main className="content-area">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
