import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { checkBackendReadiness } from '../features/hotels/hotelsSlice';

function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const dispatch = useDispatch();
  const backendOnline = useSelector((state) => state.hotels.backendOnline);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Ping backend readiness once on layout mount
  useEffect(() => {
    dispatch(checkBackendReadiness());
  }, [dispatch]);

  // Derive header title from current pathname
  const getPageTitle = () => {
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      return 'Overview Dashboard';
    }
    if (location.pathname === '/hotels') {
      return 'My Hotel Properties';
    }
    if (location.pathname === '/hotels/new') {
      return 'Register New Property';
    }
    if (location.pathname.endsWith('/edit')) {
      return 'Edit Property';
    }
    if (location.pathname.startsWith('/hotels/')) {
      return 'Property Details';
    }
    return 'Hotel Owner Portal';
  };

  return (
    <div className="layout-root">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Reusable Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`} aria-label="Main Navigation">
        <div className="sidebar-brand">
          <div className="brand-logo-container">
            <div className="brand-icon-box">
              <span className="brand-letter">N</span>
            </div>
            <div>
              <h1 className="brand-name">Namlatic</h1>
              <span className="brand-subtext">Owner Portal</span>
            </div>
          </div>
          {/* Mobile close button */}
          <button
            type="button"
            className="mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar-nav">
          <div className="nav-group-label">INVENTORY MANAGEMENT</div>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/hotels"
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span>My Hotels</span>
          </NavLink>

          <div className="nav-group-label">ACTIONS</div>
          <NavLink
            to="/hotels/new"
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            <svg className="nav-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Property</span>
          </NavLink>
        </nav>

        {/* Sidebar Footer with Live Backend Status */}
        <div className="sidebar-footer">
          <div className="system-status-indicator">
            <span
              className={`status-dot ${
                backendOnline === true ? 'status-online' : backendOnline === false ? 'status-offline' : 'status-checking'
              }`}
            />
            <span className="status-label">
              {backendOnline === true
                ? 'Backend & DB Online'
                : backendOnline === false
                ? 'Backend Offline'
                : 'Verifying Services...'}
            </span>
          </div>
          <div className="owner-profile-card">
            <div className="owner-avatar">PO</div>
            <div className="owner-info">
              <div className="owner-name">Property Owner</div>
              <div className="owner-role">Namlatic Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="layout-body">
        {/* Top Header */}
        <header className="top-header">
          <div className="top-header-left">
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg className="hamburger-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="header-view-title">{getPageTitle()}</h2>
          </div>

          <div className="top-header-right">
            <NavLink to="/hotels" className="btn btn-outline btn-sm header-action-btn">
              Browse Inventory
            </NavLink>
            <div className="header-profile-badge">
              <span className="badge-pill">Owner View</span>
            </div>
          </div>
        </header>

        {/* Page View Outlet */}
        <main className="content-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
