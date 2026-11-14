import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Helmet } from 'react-helmet-async';
import { fetchHotelById, clearCurrentHotel } from '../features/hotels/hotelsSlice';
import HotelLocationMap, { parseCoordinate, isValidCoordinate } from '../components/HotelLocationMap';
import ErrorAlert from '../components/ErrorAlert';
import { getImageUrl } from '../services/api';
import { formatCurrency } from '../config/currency';

/**
 * Helper to safely format ISO timestamps into localized date-time strings.
 * Returns null if timestamp is absent or invalid.
 *
 * @param {string|null|undefined} isoString
 * @returns {string|null} E.g., "Nov 6, 2026, 7:25 PM"
 */
export const formatDateTime = (isoString) => {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return null;
  }
};

export const PG_BIGINT_MAX = 9223372036854775807n;

/**
 * Validates route ID parameter for positive PostgreSQL BIGINT compatibility.
 * Rejects non-digits, zero, negative values, decimals, and values > 9223372036854775807n.
 * Evaluates using native BigInt without converting to JavaScript Number to prevent precision loss.
 *
 * @param {string|any} id
 * @returns {boolean}
 */
export const isValidRouteId = (id) => {
  if (typeof id !== 'string') return false;
  // Require original string to contain decimal digits only (rejects leading/trailing whitespace, signs, decimals, letters, scientific notation)
  if (!/^\d+$/.test(id)) return false;
  try {
    const val = BigInt(id);
    return val > 0n && val <= PG_BIGINT_MAX;
  } catch {
    return false;
  }
};

/**
 * HotelDetailsPage component.
 * Production-quality detail page implementing strict information hierarchy:
 * 1. Hotel Image (Hero banner with verified fallback)
 * 2. Hotel Title (Prominent h1 heading with action toolbar)
 * 3. Hotel Price (Centralized currency formatting)
 * 4. Full Hotel Description (Untruncated, pre-line)
 * 5. Latitude & Longitude (WGS 84 geolocation facts)
 * 6. Interactive Leaflet Map (Pinpoint coordinates with bounds validation)
 */
function HotelDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { currentHotel, currentHotelStatus, currentHotelError } = useSelector(
    (state) => state.hotels
  );

  const [imageError, setImageError] = useState(false);
  const [idValidationError, setIdValidationError] = useState(null);

  // Validate ID parameter and fetch hotel data; reset state and clear stale data on route change
  useEffect(() => {
    setImageError(false);

    if (!isValidRouteId(id)) {
      setIdValidationError(
        'Invalid hotel ID parameter. ID must be a positive integer within PostgreSQL BIGINT range (1 to 9223372036854775807).'
      );
      return;
    }
    setIdValidationError(null);

    const promise = dispatch(fetchHotelById(id));
    return () => {
      promise.abort();
      dispatch(clearCurrentHotel());
    };
  }, [dispatch, id]);

  // Determine if error is a 404 (Not Found)
  const isNotFound =
    currentHotelStatus === 'failed' &&
    (currentHotelError?.toLowerCase().includes('not found') ||
      currentHotelError?.includes('404'));

  // Hero image resolution
  const imageUrl = currentHotel?.image_path ? getImageUrl(currentHotel.image_path) : null;

  // Safe coordinate parsing and bounds validation (-90/90 lat, -180/180 lng)
  const latNum = parseCoordinate(currentHotel?.latitude);
  const lngNum = parseCoordinate(currentHotel?.longitude);
  const hasValidCoords = isValidCoordinate(latNum, lngNum);

  // Formatted timestamps (rendered only if backend returned them)
  const createdAtFormatted = formatDateTime(currentHotel?.created_at);
  const updatedAtFormatted = formatDateTime(currentHotel?.updated_at);

  return (
    <div className="hotel-details-container" data-testid="hotel-details-page">
      {/* Dynamic SEO Metadata */}
      <Helmet>
        {currentHotel ? (
          <>
            <title>{`${currentHotel.title || 'Hotel Property'} | Namlatic Hotel Portal`}</title>
            <meta
              name="description"
              content={
                currentHotel.description?.trim()
                  ? currentHotel.description.trim().slice(0, 155) + (currentHotel.description.trim().length > 155 ? '...' : '')
                  : 'Hotel inventory details and location map.'
              }
            />
          </>
        ) : isNotFound ? (
          <>
            <title>Hotel Not Found | Namlatic Hotel Portal</title>
            <meta name="description" content="The requested hotel property was not found in the portfolio." />
          </>
        ) : idValidationError ? (
          <>
            <title>Invalid Hotel ID | Namlatic Hotel Portal</title>
            <meta name="description" content="The specified hotel ID parameter is invalid." />
          </>
        ) : (
          <>
            <title>Hotel Details | Namlatic Hotel Portal</title>
            <meta name="description" content="View hotel details and geographical location." />
          </>
        )}
      </Helmet>

      {/* Breadcrumb Navigation */}
      <nav className="breadcrumbs" aria-label="Breadcrumb Navigation">
        <ol className="breadcrumb-list">
          <li className="breadcrumb-item">
            <Link to="/hotels" className="breadcrumb-link">
              My Hotels
            </Link>
          </li>
          <li className="breadcrumb-separator" aria-hidden="true">
            /
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {currentHotel ? currentHotel.title : idValidationError ? 'Invalid ID' : 'Property Details'}
          </li>
        </ol>
      </nav>

      {/* State 1: Invalid Route ID Error */}
      {idValidationError && (
        <div className="details-state-card" data-testid="invalid-id-error">
          <ErrorAlert
            message={idValidationError}
            onRetry={() => navigate('/hotels')}
          />
          <div className="details-error-actions">
            <Link to="/hotels" className="btn btn-primary">
              Return to My Hotels
            </Link>
          </div>
        </div>
      )}

      {/* State 2: Loading State */}
      {!idValidationError && currentHotelStatus === 'loading' && (
        <div className="details-loading-card" data-testid="hotel-details-loading">
          <div className="spinner-lg" aria-hidden="true" />
          <h3 className="loading-title">Retrieving Hotel Details</h3>
          <p className="loading-subtitle">Querying property record and coordinates from database...</p>
        </div>
      )}

      {/* State 3: Hotel Not Found (404) */}
      {!idValidationError && isNotFound && (
        <div className="details-state-card" data-testid="hotel-not-found">
          <div className="details-not-found-icon" aria-hidden="true">
            🏨
          </div>
          <h2 className="details-not-found-title">Hotel Property Not Found</h2>
          <p className="details-not-found-desc">
            The property with ID <strong>#{id}</strong> could not be located in your inventory. It may have been deleted or the ID is incorrect.
          </p>
          <div className="details-error-actions">
            <Link to="/hotels" className="btn btn-primary">
              Return to My Hotels
            </Link>
          </div>
        </div>
      )}

      {/* State 4: General Network/Server Failure */}
      {!idValidationError && !isNotFound && currentHotelStatus === 'failed' && (
        <div className="details-state-card" data-testid="hotel-details-error">
          <ErrorAlert
            message={currentHotelError || 'Failed to retrieve property details from the server.'}
            onRetry={() => dispatch(fetchHotelById(id))}
          />
          <div className="details-error-actions">
            <Link to="/hotels" className="btn btn-outline">
              Return to My Hotels
            </Link>
          </div>
        </div>
      )}

      {/* State 5: Success State */}
      {!idValidationError && currentHotelStatus === 'succeeded' && currentHotel && (
        <article className="hotel-details-article" data-testid="hotel-details-content">
          {/* 1. Hotel Image (Hero Media Container) */}
          <div className="details-hero-section">
            {imageUrl && !imageError ? (
              <img
                src={imageUrl}
                alt={`Exterior view of ${currentHotel.title || 'hotel property'}`}
                className="details-hero-image"
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className="details-hero-placeholder"
                aria-label="No photograph available for this hotel property"
                data-testid="details-no-image"
              >
                <svg
                  className="details-placeholder-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                <span className="details-placeholder-text">No Image Available</span>
                <span className="details-placeholder-sub">No photograph uploaded for this property</span>
              </div>
            )}
          </div>

          {/* 2. Hotel Title & Action Toolbar */}
          <header className="details-header">
            <div className="details-header-info">
              <h1 className="details-title">{currentHotel.title}</h1>
              {hasValidCoords && (
                <div className="details-coords-pill" title="Geographic WGS 84 Coordinates">
                  <svg className="coord-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {latNum.toFixed(4)}°, {lngNum.toFixed(4)}°
                  </span>
                </div>
              )}
            </div>

            <div className="details-actions">
              <Link
                to={`/hotels/${id}/edit`}
                className="btn btn-primary"
                aria-label={`Edit ${currentHotel.title}`}
              >
                <svg className="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                <span>Edit Hotel</span>
              </Link>
              <Link
                to="/hotels"
                className="btn btn-outline"
                aria-label="Back to hotel listing"
              >
                ← Back to My Hotels
              </Link>
            </div>
          </header>

          {/* 3. Price & Geolocation Facts Summary Cards */}
          <div className="details-facts-grid">
            <div className="details-fact-card">
              <span className="fact-label">Price</span>
              <div className="fact-value price-value">
                {formatCurrency(currentHotel.price)}
              </div>
              <span className="fact-caption">Portfolio rate</span>
            </div>

            <div className="details-fact-card">
              <span className="fact-label">Coordinates</span>
              <div className={`fact-value ${!hasValidCoords ? 'fact-value-muted' : ''}`}>
                {hasValidCoords ? `${latNum.toFixed(4)}°, ${lngNum.toFixed(4)}°` : 'Coordinates unavailable'}
              </div>
              <span className="fact-caption">
                {hasValidCoords ? 'WGS 84 Geolocation' : 'No geographic coordinates provided'}
              </span>
            </div>

            {/* Timestamps (rendered only if present from database) */}
            {(createdAtFormatted || updatedAtFormatted) && (
              <div className="details-fact-card">
                <span className="fact-label">Audit History</span>
                <div className="fact-dates">
                  {createdAtFormatted && (
                    <div className="date-item">
                      <span className="date-label">Created:</span> {createdAtFormatted}
                    </div>
                  )}
                  {updatedAtFormatted && (
                    <div className="date-item">
                      <span className="date-label">Updated:</span> {updatedAtFormatted}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Full Description Section */}
          <section className="details-section" aria-labelledby="desc-heading">
            <h2 id="desc-heading" className="section-title">
              About this Property
            </h2>
            <div className="details-description-box">
              <p className="details-description-text">
                {currentHotel.description?.trim() || 'No description provided for this hotel property.'}
              </p>
            </div>
          </section>

          {/* 5. Location & Map Section */}
          <section className="details-section" aria-labelledby="map-heading">
            <div className="section-header-row">
              <div>
                <h2 id="map-heading" className="section-title">
                  Location & Surroundings
                </h2>
                <p className="section-subtitle">
                  Interactive OpenStreetMap showing pinpoint geographic coordinates.
                </p>
              </div>
            </div>

            <HotelLocationMap
              latitude={currentHotel.latitude}
              longitude={currentHotel.longitude}
              title={currentHotel.title}
            />
          </section>
        </article>
      )}
    </div>
  );
}

export default HotelDetailsPage;
