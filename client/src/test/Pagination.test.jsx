import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../components/Pagination';

describe('Pagination Component', () => {
  it('renders nothing when total is 0', () => {
    const { container } = render(
      <Pagination total={0} limit={9} offset={0} onPageChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correct record range and disables Prev on first page', () => {
    render(
      <Pagination total={25} limit={10} offset={0} onPageChange={vi.fn()} />
    );

    expect(screen.getByText(/showing/i)).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBe(2); // One in "Showing 1 to 10", one in page button "1"
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /Previous page/i });
    expect(prevBtn).toBeDisabled();

    const nextBtn = screen.getByRole('button', { name: /Next page/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onPageChange with next offset when Next is clicked', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        total={30}
        limit={10}
        offset={0}
        onPageChange={handlePageChange}
      />
    );

    const nextBtn = screen.getByRole('button', { name: /Next page/i });
    fireEvent.click(nextBtn);

    expect(handlePageChange).toHaveBeenCalledWith(10);
  });

  it('calls onPageChange when a specific page button is clicked', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        total={30}
        limit={10}
        offset={0}
        onPageChange={handlePageChange}
      />
    );

    const page2Btn = screen.getByRole('button', { name: 'Go to page 2' });
    fireEvent.click(page2Btn);

    expect(handlePageChange).toHaveBeenCalledWith(10);
  });
});
