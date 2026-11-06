import React from 'react';

/**
 * EmptyState component displayed when no hotels match filters or exist in the inventory.
 */
function EmptyState({ isFiltered, onReset }) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <div className="empty-state-icon-wrapper">
        <svg
          className="empty-state-icon"
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
      </div>
      <h3 className="empty-state-title">
        {isFiltered ? 'No matching hotels found' : 'No hotel properties yet'}
      </h3>
      <p className="empty-state-description">
        {isFiltered
          ? 'No properties matched your current search and price filter criteria. Try adjusting your parameters.'
          : 'Your inventory is currently empty. Register your first property to start managing inventory.'}
      </p>
      {isFiltered && onReset && (
        <button type="button" className="btn btn-primary" onClick={onReset}>
          Reset All Filters
        </button>
      )}
    </div>
  );
}

export default EmptyState;
