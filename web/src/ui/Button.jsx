import React from 'react';
import { Spinner } from './Spinner.jsx';
import './ui.css';

// variant: primary | ghost | subtle | icon ; size: sm | md
export function Button({
  variant = 'subtle', size = 'md', loading = false, disabled = false,
  children, className = '', 'aria-label': ariaLabel, ...rest
}) {
  return (
    <button
      className={`ui-btn ui-btn--${variant} ui-btn--${size} ${className}`}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : children}
    </button>
  );
}
