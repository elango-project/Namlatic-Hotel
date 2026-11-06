import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../components/EmptyState';
import ErrorAlert from '../components/ErrorAlert';
import HotelCardSkeleton from '../components/HotelCardSkeleton';

describe('States: EmptyState, ErrorAlert, Skeleton', () => {
  it('renders EmptyState for empty inventory', () => {
    render(<EmptyState isFiltered={false} />);
    expect(screen.getByText('No hotel properties yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Your inventory is currently empty/)
    ).toBeInTheDocument();
  });

  it('renders EmptyState for zero search results with reset button', () => {
    const handleReset = vi.fn();
    render(<EmptyState isFiltered={true} onReset={handleReset} />);
    expect(screen.getByText('No matching hotels found')).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: 'Reset All Filters' });
    fireEvent.click(resetBtn);
    expect(handleReset).toHaveBeenCalled();
  });

  it('renders ErrorAlert with retry action', () => {
    const handleRetry = vi.fn();
    render(
      <ErrorAlert message="Database offline: 503" onRetry={handleRetry} />
    );

    expect(screen.getByText('Database offline: 503')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Try Again' });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalled();
  });

  it('renders HotelCardSkeleton without crashing', () => {
    render(<HotelCardSkeleton />);
    expect(screen.getByTestId('hotel-card-skeleton')).toBeInTheDocument();
  });
});
