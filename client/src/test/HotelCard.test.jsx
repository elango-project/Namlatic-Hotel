import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HotelCard, { formatPrice } from '../components/HotelCard';

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

  it('formats prices correctly using USD currency format', () => {
    expect(formatPrice('249.99')).toBe('$249.99');
    expect(formatPrice(150)).toBe('$150.00');
    expect(formatPrice('invalid')).toBe('$0.00');
  });

  it('renders hotel details accurately', () => {
    render(
      <BrowserRouter>
        <HotelCard hotel={mockHotel} />
      </BrowserRouter>
    );

    expect(screen.getByText('Seaside Paradise Resort')).toBeInTheDocument();
    expect(screen.getByText('$249.99')).toBeInTheDocument();
    expect(screen.getByText('/ night')).toBeInTheDocument();
    expect(
      screen.getByText(/A beachfront oasis with luxury suites/)
    ).toBeInTheDocument();
    expect(screen.getByText(/24.4539°, 54.3773°/)).toBeInTheDocument();
  });

  it('renders a verified fallback placeholder when image_path is null', () => {
    const hotelNoImage = { ...mockHotel, image_path: null };
    render(
      <BrowserRouter>
        <HotelCard hotel={hotelNoImage} />
      </BrowserRouter>
    );

    expect(screen.getByText('No Image Available')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders action links and triggers onDeleteClick when delete is clicked', () => {
    const handleDelete = vi.fn();
    render(
      <BrowserRouter>
        <HotelCard hotel={mockHotel} onDeleteClick={handleDelete} />
      </BrowserRouter>
    );

    const detailsLink = screen.getByRole('link', { name: /View details/i });
    expect(detailsLink).toHaveAttribute('href', '/hotels/12');

    const editLink = screen.getByRole('link', { name: /Edit/i });
    expect(editLink).toHaveAttribute('href', '/hotels/12/edit');

    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);
    expect(handleDelete).toHaveBeenCalledWith(mockHotel);
  });
});
