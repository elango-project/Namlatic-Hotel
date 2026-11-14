import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HotelCard, { formatPrice, formatCoordinates } from '../components/HotelCard';

describe('HotelCard Component', () => {
  const mockHotel = {
    id: '12',
    title: 'Seaside Paradise Resort',
    description: 'A beachfront oasis with luxury suites and infinity pool.',
    latitude: '24.453884',
    longitude: '54.377344',
    price: '249.99',
    image_path: '/uploads/hotels/sample.jpg',
  };

  describe('Utility: formatPrice', () => {
    it('formats prices using currency-neutral format by default, or configured currency when specified', () => {
      // Default currency-neutral format
      expect(formatPrice('249.99')).toBe('249.99');
      expect(formatPrice(150)).toBe('150.00');
      expect(formatPrice('72.74')).toBe('72.74');
      expect(formatPrice(0)).toBe('0.00');
      expect(formatPrice('0.00')).toBe('0.00');
      expect(formatPrice('invalid')).toBe('0.00');
      expect(formatPrice(null)).toBe('0.00');
      expect(formatPrice(undefined)).toBe('0.00');

      // Large numeric values
      expect(formatPrice('1500000.00')).toBe('1,500,000.00');

      // Explicit currency code formatting
      expect(formatPrice('249.99', 'USD')).toBe('$249.99');
      expect(formatPrice('249.99', 'EUR')).toBe('€249.99');
    });
  });

  describe('Utility: formatCoordinates', () => {
    it('formats valid numeric coordinates to exactly 4 decimal places', () => {
      expect(formatCoordinates('24.453884', '54.377344')).toBe('24.4539°, 54.3773°');
      expect(formatCoordinates(25.12, 55.23)).toBe('25.1200°, 55.2300°');
    });

    it('returns null for missing, null, undefined, or empty coordinates', () => {
      expect(formatCoordinates(null, '54.377344')).toBeNull();
      expect(formatCoordinates('24.453884', undefined)).toBeNull();
      expect(formatCoordinates('', '')).toBeNull();
      expect(formatCoordinates(null, null)).toBeNull();
    });

    it('returns null for invalid non-numeric coordinate strings without throwing errors', () => {
      expect(formatCoordinates('invalid', '54.377344')).toBeNull();
      expect(formatCoordinates('24.453884', 'abc')).toBeNull();
      expect(formatCoordinates(NaN, 54.377344)).toBeNull();
    });
  });

  describe('Visual Layout & Information Hierarchy', () => {
    it('renders hotel details accurately with new information hierarchy (Image -> Title -> Price -> Desc -> Coordinates -> Actions)', () => {
      render(
        <BrowserRouter>
          <HotelCard hotel={mockHotel} />
        </BrowserRouter>
      );

      // Title
      expect(screen.getByText('Seaside Paradise Resort')).toBeInTheDocument();

      // Price (placed in card body with label and prominent value)
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('249.99')).toBeInTheDocument();

      // Description preview
      expect(
        screen.getByText(/A beachfront oasis with luxury suites/)
      ).toBeInTheDocument();

      // Coordinates
      expect(screen.getByText(/24.4539°, 54.3773°/)).toBeInTheDocument();
      expect(screen.getByText('GPS:')).toBeInTheDocument();
    });

    it('renders a verified fallback placeholder when image_path is null or empty', () => {
      const hotelNoImage = { ...mockHotel, image_path: null };
      render(
        <BrowserRouter>
          <HotelCard hotel={hotelNoImage} />
        </BrowserRouter>
      );

      expect(screen.getByText('No Image Available')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('switches to fallback placeholder when image triggers onError event', () => {
      render(
        <BrowserRouter>
          <HotelCard hotel={mockHotel} />
        </BrowserRouter>
      );

      const img = screen.getByRole('img', { name: /Exterior view of Seaside Paradise Resort/i });
      expect(img).toBeInTheDocument();

      // Simulate broken image load
      fireEvent.error(img);

      // Fallback placeholder is displayed, broken img is removed
      expect(screen.getByText('No Image Available')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('handles long hotel titles gracefully with full title attribute for accessibility', () => {
      const longTitleHotel = {
        ...mockHotel,
        title: 'The Grand Royal Continental Luxury Palace Beach Resort & International Spa Suites Abu Dhabi',
      };
      render(
        <BrowserRouter>
          <HotelCard hotel={longTitleHotel} />
        </BrowserRouter>
      );

      const titleEl = screen.getByText(longTitleHotel.title);
      expect(titleEl).toBeInTheDocument();
      expect(titleEl).toHaveAttribute('title', longTitleHotel.title);
    });

    it('handles empty description with subtle italic fallback text without breaking layout', () => {
      const noDescHotel = { ...mockHotel, description: '' };
      render(
        <BrowserRouter>
          <HotelCard hotel={noDescHotel} />
        </BrowserRouter>
      );

      expect(screen.getByText('No description provided.')).toBeInTheDocument();
    });

    it('handles missing or invalid coordinates safely without NaN errors', () => {
      const noCoordsHotel = { ...mockHotel, latitude: null, longitude: null };
      render(
        <BrowserRouter>
          <HotelCard hotel={noCoordsHotel} />
        </BrowserRouter>
      );

      expect(screen.getByText('Coordinates unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    });

    it('handles invalid non-numeric coordinates safely', () => {
      const invalidCoordsHotel = { ...mockHotel, latitude: 'invalid', longitude: 'abc' };
      render(
        <BrowserRouter>
          <HotelCard hotel={invalidCoordsHotel} />
        </BrowserRouter>
      );

      expect(screen.getByText('Coordinates unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    });

    it('handles special characters in title and description safely', () => {
      const specialHotel = {
        ...mockHotel,
        title: 'Hotel & Resort <VIP> "Luxury" \'Oasis\'',
        description: 'Featuring 5* amenities & gourmet dining: 100% satisfaction guaranteed.',
      };
      render(
        <BrowserRouter>
          <HotelCard hotel={specialHotel} />
        </BrowserRouter>
      );

      expect(screen.getByText('Hotel & Resort <VIP> "Luxury" \'Oasis\'')).toBeInTheDocument();
      expect(
        screen.getByText('Featuring 5* amenities & gourmet dining: 100% satisfaction guaranteed.')
      ).toBeInTheDocument();
    });
  });

  describe('Action Button Hierarchy & Event Handling', () => {
    it('renders action links with correct hierarchy and triggers onDeleteClick when delete is clicked', () => {
      const handleDelete = vi.fn();
      render(
        <BrowserRouter>
          <HotelCard hotel={mockHotel} onDeleteClick={handleDelete} />
        </BrowserRouter>
      );

      // Primary: Details
      const detailsLink = screen.getByRole('link', { name: /View details for Seaside Paradise Resort/i });
      expect(detailsLink).toHaveAttribute('href', '/hotels/12');
      expect(detailsLink).toHaveClass('btn-primary');

      // Secondary: Edit
      const editLink = screen.getByRole('link', { name: /Edit Seaside Paradise Resort/i });
      expect(editLink).toHaveAttribute('href', '/hotels/12/edit');
      expect(editLink).toHaveClass('btn-outline');

      // Destructive: Delete
      const deleteBtn = screen.getByRole('button', { name: /Delete Seaside Paradise Resort/i });
      expect(deleteBtn).toHaveClass('btn-danger-outline');

      fireEvent.click(deleteBtn);
      expect(handleDelete).toHaveBeenCalledTimes(1);
      expect(handleDelete).toHaveBeenCalledWith(mockHotel);
    });

    it('stops event propagation when Delete button is clicked', () => {
      const parentClickHandler = vi.fn();
      const handleDelete = vi.fn();
      render(
        <BrowserRouter>
          <div onClick={parentClickHandler}>
            <HotelCard hotel={mockHotel} onDeleteClick={handleDelete} />
          </div>
        </BrowserRouter>
      );

      const deleteBtn = screen.getByRole('button', { name: /Delete Seaside Paradise Resort/i });
      fireEvent.click(deleteBtn);

      expect(handleDelete).toHaveBeenCalledTimes(1);
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });
});
