import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterToolbar from '../components/FilterToolbar';

describe('FilterToolbar Component', () => {
  it('renders search input and price inputs', () => {
    render(
      <FilterToolbar
        initialTitle=""
        initialMinPrice=""
        initialMaxPrice=""
        onSearchChange={vi.fn()}
        onPriceFilterChange={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(
      screen.getByPlaceholderText(/Search hotels by title.../i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Min Price')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max Price')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('validates price range and prevents minPrice > maxPrice', () => {
    const handlePriceChange = vi.fn();
    render(
      <FilterToolbar
        initialTitle=""
        initialMinPrice=""
        initialMaxPrice=""
        onSearchChange={vi.fn()}
        onPriceFilterChange={handlePriceChange}
        onReset={vi.fn()}
      />
    );

    const minInput = screen.getByPlaceholderText('Min Price');
    const maxInput = screen.getByPlaceholderText('Max Price');
    const filterBtn = screen.getByRole('button', { name: 'Filter' });

    fireEvent.change(minInput, { target: { value: '500' } });
    fireEvent.change(maxInput, { target: { value: '100' } });
    fireEvent.click(filterBtn);

    expect(
      screen.getByText('Min price cannot be greater than max price.')
    ).toBeInTheDocument();
    expect(handlePriceChange).not.toHaveBeenCalled();
  });

  it('submits valid price filters when submitted', () => {
    const handlePriceChange = vi.fn();
    render(
      <FilterToolbar
        initialTitle=""
        initialMinPrice=""
        initialMaxPrice=""
        onSearchChange={vi.fn()}
        onPriceFilterChange={handlePriceChange}
        onReset={vi.fn()}
      />
    );

    const minInput = screen.getByPlaceholderText('Min Price');
    const maxInput = screen.getByPlaceholderText('Max Price');
    const filterBtn = screen.getByRole('button', { name: 'Filter' });

    fireEvent.change(minInput, { target: { value: '150' } });
    fireEvent.change(maxInput, { target: { value: '300' } });
    fireEvent.click(filterBtn);

    expect(handlePriceChange).toHaveBeenCalledWith({
      minPrice: '150',
      maxPrice: '300',
    });
  });

  it('calls onReset when Reset Filters button is clicked', () => {
    const handleReset = vi.fn();
    render(
      <FilterToolbar
        initialTitle="Seaside"
        initialMinPrice="100"
        initialMaxPrice="200"
        onSearchChange={vi.fn()}
        onPriceFilterChange={vi.fn()}
        onReset={handleReset}
      />
    );

    const resetBtn = screen.getByRole('button', { name: /Reset all search/i });
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalled();
  });
});
