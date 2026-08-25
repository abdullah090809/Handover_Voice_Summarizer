import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Menu, X, Bell } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import BottomNav from './BottomNav.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';

const TAB_ROUTES = ['/dashboard', '/handovers', '/residents', '/shifts'];

// Sidebar behaves differently above/below this width: a slide-in drawer on
// phone/tablet (matches the existing 1024px breakpoint the drawer CSS
// already uses), a collapsible rail on desktop. Kept as a JS constant too
// (not just CSS) so the single topbar toggle button knows which behavior to
// perform.
const DESKTOP_BREAKPOINT = '(min-width: 1025px)';
const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_BREAKPOINT).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_BREAKPOINT);
    const onChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

const TITLES = {
  '/dashboard': { title: 'Dashboard', crumb: 'Overview' },
  '/handovers': { title: 'Handover Notes', crumb: 'Handovers' },
  '/residents': { title: 'Residents', crumb: 'Residents' },
  '/shifts': { title: 'Shifts', crumb: 'Shifts' },
  '/team': { title: 'Team', crumb: 'Team' },
  '/notifications': { title: 'Alerts', crumb: 'Alerts' },
  '/audit': { title: 'Audit Log', crumb: 'Audit' },
  '/profile': { title: 'Profile', crumb: 'Profile' },
};

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const { isManager } = useAuth();
  const { unreadCount } = useLiveUpdates();

  // A drawer left "open" from a phone/tablet session should never persist
  // once the viewport grows into the desktop layout — otherwise the scrim
  // and drawer transform styles (which only apply below 1025px) leave the
  // sidebar in an inconsistent state if the window is resized or a device
  // is rotated/undocked across the breakpoint.
  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  function toggleSidebar() {
    if (isDesktop) {
      setDesktopCollapsed((collapsed) => {
        const next = !collapsed;
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
        } catch {
          // localStorage unavailable (private browsing, etc) — collapse still
          // works for the session, it just won't persist across reloads.
        }
        return next;
      });
    } else {
      setMobileOpen((open) => !open);
    }
  }

  const meta = TITLES[location.pathname] || { title: 'Handover', crumb: '' };
  const sidebarCollapsed = isDesktop && desktopCollapsed;

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} collapsed={sidebarCollapsed} onClose={() => setMobileOpen(false)} />
      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn topbar-menu-btn"
            aria-label={isDesktop ? (desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar') : mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isDesktop ? !desktopCollapsed : mobileOpen}
            onClick={toggleSidebar}
          >
            {mobileOpen && !isDesktop ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="topbar-mobile-brand">
            <div className="topbar-mobile-brand-mark">
              <img src="/logo.png" alt="" />
            </div>
            <strong>Handover</strong>
          </div>
          <div className="topbar-titles">
            <div className="breadcrumbs">
              <span>Handover</span>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{meta.crumb}</span>
            </div>
            <h1 className="topbar-title">{meta.title}</h1>
          </div>
          <GlobalSearch />
          {isManager && (
            <div className="topbar-actions">
              <Link to="/notifications" className="icon-btn" aria-label={`Alerts${unreadCount ? `, ${unreadCount} unread` : ''}`}>
                <Bell size={19} />
                {unreadCount > 0 && <span className="icon-btn-dot" />}
              </Link>
            </div>
          )}
        </header>
        <main className="content-area">
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
        <BottomNav
          onOpenMore={() => setMobileOpen(true)}
          moreActive={mobileOpen || !TAB_ROUTES.includes(location.pathname)}
          unreadCount={unreadCount}
        />
      </div>
    </div>
  );
}