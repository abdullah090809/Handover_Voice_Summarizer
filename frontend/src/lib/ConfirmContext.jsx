import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, danger, resolve }

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || 'Are you sure?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: opts.danger !== false,
        resolve,
      });
    });
  }, []);

  const close = (result) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="modal-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="modal-body" style={{ paddingBottom: 0 }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-md)',
                    background: state.danger ? 'var(--urgency-high-bg)' : 'var(--info-bg)',
                    color: state.danger ? 'var(--urgency-high)' : 'var(--info)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={19} />
                </div>
                <div>
                  <h3 id="confirm-title" style={{ fontSize: 'var(--text-md)', marginBottom: 6 }}>
                    {state.title}
                  </h3>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {state.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => close(false)}>
                {state.cancelLabel}
              </button>
              <button className={state.danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={() => close(true)} autoFocus>
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
