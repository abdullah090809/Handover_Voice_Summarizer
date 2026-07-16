import React from 'react';
import { Inbox, AlertCircle } from 'lucide-react';
import { initials } from '../lib/format.js';

export function Avatar({ text, size = 'md', src }) {
  if (src) {
    return (
      <div className={`avatar avatar-${size} avatar-photo`}>
        <img src={src} alt="" />
      </div>
    );
  }
  return <div className={`avatar avatar-${size}`}>{initials(text)}</div>;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon />
      </div>
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  return (
    <div className="error-state">
      <AlertCircle />
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" style={{ width: '90%' }} />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  );
}