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
 * Single Hotel Card component displaying property inventory details.
 */
function HotelCard({ hotel, onDeleteClick }) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = getImageUrl(hotel.image_path);

  return (
    <article className="hotel-card" data-testid={`hotel-card-${hotel.id}`}>
      {/* Property Image Container */}
      <div className="hotel-card-media">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={`Exterior view of ${hotel.title}`}
            className="hotel-card-image"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="hotel-card-placeholder" aria-label="No image available for this property">
            <svg
              className="hotel-card-placeholder-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <span className="hotel-card-placeholder-text">No Image Available</span>
          </div>
        )}

        {/* Price Badge */}
        <div className="hotel-card-price-badge">
          <span className="hotel-card-price-value">{formatPrice(hotel.price)}</span>
        </div>
      </div>

      {/* Property Information */}
      <div className="hotel-card-content">
        <div className="hotel-card-header">
          <h3 className="hotel-card-title" title={hotel.title}>
            {hotel.title}
          </h3>
          <div className="hotel-card-coordinates" title={`Coordinates: ${hotel.latitude}, ${hotel.longitude}`}>
            <svg className="coord-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              {parseFloat(hotel.latitude).toFixed(4)}°, {parseFloat(hotel.longitude).toFixed(4)}°
            </span>
          </div>
        </div>

        <p className="hotel-card-description">
          {hotel.description}
        </p>

        {/* Card Footer Actions */}
        <div className="hotel-card-actions">
          <Link
            to={`/hotels/${hotel.id}`}
            className="btn btn-secondary btn-sm"
            aria-label={`View details for ${hotel.title}`}
          >
            Details
          </Link>
          <Link
            to={`/hotels/${hotel.id}/edit`}
            className="btn btn-outline btn-sm"
            aria-label={`Edit ${hotel.title}`}
          >
            Edit
          </Link>
          <button
            type="button"
            className="btn btn-danger-outline btn-sm"
            onClick={() => onDeleteClick && onDeleteClick(hotel)}
            aria-label={`Delete ${hotel.title}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export default HotelCard;
