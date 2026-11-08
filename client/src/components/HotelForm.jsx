import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getImageUrl } from '../services/api';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Standard decimal numeric format regex.
 * Rejects scientific notation (e.g., '1e2', '1.5e-3'), multiple signs, and non-numeric characters.
 * Accepts optional leading minus for negative coordinates.
 */
export const NUMERIC_FORMAT_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Checks whether a string or numeric value has valid decimal places.
 * Exactly matches backend validation logic.
 *
 * @param {string|number} val
 * @param {number} maxDecimals
 * @returns {boolean}
 */
export const hasValidDecimals = (val, maxDecimals) => {
  const str = String(val).trim();
  const decimalIdx = str.indexOf('.');
  if (decimalIdx === -1) return true;
  return str.length - decimalIdx - 1 <= maxDecimals;
};

/**
 * Validates all hotel form values and optional selected file.
 * Returns an errors map where keys are field names.
 *
 * @param {object} values
 * @param {File|null} selectedFile
 * @returns {Record<string, string>}
 */
export const validateHotelFormData = (values, selectedFile) => {
  const errors = {};

  // 1. Title validation
  const title = (values.title || '').trim();
  if (!title) {
    errors.title = 'Hotel title is required.';
  } else if (title.length > 255) {
    errors.title = 'Hotel title cannot exceed 255 characters.';
  }

  // 2. Description validation
  const description = (values.description || '').trim();
  if (!description) {
    errors.description = 'Hotel description is required.';
  } else if (description.length > 5000) {
    errors.description = 'Hotel description cannot exceed 5000 characters.';
  }

  // 3. Latitude validation (-90 to +90, max 6 decimal places)
  const latStr = String(values.latitude ?? '').trim();
  if (!latStr) {
    errors.latitude = 'Latitude is required.';
  } else {
    const latNum = Number(latStr);
    if (!Number.isFinite(latNum) || isNaN(latNum) || !NUMERIC_FORMAT_REGEX.test(latStr)) {
      errors.latitude = 'Latitude must be a valid finite number.';
    } else if (latNum < -90.0 || latNum > 90.0) {
      errors.latitude = 'Latitude must be between -90.0 and 90.0 degrees.';
    } else if (!hasValidDecimals(latStr, 6)) {
      errors.latitude = 'Latitude cannot exceed 6 decimal places.';
    }
  }

  // 4. Longitude validation (-180 to +180, max 6 decimal places)
  const longStr = String(values.longitude ?? '').trim();
  if (!longStr) {
    errors.longitude = 'Longitude is required.';
  } else {
    const longNum = Number(longStr);
    if (!Number.isFinite(longNum) || isNaN(longNum) || !NUMERIC_FORMAT_REGEX.test(longStr)) {
      errors.longitude = 'Longitude must be a valid finite number.';
    } else if (longNum < -180.0 || longNum > 180.0) {
      errors.longitude = 'Longitude must be between -180.0 and 180.0 degrees.';
    } else if (!hasValidDecimals(longStr, 6)) {
      errors.longitude = 'Longitude cannot exceed 6 decimal places.';
    }
  }

  // 5. Price validation (> 0, max 2 decimal places)
  const priceStr = String(values.price ?? '').trim();
  if (!priceStr) {
    errors.price = 'Price is required.';
  } else {
    const priceNum = Number(priceStr);
    if (!Number.isFinite(priceNum) || isNaN(priceNum) || !NUMERIC_FORMAT_REGEX.test(priceStr)) {
      errors.price = 'Price must be a valid finite number.';
    } else if (priceNum <= 0) {
      errors.price = 'Price must be greater than zero.';
    } else if (!hasValidDecimals(priceStr, 2)) {
      errors.price = 'Price cannot have more than 2 decimal places.';
    }
  }

  // 6. Optional Image validation
  if (selectedFile) {
    const ext = selectedFile.name ? ('.' + selectedFile.name.split('.').pop()).toLowerCase() : '';
    const mimeValid = selectedFile.type ? ALLOWED_MIME_TYPES.has(selectedFile.type) : false;
    const extValid = ALLOWED_EXTENSIONS.has(ext);

    if (!mimeValid && !extValid) {
      errors.image = 'Invalid image format. Only JPEG, PNG, and WebP images are accepted.';
    } else if (selectedFile.size > MAX_IMAGE_SIZE) {
      errors.image = 'Image file size exceeds the 5 MB limit (maximum 5 MB allowed).';
    }
  }

  return errors;
};

/**
 * Reusable Hotel Form Component supporting both Create and Edit modes.
 *
 * @param {object} props
 * @param {object} [props.initialData] - Existing hotel data if editing
 * @param {boolean} [props.isEdit=false] - Whether form is in edit mode
 * @param {(formData: FormData) => Promise<void>} props.onSubmit - Submission handler
 * @param {boolean} [props.isLoading=false] - Form submission in-progress state
 * @param {string|null} [props.serverError=null] - Server-side error banner
 * @param {() => void} [props.onCancel] - Cancel navigation handler
 */
