import { useEffect, useRef, useState } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

/**
 * Renders a Cloudflare Turnstile widget into the given ref and tracks its
 * verified token. Explicit render (rather than relying on auto-render) is
 * required because the container mounts after the Turnstile script has
 * already loaded, once the user navigates to the auth form.
 */
export function useTurnstile(active) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (t) => setToken(t),
        'expired-callback': () => setToken(null),
        'error-callback': () => setToken(null),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          render();
        }
      }, 200);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          /* noop */
        }
      }
    };
  }, [active]);

  function reset() {
    setToken(null);
    if (widgetIdRef.current != null && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch (e) {
        /* noop */
      }
    }
  }

  return { containerRef, token, reset };
}
