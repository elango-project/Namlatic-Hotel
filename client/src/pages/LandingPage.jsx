import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import apiClient from '../services/api';

function LandingPage() {
  const [liveness, setLiveness] = useState({
    status: null,
    loading: true,
    error: null,
  });
  const [readiness, setReadiness] = useState({
    status: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // 1. Check Liveness (GET /api/health)
    apiClient
      .get('/health')
      .then((data) => setLiveness({ status: data, loading: false, error: null }))
      .catch((err) =>
        setLiveness({ status: null, loading: false, error: err.message })
      );

    // 2. Check Readiness (GET /api/ready)
    apiClient
      .get('/ready')
      .then((data) =>
        setReadiness({ status: data, loading: false, error: null })
      )
      .catch((err) => {
        const errorDetail =
          err.data?.database?.error || err.message || 'Database unavailable';
        setReadiness({
          status: err.data || null,
          loading: false,
          error: errorDetail,
        });
      });
  }, []);

  return (
    <>
      <Helmet>
        <title>Home – Namlatic Hotel Owner Portal</title>
      </Helmet>

      <section className="landing-hero">
        <h2>Welcome to the Owner Portal</h2>
        <p className="landing-subtitle">
          Hotel Inventory Management System
        </p>
      </section>

      <div className="landing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
        {/* Backend Liveness Probe */}
        <section className="landing-health">
          <h3>Backend Liveness (/api/health)</h3>
          {liveness.loading && <p className="health-loading">Checking server process…</p>}
          {liveness.error && (
            <p className="health-error">
              ❌ Backend unreachable: {liveness.error}
            </p>
          )}
          {liveness.status && (
            <div className="health-ok">
              <p>✅ Process Alive (HTTP 200)</p>
              <pre>{JSON.stringify(liveness.status, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Database Readiness Probe */}
        <section className="landing-health">
          <h3>Database Readiness (/api/ready)</h3>
          {readiness.loading && <p className="health-loading">Checking PostgreSQL connection…</p>}
          {!readiness.loading && readiness.status?.database?.connected && (
            <div className="health-ok">
              <p>✅ Database Connected (HTTP 200)</p>
              <pre>{JSON.stringify(readiness.status, null, 2)}</pre>
            </div>
          )}
          {!readiness.loading && !readiness.status?.database?.connected && (
            <div className="health-warning">
              <p style={{ color: '#e67e22', fontWeight: 600, marginBottom: '0.5rem' }}>
                ⚠️ Database Disconnected (HTTP 503)
              </p>
              <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.5rem' }}>
                {readiness.error}
              </p>
              {readiness.status && (
                <pre>{JSON.stringify(readiness.status, null, 2)}</pre>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default LandingPage;
