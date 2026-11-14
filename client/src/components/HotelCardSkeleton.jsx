import React from 'react';

/**
 * Shimmer skeleton loading state for hotel cards.
 * Mirrors the information hierarchy of HotelCard: Media -> Title -> Price -> Desc -> Location -> Actions.
 */
function HotelCardSkeleton() {
  return (
    <div className="hotel-card skeleton-card" aria-hidden="true" data-testid="hotel-card-skeleton">
      <div className="skeleton-media skeleton-shimmer" />
      <div className="hotel-card-content">
        <div className="skeleton-line skeleton-title skeleton-shimmer" />
        <div className="skeleton-line skeleton-price skeleton-shimmer" />
        <div className="skeleton-line skeleton-desc skeleton-shimmer" />
        <div className="skeleton-line skeleton-desc-short skeleton-shimmer" />
        <div className="skeleton-line skeleton-coord skeleton-shimmer" />
        <div className="skeleton-actions">
          <div className="skeleton-btn skeleton-shimmer" />
          <div className="skeleton-btn skeleton-shimmer" />
          <div className="skeleton-btn skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
}

export default HotelCardSkeleton;
