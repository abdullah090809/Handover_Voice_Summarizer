import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, subtitle, size = 'md', children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    // basic focus management
    const prevActive = document.activeElement;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : '';

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal-panel ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-header">
          <div>
            <h3 id="modal-title">{title}</h3>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
