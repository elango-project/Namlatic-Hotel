import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HotelForm, { validateHotelFormData, hasValidDecimals } from '../components/HotelForm';

describe('HotelForm Component (Phase 4B)', () => {
  let createObjectURLSpy;
  let revokeObjectURLSpy;

  beforeEach(() => {
    createObjectURLSpy = vi.fn((file) => `blob:http://localhost:5173/${file?.name || 'mock-id'}`);
    revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validHotelData = {
    id: '42',
    title: 'Namlatic Grand Palace',
    description: 'A luxurious five-star resort located along the serene azure coastline.',
    latitude: '24.453884',
    longitude: '54.377344',
    price: '299.99',
    image_path: '/uploads/hotels/sample-palace.jpg',
  };

  // 1. Form renders in create mode
  it('1. Form renders in create mode with empty fields and default button label', () => {
    render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    expect(screen.getByRole('form', { name: /create hotel property form/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/hotel property title/i)).toHaveValue('');
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
    expect(screen.getByLabelText(/latitude/i)).toHaveValue('');
    expect(screen.getByLabelText(/longitude/i)).toHaveValue('');
    expect(screen.getByLabelText(/^price/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /register hotel property/i })).toBeInTheDocument();
    expect(screen.getByText(/no image uploaded/i)).toBeInTheDocument();
  });

  // 2. Required field validation
  it('2. Required field validation: blocks submission and shows error messages when fields are empty', async () => {
    const onSubmit = vi.fn();
    render(<HotelForm isEdit={false} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /register hotel property/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Hotel title is required.')).toBeInTheDocument();
    expect(screen.getByText('Hotel description is required.')).toBeInTheDocument();
    expect(screen.getByText('Latitude is required.')).toBeInTheDocument();
    expect(screen.getByText('Longitude is required.')).toBeInTheDocument();
    expect(screen.getByText('Price is required.')).toBeInTheDocument();
  });

  // 3. Title length validation
  it('3. Title length validation: rejects title exceeding 255 characters', () => {
    const tooLongTitle = 'A'.repeat(256);
    const errors = validateHotelFormData({
      title: tooLongTitle,
      description: 'Valid description',
      latitude: '25.0',
      longitude: '55.0',
      price: '100.00',
    }, null);

    expect(errors.title).toBe('Hotel title cannot exceed 255 characters.');
  });

  // 4. Latitude and longitude boundaries
  it('4. Latitude and longitude boundaries: accepts valid negative/positive values and rejects out-of-range bounds', () => {
    // Required valid coordinate test cases (including negative values)
    const validCoords = [
      { lat: '-33.8688', lng: '151.2093' },
      { lat: '-90', lng: '-70.6693' },
      { lat: '90', lng: '-180' },
      { lat: '0', lng: '180' },
      { lat: '-90.0', lng: '-180.0' },
    ];

    for (const { lat, lng } of validCoords) {
      const errors = validateHotelFormData({
        title: 'Valid Hotel',
        description: 'Valid Desc',
        latitude: lat,
        longitude: lng,
        price: '100',
      }, null);
      expect(errors.latitude).toBeUndefined();
      expect(errors.longitude).toBeUndefined();
    }

    // Latitude out of range (> 90 or < -90)
    const latOver = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '90.000001',
      longitude: '50.0',
      price: '100',
    }, null);
    expect(latOver.latitude).toBe('Latitude must be between -90.0 and 90.0 degrees.');

    const latUnder = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '-90.000001',
      longitude: '50.0',
      price: '100',
    }, null);
    expect(latUnder.latitude).toBe('Latitude must be between -90.0 and 90.0 degrees.');

    // Longitude out of range (> 180 or < -180)
    const longOver = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '25.0',
      longitude: '180.000001',
      price: '100',
    }, null);
    expect(longOver.longitude).toBe('Longitude must be between -180.0 and 180.0 degrees.');

    const longUnder = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '25.0',
      longitude: '-180.000001',
      price: '100',
    }, null);
    expect(longUnder.longitude).toBe('Longitude must be between -180.0 and 180.0 degrees.');
  });

  // 5. Decimal precision validation
  it('5. Decimal precision validation: rejects > 6 decimals for coordinates and > 2 decimals for price', () => {
    expect(hasValidDecimals('24.123456', 6)).toBe(true);
    expect(hasValidDecimals('-33.8688', 6)).toBe(true);
    expect(hasValidDecimals('-33.868812', 6)).toBe(true);
    expect(hasValidDecimals('-33.8688123', 6)).toBe(false);
    expect(hasValidDecimals('24.1234567', 6)).toBe(false);

    expect(hasValidDecimals('199.99', 2)).toBe(true);
    expect(hasValidDecimals('199.999', 2)).toBe(false);

    const precisionErrors = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid description',
      latitude: '-33.8688123',
      longitude: '-70.6693123',
      price: '99.999',
    }, null);

    expect(precisionErrors.latitude).toBe('Latitude cannot exceed 6 decimal places.');
    expect(precisionErrors.longitude).toBe('Longitude cannot exceed 6 decimal places.');
    expect(precisionErrors.price).toBe('Price cannot have more than 2 decimal places.');
  });

  // 6. Price validation
  it('6. Price validation: rejects price <= 0 and non-numeric values', () => {
    const zeroPrice = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '20',
      longitude: '50',
      price: '0',
    }, null);
    expect(zeroPrice.price).toBe('Price must be greater than zero.');

    const negativePrice = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '20',
      longitude: '50',
      price: '-15.50',
    }, null);
    expect(negativePrice.price).toBe('Price must be greater than zero.');

    const nonNumeric = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '20',
      longitude: '50',
      price: 'abc',
    }, null);
    expect(nonNumeric.price).toBe('Price must be a valid finite number.');

    // Malformed inputs: trailing alphabetic characters (confirming parseFloat is not used)
    const trailingAlpha = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '12abc',
      longitude: '50.123xyz',
      price: '99.99USD',
    }, null);
    expect(trailingAlpha.latitude).toBe('Latitude must be a valid finite number.');
    expect(trailingAlpha.longitude).toBe('Longitude must be a valid finite number.');
    expect(trailingAlpha.price).toBe('Price must be a valid finite number.');

    // Malformed double operators
    const doubleUnary = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '--5',
      longitude: '++10',
      price: '--50',
    }, null);
    expect(doubleUnary.latitude).toBe('Latitude must be a valid finite number.');
    expect(doubleUnary.longitude).toBe('Longitude must be a valid finite number.');
    expect(doubleUnary.price).toBe('Price must be a valid finite number.');

    // Infinity and -Infinity
    const infiniteValues = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: 'Infinity',
      longitude: '-Infinity',
      price: 'Infinity',
    }, null);
    expect(infiniteValues.latitude).toBe('Latitude must be a valid finite number.');
    expect(infiniteValues.longitude).toBe('Longitude must be a valid finite number.');
    expect(infiniteValues.price).toBe('Price must be a valid finite number.');

    // Scientific notation (1e2, 1.5e-3) consistently rejected
    const sciNotation = validateHotelFormData({
      title: 'Hotel',
      description: 'Desc',
      latitude: '1e2',
      longitude: '-1.5e-3',
      price: '1e2',
    }, null);
    expect(sciNotation.latitude).toBe('Latitude must be a valid finite number.');
    expect(sciNotation.longitude).toBe('Longitude must be a valid finite number.');
    expect(sciNotation.price).toBe('Price must be a valid finite number.');
  });

  // 7. Invalid image type rejection
  it('7. Invalid image type rejection: rejects unsupported file formats such as text, gif, or pdf', () => {
    const invalidFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
    const errors = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '25.0',
      longitude: '55.0',
      price: '100',
    }, invalidFile);

    expect(errors.image).toBe('Invalid image format. Only JPEG, PNG, and WebP images are accepted.');
  });

  // 8. File size above 5 MB rejection
  it('8. File size above 5 MB rejection: rejects files exceeding 5 MB limit', () => {
    // 6 MB file
    const oversizedFile = new File(['A'.repeat(6 * 1024 * 1024)], 'large-photo.jpg', { type: 'image/jpeg' });
    const errors = validateHotelFormData({
      title: 'Valid Hotel',
      description: 'Valid Desc',
      latitude: '25.0',
      longitude: '55.0',
      price: '100',
    }, oversizedFile);

    expect(errors.image).toBe('Image file size exceeds the 5 MB limit (maximum 5 MB allowed).');
  });

  // 9. Valid image preview
  it('9. Valid image preview: creates object URL and updates preview upon valid file selection', () => {
    render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    const file = new File(['valid-image-bytes'], 'hotel-view.webp', { type: 'image/webp' });
    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(createObjectURLSpy).toHaveBeenCalledWith(file);
    const previewImg = screen.getByRole('img');
    expect(previewImg).toBeInTheDocument();
    expect(previewImg.getAttribute('src')).toContain('hotel-view.webp');
    expect(screen.getByText('New Image Ready')).toBeInTheDocument();
  });

  // 10. Preview URL cleanup when changing files
  it('10. Preview URL cleanup when changing files: revokes the previous object URL', () => {
    render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });

    const file1 = new File(['bytes1'], 'photo1.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file1] } });
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    const file2 = new File(['bytes2'], 'photo2.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file2] } });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(expect.stringContaining('photo1.jpg'));
    expect(createObjectURLSpy).toHaveBeenCalledTimes(2);
  });

  // 11. Preview URL cleanup on unmount
  it('11. Preview URL cleanup on unmount: revokes active object URL to prevent memory leaks', () => {
    const { unmount } = render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    const file = new File(['bytes'], 'unmount-test.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(createObjectURLSpy).toHaveBeenCalled();

    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(expect.stringContaining('unmount-test.png'));
  });

  // 12. Existing image shown in edit mode
  it('12. Existing image shown in edit mode: renders initial image without creating unnecessary object URL', () => {
    render(<HotelForm isEdit={true} initialData={validHotelData} onSubmit={vi.fn()} />);

    expect(screen.getByRole('form', { name: /edit hotel property form/i })).toBeInTheDocument();
    const previewImg = screen.getByRole('img');
    expect(previewImg).toBeInTheDocument();
    expect(previewImg.getAttribute('src')).toContain('sample-palace.jpg');
    expect(screen.getByText('Current Image')).toBeInTheDocument();
    // No blob URL should be created for existing backend image
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  // 13. Existing image preserved when no replacement is selected
  it('13. Existing image preserved when no replacement is selected: does not append empty image to FormData', async () => {
    const onSubmit = vi.fn();
    render(<HotelForm isEdit={true} initialData={validHotelData} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const submittedFormData = onSubmit.mock.calls[0][0];
    expect(submittedFormData instanceof FormData).toBe(true);
    expect(submittedFormData.get('title')).toBe('Namlatic Grand Palace');
    expect(submittedFormData.get('price')).toBe('299.99');
    // Crucial: image must NOT be present when user didn't pick a replacement
    expect(submittedFormData.get('image')).toBeNull();
  });

  // 14. Cancelling a selected replacement restores the existing image
  it('14. Cancelling a selected replacement restores the existing image and revokes the replacement blob', () => {
    render(<HotelForm isEdit={true} initialData={validHotelData} onSubmit={vi.fn()} />);

    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });
    const replacementFile = new File(['bytes'], 'replacement.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [replacementFile] } });

    expect(screen.getByText('New Image Ready')).toBeInTheDocument();
    const revertBtn = screen.getByRole('button', { name: /revert to original/i });
    expect(revertBtn).toBeInTheDocument();

    fireEvent.click(revertBtn);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(expect.stringContaining('replacement.jpg'));
    expect(screen.getByText('Current Image')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('src')).toContain('sample-palace.jpg');
  });

  // 15. Successful create request
  it('15. Successful create request: validates fields and calls onSubmit with complete FormData', async () => {
    const onSubmit = vi.fn();
    render(<HotelForm isEdit={false} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/hotel property title/i), {
      target: { value: 'Sunset Bay Suites' },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Breathtaking coastal views with private balconies and spa.' },
    });
    fireEvent.change(screen.getByLabelText(/latitude/i), {
      target: { value: '25.197197' },
    });
    fireEvent.change(screen.getByLabelText(/longitude/i), {
      target: { value: '55.274376' },
    });
    fireEvent.change(screen.getByLabelText(/^price/i), {
      target: { value: '185.50' },
    });

    const file = new File(['photo-bytes'], 'sunset.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = screen.getByRole('button', { name: /register hotel property/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const formData = onSubmit.mock.calls[0][0];
    expect(formData.get('title')).toBe('Sunset Bay Suites');
    expect(formData.get('description')).toBe('Breathtaking coastal views with private balconies and spa.');
    expect(formData.get('latitude')).toBe('25.197197');
    expect(formData.get('longitude')).toBe('55.274376');
    expect(formData.get('price')).toBe('185.50');
    expect(formData.get('image')).toBeInstanceOf(File);
  });

  // 16. Failed create request
  it('16. Failed create request: displays serverError banner properly', () => {
    render(
      <HotelForm
        isEdit={false}
        onSubmit={vi.fn()}
        serverError="A database check constraint failed: title already exists."
      />
    );

    expect(screen.getByTestId('form-server-error')).toBeInTheDocument();
    expect(screen.getByText(/title already exists/i)).toBeInTheDocument();
  });

  // 17. Successful edit request
  it('17. Successful edit request: updates values and passes modified FormData to onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<HotelForm isEdit={true} initialData={validHotelData} onSubmit={onSubmit} />);

    const priceInput = screen.getByLabelText(/^price/i);
    fireEvent.change(priceInput, { target: { value: '349.00' } });

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const formData = onSubmit.mock.calls[0][0];
    expect(formData.get('price')).toBe('349.00');
    expect(formData.get('title')).toBe('Namlatic Grand Palace');
  });

  // 18. Failed edit request
  it('18. Failed edit request: displays serverError when updating fails', () => {
    render(
      <HotelForm
        isEdit={true}
        initialData={validHotelData}
        onSubmit={vi.fn()}
        serverError="Property lock timeout: concurrent modification."
      />
    );

    expect(screen.getByTestId('form-server-error')).toBeInTheDocument();
    expect(screen.getByText(/concurrent modification/i)).toBeInTheDocument();
  });

  // 19. Loading and duplicate-submission behavior
  it('19. Loading and duplicate-submission behavior: disables inputs and submit button while loading', () => {
    const onSubmit = vi.fn();
    render(<HotelForm isEdit={false} isLoading={true} onSubmit={onSubmit} />);

    const submitBtn = screen.getByTestId('submit-button');
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/creating property\.\.\./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hotel property title/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();

    fireEvent.click(submitBtn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 20. Accessibility & focus
  it('20. Accessibility & focus: automatically focuses first invalid field on submission error', () => {
    render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    const titleInput = screen.getByLabelText(/hotel property title/i);
    const submitBtn = screen.getByRole('button', { name: /register hotel property/i });

    fireEvent.click(submitBtn);

    expect(document.activeElement).toBe(titleInput);
  });

  // 21. Invalid file selection clears file input and does not retain invalid preview
  it('21. Invalid file selection: clears file input DOM node and does not show invalid image preview', () => {
    render(<HotelForm isEdit={false} onSubmit={vi.fn()} />);

    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });
    const invalidFile = new File(['plain-text'], 'notes.txt', { type: 'text/plain' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByText('Invalid image format. Only JPEG, PNG, and WebP images are accepted.')).toBeInTheDocument();
    expect(screen.getByText(/no image uploaded/i)).toBeInTheDocument();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  // 22. React StrictMode resilience
  it('22. React StrictMode resilience: mounts and updates preview stably without premature revocation', () => {
    const { unmount } = render(
      <React.StrictMode>
        <HotelForm isEdit={false} onSubmit={vi.fn()} />
      </React.StrictMode>
    );

    // Initial mount in Strict Mode should not have called revokeObjectURL
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    const file = new File(['bytes'], 'strict-photo.webp', { type: 'image/webp' });
    const fileInput = screen.getByLabelText(/hotel property photo/i, { selector: 'input[type="file"]' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(createObjectURLSpy).toHaveBeenCalledWith(file);
    expect(screen.getByRole('img')).toBeInTheDocument();

    unmount();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(expect.stringContaining('strict-photo.webp'));
  });
});
