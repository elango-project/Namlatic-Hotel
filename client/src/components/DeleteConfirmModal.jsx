import React, { useEffect, useRef } from 'react';

/**
 * Modal dialog for confirming permanent hotel deletion.
 * Traps focus and handles Escape key for accessibility.
 */
function DeleteConfirmModal({ isOpen, hotelTitle, isDeleting, onConfirm, onCancel }) {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      cancelBtnRef.current?.focus();
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onCancel();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card">
        <div className="modal-icon-wrapper">
          <svg className="modal-danger-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>

        <h3 id="modal-title" className="modal-title">
          Delete Hotel Property
        </h3>

        <p className="modal-body">
          Are you sure you want to delete <strong>{hotelTitle}</strong>? This action will permanently remove
          the property record from PostgreSQL and purge its uploaded photo from server storage. This cannot be undone.
        </p>

        <div className="modal-actions">
          <button
            type="button"
            ref={cancelBtnRef}
            className="btn btn-outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Property'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
