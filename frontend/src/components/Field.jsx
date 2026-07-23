import React from 'react';
import { AlertCircle } from 'lucide-react';

export function Field({ label, htmlFor, hint, error, optional, children }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label} {optional && <span className="optional">(optional)</span>}
        </label>
      )}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error">
          <AlertCircle size={13} /> {error}
        </span>
      )}
    </div>
  );
}

export function IconInput({ icon: Icon, suffix, ...props }) {
  return (
    <div className="input-icon-wrap">
      {Icon && <Icon className="field-icon" />}
      <input className={`input ${suffix ? 'has-suffix' : ''} ${props.className || ''}`} {...props} />
      {suffix}
    </div>
  );
}