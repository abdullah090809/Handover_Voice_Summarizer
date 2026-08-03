import React, { useRef } from 'react';
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

// ---------------------------------------------------------------------------
// Six single-digit boxes instead of one field. A single field with
// maxLength={6} + inputMode="numeric" matches the pattern Chrome/Safari use
// to detect "this looks like a verification code" and overlay their own
// native suggestion chip on top of it — a browser-drawn element that
// ignores autocomplete="off" in many versions and can't be restyled with
// CSS. Splitting into maxLength={1} boxes means no single field matches
// that pattern, so the overlay has nothing to attach to.
export function OtpBoxInput({ id, length = 6, value, onChange, autoFocus }) {
  const refs = useRef([]);

  function setDigit(index, char) {
    const digits = value.split('');
    digits[index] = char;
    const next = digits.join('').slice(0, length);
    onChange(next);
  }

  function handleChange(e, index) {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    if (!char) {
      setDigit(index, '');
      return;
    }
    setDigit(index, char);
    if (index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(e, index) {
    if (e.key === 'Backspace') {
      if (value[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        setDigit(index - 1, '');
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, length - 1);
    refs.current[focusIndex]?.focus();
  }

  return (
    <div className="otp-box-row" id={id} onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          className="otp-box"
          value={value[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </div>
  );
}