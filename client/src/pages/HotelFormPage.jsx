import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Helmet } from 'react-helmet-async';
import {
  fetchHotelById,
  createHotel,
  updateHotel,
  clearCurrentHotel,
  clearSaveStatus,
  fetchHotelStats,
} from '../features/hotels/hotelsSlice';
import HotelForm from '../components/HotelForm';
import ErrorAlert from '../components/ErrorAlert';
import { isValidRouteId } from './HotelDetailsPage';

/**
 * HotelFormPage handles both:
 * - /hotels/new        (Create Mode)
 * - /hotels/:id/edit   (Edit Mode)
 */
function HotelFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const {
    currentHotel,
    currentHotelStatus,
    currentHotelError,
    saveStatus,
    saveError,
  } = useSelector((state) => state.hotels);

  const [idValidationError, setIdValidationError] = useState(null);

  // When in edit mode, fetch existing hotel by ID
  useEffect(() => {
    if (isEdit) {
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
      };
    } else {
      dispatch(clearCurrentHotel());
    }
  }, [dispatch, isEdit, id]);

  // Clean up save state when leaving the page
  useEffect(() => {
    return () => {
      dispatch(clearSaveStatus());
      dispatch(clearCurrentHotel());
    };
  }, [dispatch]);

  const handleCreate = async (formData) => {
    const resultAction = await dispatch(createHotel(formData));
    if (createHotel.fulfilled.match(resultAction)) {
      // Invalidate dashboard stats cache so fresh statistics are loaded on dashboard visit
      dispatch(fetchHotelStats());
      navigate('/hotels', {
        state: {
          flash: {
            type: 'success',
            message: `Property "${resultAction.payload.title}" was registered successfully!`,
          },
        },
      });
    }
  };

  const handleUpdate = async (formData) => {
    const resultAction = await dispatch(updateHotel({ id, formData }));
    if (updateHotel.fulfilled.match(resultAction)) {
      // Invalidate dashboard stats cache so fresh statistics are loaded on dashboard visit
      dispatch(fetchHotelStats());
      navigate('/hotels', {
        state: {
          flash: {
            type: 'success',
            message: `Property "${resultAction.payload.title}" was updated successfully!`,
          },
        },
      });
    }
  };

  const handleCancel = () => {
    navigate('/hotels');
  };

  const pageTitle = isEdit
    ? currentHotel?.title
      ? `Edit ${currentHotel.title} | Namlatic Hotel Portal`
      : 'Edit Hotel Property | Namlatic Hotel Portal'
    : 'Register New Property | Namlatic Hotel Portal';

  return (
    <div className="hotel-form-page-container">
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      {/* Breadcrumb Navigation */}
      <nav className="form-breadcrumbs" aria-label="Breadcrumb">
        <ol className="breadcrumb-list">
          <li className="breadcrumb-item">
            <Link to="/hotels" className="breadcrumb-link">
              My Hotels
            </Link>
          </li>
          <li className="breadcrumb-separator" aria-hidden="true">/</li>
          <li className="breadcrumb-item breadcrumb-current" aria-current="page">
            {isEdit ? 'Edit Property' : 'Register New Property'}
          </li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="form-page-header">
        <div className="form-header-text">
          <h2 className="form-page-title">
            {isEdit
              ? `Edit: ${currentHotel?.title || 'Hotel Property'}`
              : 'Register New Hotel Property'}
          </h2>
          <p className="form-page-subtitle">
            {isEdit
              ? 'Update property details, GPS coordinates, pricing, or replace the hero photo.'
              : 'Add a new property to your Namlatic inventory portfolio with coordinates and pricing.'}
          </p>
        </div>
        <Link to="/hotels" className="btn btn-outline btn-sm">
          ← Back to Inventory
        </Link>
      </div>

      {/* Error state: Invalid ID param */}
      {idValidationError && (
        <div className="form-state-card" data-testid="invalid-id-error">
          <ErrorAlert
            message={idValidationError}
            onRetry={() => navigate('/hotels')}
          />
        </div>
      )}

      {/* Loading state: Fetching hotel for editing */}
      {isEdit && !idValidationError && currentHotelStatus === 'loading' && (
        <div className="form-loading-card" data-testid="hotel-form-loading">
          <div className="spinner-lg" aria-hidden="true" />
          <p className="loading-text">Retrieving property details from database...</p>
        </div>
      )}

      {/* Error state: Hotel not found or fetch failed */}
      {isEdit && !idValidationError && currentHotelStatus === 'failed' && (
        <div className="form-state-card" data-testid="hotel-fetch-error">
          <ErrorAlert
            message={currentHotelError || 'Unable to locate the specified hotel property.'}
            onRetry={() => dispatch(fetchHotelById(id))}
          />
          <div className="error-actions" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/hotels" className="btn btn-primary">
              Return to My Hotels
            </Link>
          </div>
        </div>
      )}

      {/* Main Form: Rendered for Create Mode OR once Edit hotel is loaded */}
      {(!isEdit || (isEdit && currentHotelStatus === 'succeeded' && currentHotel)) && (
        <div className="form-card-wrapper">
          <HotelForm
            initialData={isEdit ? currentHotel : null}
            isEdit={isEdit}
            onSubmit={isEdit ? handleUpdate : handleCreate}
            isLoading={saveStatus === 'loading'}
            serverError={saveError}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
}

export default HotelFormPage;
