import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../services/api';
import { formatCurrency } from '../config/currency';

/**
 * Formats a numeric string or number into standard currency representation.
 * Retains formatPrice alias for backward-compatibility.
 */
export const formatPrice = formatCurrency;

/**
 * Safely formats latitude and longitude into 4-decimal coordinates.
 * Returns null if either coordinate is missing, null, undefined, or non-numeric.
 */
export const formatCoordinates = (lat, lng) => {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') {
    return null;
  }
  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);
  if (Number.isNaN(numLat) || Number.isNaN(numLng) || !Number.isFinite(numLat) || !Number.isFinite(numLng)) {
    return null;
  }
  return `${numLat.toFixed(4)}°, ${numLng.toFixed(4)}°`;
};

/**
 * Single Hotel Card component displaying property inventory details.
 * Implements strict information hierarchy: Image -> Title -> Price -> Description -> Coordinates -> Actions.
 */
function HotelCard({ hotel, onDeleteClick }) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = getImageUrl(hotel?.image_path);
  const showImage = Boolean(imageUrl) && !imageError;
  const formattedCoords = formatCoordinates(hotel?.latitude, hotel?.longitude);

  return (
    <article className="hotel-card" data-testid={`hotel-card-${hotel?.id}`}>
      {/* 1. Hotel Image */}
      <div className="hotel-card-media">
        {showImage ? (
          <img
            src={imageUrl}
            alt={`Exterior view of ${hotel?.title || 'hotel property'}`}
            className="hotel-card-image"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="hotel-card-placeholder" aria-label="No image available for this property">
            <div className="hotel-card-placeholder-icon-wrap" aria-hidden="true">
              <svg
                className="hotel-card-placeholder-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <span className="hotel-card-placeholder-text">No Image Available</span>
          </div>
        )}
      </div>

      {/* Property Information */}
      <div className="hotel-card-content">
        {/* 2. Hotel Name */}
        <h3 className="hotel-card-title" title={hotel?.title || ''}>
          {hotel?.title || 'Untitled Property'}
        </h3>

        {/* 3. Price (placed in information section with prominent hierarchy) */}
        <div className="hotel-card-price-section">
          <span className="hotel-card-price-label">Price</span>
          <span className="hotel-card-price-value">{formatPrice(hotel?.price)}</span>
        </div>

        {/* 4. Description Preview */}
        <p className={`hotel-card-description ${!hotel?.description?.trim() ? 'hotel-card-description-empty' : ''}`}>
          {hotel?.description?.trim() || 'No description provided.'}
        </p>

        {/* 5. Location Coordinates (safely formatted, non-raw) */}
        <div
          className={`hotel-card-location ${!formattedCoords ? 'hotel-card-location-empty' : ''}`}
          title={formattedCoords ? `Coordinates: ${hotel?.latitude}, ${hotel?.longitude}` : 'Coordinates unavailable'}
        >
          <svg className="coord-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="hotel-card-coord-label">GPS:</span>
          <span className="hotel-card-coord-value">
            {formattedCoords || 'Coordinates unavailable'}
          </span>
        </div>

        {/* 6. Action Button Hierarchy (Details = Primary, Edit = Secondary, Delete = Destructive) */}
        <div className="hotel-card-actions">
          <Link
            to={`/hotels/${hotel?.id}`}
            className="btn btn-primary btn-sm hotel-card-btn"
            aria-label={`View details for ${hotel?.title || 'hotel property'}`}
          >
            Details
          </Link>
          <Link
            to={`/hotels/${hotel?.id}/edit`}
            className="btn btn-outline btn-sm hotel-card-btn"
            aria-label={`Edit ${hotel?.title || 'hotel property'}`}
          >
            Edit
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline btn-sm hotel-card-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (onDeleteClick && hotel) onDeleteClick(hotel);
            }}
            aria-label={`Delete ${hotel?.title || 'hotel property'}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export default HotelCard;
