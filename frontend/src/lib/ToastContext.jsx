import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = 'info', opts = {}) => {
      const id = ++idRef.current;
      const duration = opts.duration ?? 4500;
      const toast = { id, message, type, actions: opts.actions || [] };
      setToasts((prev) => [...prev, toast]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`} role="status">
              <span className="toast-icon"><Icon size={18} /></span>
              <div className="toast-content">
                <div className="toast-message">{t.message}</div>
                {t.actions.length > 0 && (
                  <div className="toast-actions">
                    {t.actions.map((a, i) => (
                      <button
                        key={i}
                        className={a.tone === 'primary' ? 'toast-primary' : a.tone === 'danger' ? 'toast-danger' : ''}
                        onClick={() => {
                          dismiss(t.id);
                          a.onClick && a.onClick();
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.showToast;
}
