'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-fetches the current server-rendered page every `seconds` while the tab is
 * visible, so an open dashboard reflects new orders and payments without a
 * manual reload. Nothing is computed client-side -- `router.refresh()` simply
 * asks the server for the page again, and the server recomputes from the
 * database as it does for any request.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), seconds * 1000);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh(); // catch up immediately on return
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, seconds]);

  return null;
}
