import React from 'react';

/**
 * Accessible, responsive pagination controls.
 */
function Pagination({ total, limit, offset, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  if (total <= 0) return null;

  const startRecord = offset + 1;
  const endRecord = Math.min(offset + limit, total);

  const handlePrev = () => {
    if (currentPage > 1) {
      onPageChange((currentPage - 2) * limit);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage * limit);
    }
  };

  const handleSelectPage = (pageNumber) => {
    onPageChange((pageNumber - 1) * limit);
  };

  // Generate page numbers with ellipses
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);

      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    return pages;
  };

  return (
    <nav className="pagination-container" aria-label="Hotel pagination navigation">
      <div className="pagination-info">
        Showing <span className="font-medium">{startRecord}</span> to{' '}
        <span className="font-medium">{endRecord}</span> of{' '}
        <span className="font-medium">{total}</span> properties
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn pagination-nav"
          onClick={handlePrev}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <svg className="pagination-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          <span>Prev</span>
        </button>

        <div className="pagination-pages" role="group" aria-label="Page selection">
          {getPageNumbers().map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              className={`pagination-page-btn ${pageNum === currentPage ? 'active' : ''}`}
              onClick={() => handleSelectPage(pageNum)}
              aria-current={pageNum === currentPage ? 'page' : undefined}
              aria-label={`Go to page ${pageNum}`}
            >
              {pageNum}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="pagination-btn pagination-nav"
          onClick={handleNext}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <span>Next</span>
          <svg className="pagination-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
