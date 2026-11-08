import React, { useState, useEffect, useRef } from 'react';
import { APP_CURRENCY_SYMBOL } from '../config/currency';

/**
 * FilterToolbar for searching and filtering hotels.
 * Uses a 350ms debounce for title search to prevent flood queries.
 */
function FilterToolbar({
  initialTitle = '',
  initialMinPrice = '',
  initialMaxPrice = '',
  onSearchChange,
  onPriceFilterChange,
  onReset,
}) {
  const [searchTerm, setSearchTerm] = useState(initialTitle);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [priceError, setPriceError] = useState('');

  const isFirstRender = useRef(true);

  // Sync with props if reset externally
  useEffect(() => {
    setSearchTerm(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    setMinPrice(initialMinPrice);
    setMaxPrice(initialMaxPrice);
  }, [initialMinPrice, initialMaxPrice]);

  // Debounced search trigger
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      onSearchChange(searchTerm.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, onSearchChange]);

  const handleApplyPrice = (e) => {
    e.preventDefault();
    setPriceError('');

    const min = minPrice !== '' ? parseFloat(minPrice) : undefined;
    const max = maxPrice !== '' ? parseFloat(maxPrice) : undefined;

    if (min !== undefined && min < 0) {
      setPriceError('Min price cannot be negative.');
      return;
    }
    if (max !== undefined && max < 0) {
      setPriceError('Max price cannot be negative.');
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setPriceError('Min price cannot be greater than max price.');
      return;
    }

    onPriceFilterChange({
      minPrice: minPrice !== '' ? minPrice : '',
      maxPrice: maxPrice !== '' ? maxPrice : '',
    });
  };

  const handleClearAll = () => {
    setSearchTerm('');
    setMinPrice('');
    setMaxPrice('');
    setPriceError('');
    onReset();
  };

  const hasActiveFilters = Boolean(searchTerm || minPrice || maxPrice);

  return (
    <div className="filter-toolbar">
      <div className="filter-toolbar-grid">
        {/* Title Prefix Search */}
        <div className="search-field">
          <label htmlFor="search-hotel-title" className="sr-only">
            Search hotel name
          </label>
          <div className="search-input-wrapper">
            <svg
              className="search-input-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              id="search-hotel-title"
              type="text"
              className="search-input"
              placeholder="Search hotels by title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search input"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Price Range Filter Form */}
        <form className="price-filter-form" onSubmit={handleApplyPrice}>
          <div className="price-inputs">
            <div className={`price-input-wrapper ${APP_CURRENCY_SYMBOL ? 'has-symbol' : ''}`}>
              {APP_CURRENCY_SYMBOL && <span className="price-currency-symbol">{APP_CURRENCY_SYMBOL}</span>}
              <input
                id="min-price-input"
                type="number"
                step="any"
                min="0"
                className="price-input"
                placeholder="Min Price"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                aria-label="Minimum price"
              />
            </div>
            <span className="price-separator">to</span>
            <div className={`price-input-wrapper ${APP_CURRENCY_SYMBOL ? 'has-symbol' : ''}`}>
              {APP_CURRENCY_SYMBOL && <span className="price-currency-symbol">{APP_CURRENCY_SYMBOL}</span>}
              <input
                id="max-price-input"
                type="number"
                step="any"
                min="0"
                className="price-input"
                placeholder="Max Price"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                aria-label="Maximum price"
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-apply">
              Filter
            </button>
          </div>
        </form>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-reset"
            onClick={handleClearAll}
            aria-label="Reset all search and price filters"
          >
            Reset Filters
          </button>
        )}
      </div>

      {priceError && (
        <div className="filter-error-message" role="alert">
          {priceError}
        </div>
      )}
    </div>
  );
}

export default FilterToolbar;