function HotelForm({
  initialData = null,
  isEdit = false,
  onSubmit,
  isLoading = false,
  serverError = null,
  onCancel,
}) {
  const [values, setValues] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    latitude: initialData?.latitude != null ? String(initialData.latitude) : '',
    longitude: initialData?.longitude != null ? String(initialData.longitude) : '',
    price: initialData?.price != null ? String(initialData.price) : '',
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);

  // Initialize previewUrl from existing hotel image (if in edit mode)
  const initialImageUrl = initialData?.image_path ? getImageUrl(initialData.image_path) : null;
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl);
  const [imageError, setImageError] = useState(false);

  // Keep ref to current blob URL to ensure revocation on unmount or file change
  const currentBlobUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  // Refs for focusing first invalid element
  const fieldRefs = {
    title: useRef(null),
    description: useRef(null),
    latitude: useRef(null),
    longitude: useRef(null),
    price: useRef(null),
    image: useRef(null),
  };

  // Sync state if initialData changes (e.g. after async fetch completes)
  useEffect(() => {
    if (initialData) {
      setValues({
        title: initialData.title || '',
        description: initialData.description || '',
        latitude: initialData.latitude != null ? String(initialData.latitude) : '',
        longitude: initialData.longitude != null ? String(initialData.longitude) : '',
        price: initialData.price != null ? String(initialData.price) : '',
      });
      const existingUrl = initialData.image_path ? getImageUrl(initialData.image_path) : null;
      // Only set preview if user hasn't selected a replacement file yet
      if (!selectedFile) {
        setPreviewUrl(existingUrl);
        setImageError(false);
      }
    }
  }, [initialData, selectedFile]);

  // Clean up any active blob object URL on unmount to prevent browser memory leaks
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);

  /**
   * Updates preview URL while safely managing previous object URL lifecycle.
   */
  const updateBlobPreview = useCallback((file) => {
    // Revoke previous blob URL if one exists
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      currentBlobUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setImageError(false);
    } else {
      // Revert to existing image if in edit mode, or null if in create mode
      setPreviewUrl(initialImageUrl);
      setImageError(false);
    }
  }, [initialImageUrl]);

  /**
   * Handles text input changes.
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));

    // Clear error for field once user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  /**
   * Validates individual field on blur.
   */
  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const validationErrors = validateHotelFormData(values, selectedFile);
    if (validationErrors[name]) {
      setErrors((prev) => ({ ...prev, [name]: validationErrors[name] }));
    }
  };

  /**
   * Handles file selection from <input type="file">.
   */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    // Validate image format and size
    const ext = ('.' + file.name.split('.').pop()).toLowerCase();
    const mimeValid = file.type ? ALLOWED_MIME_TYPES.has(file.type) : false;
    const extValid = ALLOWED_EXTENSIONS.has(ext);

    if (!mimeValid && !extValid) {
      if (e.target) e.target.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrors((prev) => ({
        ...prev,
        image: 'Invalid image format. Only JPEG, PNG, and WebP images are accepted.',
      }));
      setSelectedFile(null);
      updateBlobPreview(null);
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      if (e.target) e.target.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrors((prev) => ({
        ...prev,
        image: 'Image file size exceeds the 5 MB limit (maximum 5 MB allowed).',
      }));
      setSelectedFile(null);
      updateBlobPreview(null);
      return;
    }

    // Clear any previous image errors
    setErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });

    setSelectedFile(file);
    updateBlobPreview(file);
  };

  /**
   * Clears the newly selected file and restores the initial image state.
   */
  const handleCancelSelectedImage = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSelectedFile(null);
    updateBlobPreview(null);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });
  };

  /**
   * Handles form submission.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mark all fields touched
    setTouched({
      title: true,
      description: true,
      latitude: true,
      longitude: true,
      price: true,
      image: true,
    });

    const validationErrors = validateHotelFormData(values, selectedFile);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);

      // Focus first invalid input element for accessible UX
      const fieldOrder = ['title', 'description', 'latitude', 'longitude', 'price', 'image'];
      for (const fieldName of fieldOrder) {
        if (validationErrors[fieldName] && fieldRefs[fieldName]?.current) {
          fieldRefs[fieldName].current.focus();
          break;
        }
      }
      return;
    }

    // Assemble multipart FormData payload
    const formData = new FormData();
    formData.append('title', values.title.trim());
    formData.append('description', values.description.trim());
    formData.append('latitude', String(values.latitude).trim());
    formData.append('longitude', String(values.longitude).trim());
    formData.append('price', String(values.price).trim());

    // Only append image if the user selected a new file
    if (selectedFile) {
      formData.append('image', selectedFile);
    }

    if (onSubmit) {
      await onSubmit(formData);
    }
  };

  const hasReplacementSelected = Boolean(selectedFile);
  const hasExistingImage = Boolean(initialImageUrl);
  const isImageActive = Boolean(previewUrl) && !imageError;

  return (
    <form
      className="hotel-form"
      onSubmit={handleSubmit}
      noValidate
      data-testid="hotel-form"
      aria-label={isEdit ? 'Edit Hotel Property Form' : 'Create Hotel Property Form'}
    >
      {/* Server Error Banner */}
      {serverError && (
        <div className="form-alert form-alert-danger" role="alert" data-testid="form-server-error">
          <svg className="form-alert-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="form-alert-body">
            <strong>Action Failed</strong>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      {/* Field: Hotel Title */}
      <div className={`form-group ${errors.title ? 'has-error' : ''}`}>
        <label htmlFor="hotel-title" className="form-label">
          Hotel Property Title <span className="required-star" aria-hidden="true">*</span>
        </label>
        <input
          ref={fieldRefs.title}
          id="hotel-title"
          name="title"
          type="text"
          className={`form-input ${errors.title ? 'is-invalid' : ''}`}
          placeholder="e.g. Seaside Paradise Resort & Spa"
          value={values.title}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={255}
          disabled={isLoading}
          aria-required="true"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
          autoComplete="off"
        />
        <div className="form-field-meta">
          {errors.title ? (
            <span id="title-error" className="form-error" role="alert">
              {errors.title}
            </span>
          ) : (
            <span className="form-hint">Official commercial name of the hotel property.</span>
          )}
          <span className="char-counter">{values.title.length}/255</span>
        </div>
      </div>

      {/* Field: Description */}
      <div className={`form-group ${errors.description ? 'has-error' : ''}`}>
        <label htmlFor="hotel-description" className="form-label">
          Description <span className="required-star" aria-hidden="true">*</span>
        </label>
        <textarea
          ref={fieldRefs.description}
          id="hotel-description"
          name="description"
          rows={4}
          className={`form-textarea ${errors.description ? 'is-invalid' : ''}`}
          placeholder="Describe property amenities, guest suites, dining options, proximity to attractions..."
          value={values.description}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={5000}
          disabled={isLoading}
          aria-required="true"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        <div className="form-field-meta">
          {errors.description ? (
            <span id="description-error" className="form-error" role="alert">
              {errors.description}
            </span>
          ) : (
            <span className="form-hint">Detailed narrative highlighting guest experience and facilities.</span>
          )}
          <span className="char-counter">{values.description.length}/5000</span>
        </div>
      </div>

      {/* Coordinates Two-Column Grid */}
      <div className="form-row form-row-2">
        {/* Field: Latitude */}
        <div className={`form-group ${errors.latitude ? 'has-error' : ''}`}>
          <label htmlFor="hotel-latitude" className="form-label">
            Latitude <span className="required-star" aria-hidden="true">*</span>
          </label>
          <div className="input-with-prefix">
            <span className="input-prefix" aria-hidden="true">🌐</span>
            <input
              ref={fieldRefs.latitude}
              id="hotel-latitude"
              name="latitude"
              type="text"
              inputMode="decimal"
              className={`form-input ${errors.latitude ? 'is-invalid' : ''}`}
              placeholder="e.g. 24.453884"
              value={values.latitude}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isLoading}
              aria-required="true"
              aria-invalid={Boolean(errors.latitude)}
              aria-describedby={errors.latitude ? 'latitude-error' : 'latitude-hint'}
              autoComplete="off"
            />
          </div>
          {errors.latitude ? (
            <span id="latitude-error" className="form-error" role="alert">
              {errors.latitude}
            </span>
          ) : (
            <span id="latitude-hint" className="form-hint">Between -90.0 and +90.0 (up to 6 decimals)</span>
          )}
        </div>

        {/* Field: Longitude */}
        <div className={`form-group ${errors.longitude ? 'has-error' : ''}`}>
          <label htmlFor="hotel-longitude" className="form-label">
            Longitude <span className="required-star" aria-hidden="true">*</span>
          </label>
          <div className="input-with-prefix">
            <span className="input-prefix" aria-hidden="true">🌐</span>
            <input
              ref={fieldRefs.longitude}
              id="hotel-longitude"
              name="longitude"
              type="text"
              inputMode="decimal"
              className={`form-input ${errors.longitude ? 'is-invalid' : ''}`}
              placeholder="e.g. 54.377344"
              value={values.longitude}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={isLoading}
              aria-required="true"
              aria-invalid={Boolean(errors.longitude)}
              aria-describedby={errors.longitude ? 'longitude-error' : 'longitude-hint'}
              autoComplete="off"
            />
          </div>
          {errors.longitude ? (
            <span id="longitude-error" className="form-error" role="alert">
              {errors.longitude}
            </span>
          ) : (
            <span id="longitude-hint" className="form-hint">Between -180.0 and +180.0 (up to 6 decimals)</span>
          )}
        </div>
      </div>

      {/* Field: Price */}
      <div className={`form-group ${errors.price ? 'has-error' : ''}`}>
        <label htmlFor="hotel-price" className="form-label">
          Price <span className="required-star" aria-hidden="true">*</span>
        </label>
        <div className="price-input-wrapper">
          <input
            ref={fieldRefs.price}
            id="hotel-price"
            name="price"
            type="text"
            inputMode="decimal"
            className={`form-input ${errors.price ? 'is-invalid' : ''}`}
            placeholder="e.g. 199.50"
            value={values.price}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isLoading}
            aria-required="true"
            aria-invalid={Boolean(errors.price)}
            aria-describedby={errors.price ? 'price-error' : 'price-hint'}
            autoComplete="off"
          />
        </div>
        {errors.price ? (
          <span id="price-error" className="form-error" role="alert">
            {errors.price}
          </span>
        ) : (
          <span id="price-hint" className="form-hint">Listed price for the property (positive number, maximum 2 decimal places).</span>
        )}
      </div>

      {/* Field: Property Image Upload & Preview */}
      <div className={`form-group image-upload-group ${errors.image ? 'has-error' : ''}`}>
        <label htmlFor="hotel-image" className="form-label">
          Hotel Property Photo <span className="optional-badge">(Optional)</span>
        </label>

        <div className="image-uploader-layout">
          {/* Visual Preview Box */}
          <div className="image-preview-card" data-testid="image-preview-container">
            {isImageActive ? (
              <div className="preview-media-wrapper">
                <img
                  src={previewUrl}
                  alt={`Preview of ${values.title.trim() || 'hotel property'}`}
                  className="preview-image"
                  onError={() => setImageError(true)}
                />
                <div className="preview-status-pill">
                  {hasReplacementSelected
                    ? 'New Image Ready'
                    : isEdit
                    ? 'Current Image'
                    : 'Image Loaded'}
                </div>
              </div>
            ) : (
              <div className="preview-placeholder" aria-label="No image selected">
                <svg
                  className="placeholder-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="placeholder-text">No Image Uploaded</span>
                <span className="placeholder-subtext">Optional property hero image</span>
              </div>
            )}
          </div>

          {/* Upload Controls & Actions */}
          <div className="image-controls-panel">
            <div className="file-input-wrapper">
              <input
                ref={(el) => {
                  fileInputRef.current = el;
                  fieldRefs.image.current = el;
                }}
                id="hotel-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="file-input-hidden"
                onChange={handleFileChange}
                disabled={isLoading}
                aria-invalid={Boolean(errors.image)}
                aria-describedby={errors.image ? 'image-error' : 'image-hint'}
              />
              <button
                type="button"
                className="btn btn-outline btn-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <svg className="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{hasReplacementSelected || hasExistingImage ? 'Replace Photo' : 'Select Photo'}</span>
              </button>

              {/* Cancel / Restore selected image action */}
              {hasReplacementSelected && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-cancel-image"
                  onClick={handleCancelSelectedImage}
                  disabled={isLoading}
                  aria-label={hasExistingImage ? 'Revert to original image' : 'Remove selected photo'}
                >
                  <svg className="btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>{hasExistingImage ? 'Revert to Original' : 'Remove Photo'}</span>
                </button>
              )}
            </div>

            {selectedFile && (
              <div className="selected-file-meta" data-testid="selected-file-name">
                <span className="file-name" title={selectedFile.name}>{selectedFile.name}</span>
                <span className="file-size">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
              </div>
            )}

            {errors.image ? (
              <span id="image-error" className="form-error" role="alert">
                {errors.image}
              </span>
            ) : (
              <p id="image-hint" className="image-format-hint">
                Accepted: JPEG, PNG, or WebP. Maximum file size: 5 MB.
                {isEdit && !hasReplacementSelected && hasExistingImage && (
                  <span className="image-keep-note"> Current photo will be preserved if no new file is chosen.</span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="form-actions">
        {onCancel && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-submit"
          disabled={isLoading}
          data-testid="submit-button"
        >
          {isLoading ? (
            <>
              <span className="spinner-sm" aria-hidden="true" />
              <span>{isEdit ? 'Saving Changes...' : 'Creating Property...'}</span>
            </>
          ) : (
            <span>{isEdit ? 'Save Changes' : 'Register Hotel Property'}</span>
          )}
        </button>
      </div>
    </form>
  );
}

export default HotelForm;
