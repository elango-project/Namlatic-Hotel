import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  fetchHotels,
  setTitleFilter,
  setPriceFilters,
  setPageOffset,
  resetFilters,
  deleteHotel,
} from '../features/hotels/hotelsSlice';
import HotelCard from '../components/HotelCard';
import HotelCardSkeleton from '../components/HotelCardSkeleton';
import FilterToolbar from '../components/FilterToolbar';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import ErrorAlert from '../components/ErrorAlert';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

function MyHotelsPage() {
  const dispatch = useDispatch();
  const location = useLocation();
  const { items, pagination, filters, status, error, deleteStatus } = useSelector(
    (state) => state.hotels
  );

  const [hotelToDelete, setHotelToDelete] = useState(null);
  const [flashMessage, setFlashMessage] = useState(location.state?.flash || null);

  // Clear router state after reading flash message
  useEffect(() => {
    if (location.state?.flash) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Trigger backend fetch when filters or pagination offset change
  useEffect(() => {
    const promise = dispatch(fetchHotels());
    return () => {
      promise.abort();
    };
  }, [dispatch, filters.title, filters.minPrice, filters.maxPrice, pagination.offset]);

  // Handlers for search, price, and pagination
  const handleSearchChange = useCallback(
    (newTitle) => {
      dispatch(setTitleFilter(newTitle));
    },
    [dispatch]
  );

  const handlePriceFilterChange = useCallback(
    ({ minPrice, maxPrice }) => {
      dispatch(setPriceFilters({ minPrice, maxPrice }));
    },
    [dispatch]
  );

  const handlePageChange = useCallback(
    (newOffset) => {
      dispatch(setPageOffset(newOffset));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [dispatch]
  );

  const handleResetFilters = useCallback(() => {
    dispatch(resetFilters());
  }, [dispatch]);

  const handleRetry = () => {
    dispatch(fetchHotels());
  };

  // Delete flow
  const handleDeleteConfirm = async () => {
    if (!hotelToDelete) return;
    await dispatch(deleteHotel(hotelToDelete.id));
    setHotelToDelete(null);
  };

  const isFiltered = Boolean(filters.title || filters.minPrice || filters.maxPrice);

  return (
    <div className="my-hotels-page">
      <Helmet>
        <title>My Hotels | Namlatic Hotel Owner Portal</title>
        <meta
          name="description"
          content="View, search, filter, and manage your complete portfolio of hotel properties. Filter by price range, search titles, and manage inventory details."
        />
      </Helmet>

      {/* Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Hotel Properties</h1>
          <p className="page-subtitle">
            Manage your hotel inventory, inspect details, and update property listings.
          </p>
        </div>
        <div className="header-total-badge">
          <span className="badge-total-label">Total Properties</span>
          <span className="badge-total-value">{pagination.total}</span>
        </div>
      </div>

      {/* Success / Flash Banner */}
      {flashMessage && (
        <div className="toast-notification toast-success" role="status" data-testid="flash-notification">
          <div className="toast-icon" aria-hidden="true">✓</div>
          <div className="toast-body">
            <span className="toast-title">Success</span>
            <span className="toast-message">{flashMessage.message}</span>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setFlashMessage(null)}
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Controls (Connected to Backend API) */}
      <FilterToolbar
        initialTitle={filters.title}
        initialMinPrice={filters.minPrice}
        initialMaxPrice={filters.maxPrice}
        onSearchChange={handleSearchChange}
        onPriceFilterChange={handlePriceFilterChange}
        onReset={handleResetFilters}
      />

      {/* Error State */}
      {status === 'failed' && (
        <ErrorAlert message={error} onRetry={handleRetry} />
      )}

      {/* Loading Skeletons */}
      {status === 'loading' && items.length === 0 && (
        <div className="hotels-grid" aria-busy="true" aria-label="Loading hotel properties">
          {Array.from({ length: 6 }).map((_, idx) => (
            <HotelCardSkeleton key={idx} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {status !== 'loading' && status !== 'failed' && items.length === 0 && (
        <EmptyState isFiltered={isFiltered} onReset={handleResetFilters} />
      )}

      {/* Hotels Grid */}
      {items.length > 0 && (
        <>
          <div className="hotels-grid" data-testid="hotels-grid">
            {items.map((hotel) => (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                onDeleteClick={(selectedHotel) => setHotelToDelete(selectedHotel)}
              />
            ))}
          </div>

          {/* Backend Pagination Controls */}
          <Pagination
            total={pagination.total}
            limit={pagination.limit}
            offset={pagination.offset}
            onPageChange={handlePageChange}
          />
        </>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(hotelToDelete)}
        hotelTitle={hotelToDelete?.title || ''}
        isDeleting={deleteStatus === 'loading'}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setHotelToDelete(null)}
      />
    </div>
  );
}

export default MyHotelsPage;
