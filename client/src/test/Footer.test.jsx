import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/Footer';

describe('Footer Component', () => {
  const renderFooter = () => {
    return render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
  };

  it('renders semantic footer landmark with role="contentinfo"', () => {
    renderFooter();
    const footerElement = screen.getByRole('contentinfo');
    expect(footerElement).toBeInTheDocument();
    expect(footerElement).toHaveClass('app-footer');
  });

  it('renders Section A: Brand identity, logo icon, title, and description', () => {
    renderFooter();
    expect(screen.getByText('Namlatic Hotel Portal')).toBeInTheDocument();
    expect(screen.getByText('Hotel Inventory Management Dashboard.')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('renders Section B: Quick Navigation with existing application routes', () => {
    renderFooter();
    const dashboardLink = screen.getByRole('link', { name: /^dashboard$/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/');

    const inventoryLink = screen.getByRole('link', { name: /^hotel inventory$/i });
    expect(inventoryLink).toBeInTheDocument();
    expect(inventoryLink).toHaveAttribute('href', '/hotels');

    const addHotelLink = screen.getByRole('link', { name: /^add hotel$/i });
    expect(addHotelLink).toBeInTheDocument();
    expect(addHotelLink).toHaveAttribute('href', '/hotels/new');
  });

  it('renders Section C: Verified project documentation and support links with safe external attributes', () => {
    renderFooter();
    const apiDocLink = screen.getByRole('link', { name: /api documentation/i });
    expect(apiDocLink).toHaveAttribute('href', expect.stringContaining('API_DOCUMENTATION.md'));
    expect(apiDocLink).toHaveAttribute('target', '_blank');
    expect(apiDocLink).toHaveAttribute('rel', 'noopener noreferrer');

    const archLink = screen.getByRole('link', { name: /architecture documentation/i });
    expect(archLink).toHaveAttribute('href', expect.stringContaining('ARCHITECTURE.md'));
    expect(archLink).toHaveAttribute('target', '_blank');

    const dbLink = screen.getByRole('link', { name: /database guide/i });
    expect(dbLink).toHaveAttribute('href', expect.stringContaining('DATABASE_GUIDE.md'));
    expect(dbLink).toHaveAttribute('target', '_blank');

    const supportLink = screen.getByRole('link', { name: /help & support/i });
    expect(supportLink).toHaveAttribute('href', expect.stringContaining('issues'));
    expect(supportLink).toHaveAttribute('target', '_blank');
  });

  it('renders Section D: Copyright notice', () => {
    renderFooter();
    expect(screen.getByText(/© 2026 Namlatic Hotel Portal\. All rights reserved\./i)).toBeInTheDocument();
  });
});
