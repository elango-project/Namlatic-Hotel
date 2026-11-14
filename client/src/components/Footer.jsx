import React from 'react';
import { NavLink } from 'react-router-dom';

const DOCS_BASE_URL = 'https://github.com/elango-project/Namlatic-Hotel/blob/main/docs';

/**
 * Professional SaaS Footer for Namlatic Hotel Owner Portal.
 * Implements brand identity, working internal routes, verified documentation links,
 * and standard copyright disclaimer in a responsive navy dark theme.
 */
function Footer() {
  return (
    <footer className="app-footer" role="contentinfo" aria-label="Portal Footer">
      <div className="footer-container">
        <div className="footer-grid">
          {/* Section A: Brand */}
          <div className="footer-brand-section">
            <div className="footer-brand-header">
              <div className="brand-icon-box" aria-hidden="true">
                <span className="brand-letter">N</span>
              </div>
              <div className="footer-brand-titles">
                <span className="footer-brand-name">Namlatic Hotel Portal</span>
                <span className="footer-brand-sub">Management Suite</span>
              </div>
            </div>
            <p className="footer-brand-desc">
              Hotel Inventory Management Dashboard.
            </p>
          </div>

          {/* Section B: Quick Navigation */}
          <nav className="footer-col" aria-label="Footer quick navigation">
            <h3 className="footer-heading">Quick Navigation</h3>
            <ul className="footer-links">
              <li>
                <NavLink to="/" end className="footer-link">
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink to="/hotels" className="footer-link">
                  Hotel Inventory
                </NavLink>
              </li>
              <li>
                <NavLink to="/hotels/new" className="footer-link">
                  Add Hotel
                </NavLink>
              </li>
            </ul>
          </nav>

          {/* Section C: Resources */}
          <nav className="footer-col" aria-label="Footer resources">
            <h3 className="footer-heading">Resources</h3>
            <ul className="footer-links">
              <li>
                <a
                  href={`${DOCS_BASE_URL}/API_DOCUMENTATION.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-link"
                >
                  API Documentation
                </a>
              </li>
              <li>
                <a
                  href={`${DOCS_BASE_URL}/ARCHITECTURE.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-link"
                >
                  Architecture Documentation
                </a>
              </li>
              <li>
                <a
                  href={`${DOCS_BASE_URL}/DATABASE_GUIDE.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-link"
                >
                  Database Guide
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/elango-project/Namlatic-Hotel/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-link"
                >
                  Help &amp; Support
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Section D: Copyright */}
        <div className="footer-bottom">
          <p className="footer-copyright">
            &copy; 2026 Namlatic Hotel Portal. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
