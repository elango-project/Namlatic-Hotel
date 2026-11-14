import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Helmet } from 'react-helmet-async';
import { fetchHotels, fetchHotelStats } from '../features/hotels/hotelsSlice';
import { formatCurrency } from '../config/currency';
import HotelCard from '../components/HotelCard';

function DashboardPage() {
  const dispatch = useDispatch();
  const { items, stats, statsStatus, status, error, backendOnline } = useSelector(
    (state) => state.hotels
  );

  const scrollTrackRef = useRef(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Monitor horizontal scrollability and update right-fade visibility dynamically
  const updateScrollState = useCallback(() => {
    const el = scrollTrackRef.current;
    if (!el) {
      setCanScrollRight(false);
      return;
    }
    const hasMoreRight = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
    setCanScrollRight((prev) => (prev !== hasMoreRight ? hasMoreRight : prev));
  }, []);

  // Fetch recent hotels and portfolio-wide server aggregated statistics independently on mount
  useEffect(() => {
    dispatch(fetchHotelStats());
    dispatch(fetchHotels({ limit: 6, offset: 0, title: '', minPrice: '', maxPrice: '' }));
  }, [dispatch]);

  // Handle ResizeObserver and layout changes to detect scroll overflow
  useEffect(() => {
    const el = scrollTrackRef.current;
    if (!el) return;

    updateScrollState();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', updateScrollState);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateScrollState);
      }
    };
  }, [items, updateScrollState]);

  const totalHotels = stats.totalProperties || 0;

  return (
    <div className="dashboard-page">
      <Helmet>
        <title>Dashboard | Namlatic Hotel Owner Portal</title>
        <meta
          name="description"
          content="Property management dashboard for Namlatic hotel owners. Overview hotel inventory statistics, average prices, and recent listings."
        />
      </Helmet>

      {/* Welcome Banner */}
      <section className="welcome-banner" aria-labelledby="welcome-heading">
        <div className="welcome-content">
          <div className="welcome-tag">PORTAL OVERVIEW</div>
          <h1 id="welcome-heading" className="welcome-title">
            Welcome back to Namlatic Property Management
          </h1>
          <p className="welcome-subtitle">
            Manage your hotel inventory, track real-time property listings, and oversee your hospitality portfolio.
          </p>
          <div className="welcome-actions">
            <Link to="/hotels" className="btn btn-primary">
              View All Properties ({totalHotels})
            </Link>
            <Link to="/hotels/new" className="btn btn-outline-white">
              Add New Hotel
            </Link>
          </div>
        </div>
        <div className="welcome-graphic">
          <div className="graphic-circle graphic-primary" />
          <div className="graphic-circle graphic-orange" />
          <div className="graphic-stat-box">
            <div className="graphic-stat-num">{totalHotels}</div>
            <div className="graphic-stat-label">Total Properties</div>
          </div>
        </div>
      </section>

      {/* Metrics Row - Derived Strictly from PostgreSQL Server Aggregations */}
      <section className="metrics-grid" aria-label="Inventory Statistics">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Total Properties</span>
            <div className="metric-icon-box metric-blue">
              <svg className="metric-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          </div>
          <div className="metric-value">{totalHotels}</div>
          <div className="metric-footer">
            <span className="metric-badge metric-badge-success">Live from Database</span>
            <span className="metric-subtext">PostgreSQL 18.6 inventory</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Average Price</span>
            <div className="metric-icon-box metric-orange">
              <svg className="metric-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="metric-value">{formatCurrency(stats.averagePrice)}</div>
          <div className="metric-footer">
            <span className="metric-subtext">PostgreSQL server aggregate (AVG)</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Price Range</span>
            <div className="metric-icon-box metric-yellow">
              <svg className="metric-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
          <div className="metric-value metric-value-range">
            {totalHotels > 0
              ? Number(stats.minPrice) === Number(stats.maxPrice)
                ? formatCurrency(stats.minPrice)
                : `${formatCurrency(stats.minPrice)} – ${formatCurrency(stats.maxPrice)}`
              : formatCurrency(0)}
          </div>
          <div className="metric-footer">
            <span className="metric-subtext">
              {totalHotels > 0 && Number(stats.minPrice) === Number(stats.maxPrice)
                ? 'All properties have the same rate'
                : 'Portfolio price bounds (MIN – MAX)'}
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Properties with Images</span>
            <div className="metric-icon-box metric-green">
              <svg className="metric-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
          <div className="metric-value">{stats.propertiesWithImages}</div>
          <div className="metric-footer">
            <span className="metric-subtext">Recorded image path in database</span>
          </div>
        </div>
      </section>

      {/* Recent Properties Section */}
      <section className="recent-properties-section" aria-labelledby="recent-heading">
        <div className="section-header-row">
          <div>
            <h2 id="recent-heading" className="section-title">
              Recent Properties
            </h2>
            <p className="section-subtitle">Latest hotel additions to your management system</p>
          </div>
          <Link to="/hotels" className="btn btn-outline btn-sm">
            Manage All ({totalHotels}) &rarr;
          </Link>
        </div>

        {status === 'loading' && items.length === 0 ? (
          <div className="dashboard-loading">Loading recent properties...</div>
        ) : error ? (
          <div className="dashboard-error">
            Unable to connect to backend service. Please ensure the Express server is running.
          </div>
        ) : items.length === 0 ? (
          <div className="dashboard-empty-box">
            <div className="empty-box-title">No hotel properties found</div>
            <p className="empty-box-desc">
              Your database is currently empty. Get started by registering your first hotel property!
            </p>
            <Link to="/hotels/new" className="btn btn-primary btn-sm">
              Register First Hotel
            </Link>
          </div>
        ) : (
          <div className={`recent-properties-container ${canScrollRight ? 'has-overflow-right' : ''}`}>
            <div
              ref={scrollTrackRef}
              onScroll={updateScrollState}
              className="recent-properties-track"
              tabIndex={0}
              role="region"
              aria-label="Recent hotel properties horizontal scroll"
            >
              {items.map((hotel) => (
                <div key={hotel.id} className="recent-property-card-item">
                  <HotelCard hotel={hotel} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
