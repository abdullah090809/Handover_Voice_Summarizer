import { useEffect, useRef } from 'react';
import { shiftApi } from './api.js';
import { toDateInputValue } from './format.js';

/**
 * If a worker forgets to clock out, don't let the session run forever —
 * once the calendar day rolls over past the day it started, automatically
 * close it at the last moment of that day. This only fires while someone
 * has the app open (there's no backend cron job doing this), so it checks
 * immediately on mount and then once a minute for as long as the tab stays
 * open. Shared across any page that needs to reflect live shift status.
 */
export function useAutoClockOut(activeShift, onClockedOut, reload) {
    const inFlight = useRef(false);

    useEffect(() => {
        if (!activeShift) return undefined;

        function checkAutoClockOut() {
            if (inFlight.current) return;
            const startDay = toDateInputValue(new Date(activeShift.start_time));
            const today = toDateInputValue(new Date());
            if (startDay === today) return;

            const endOfStartDay = new Date(activeShift.start_time);
            endOfStartDay.setHours(23, 59, 59, 999);

            inFlight.current = true;
            shiftApi
                .update(activeShift.id, activeShift.start_time, endOfStartDay.toISOString())
                .then(() => {
                    if (onClockedOut) onClockedOut();
                    if (reload) reload();
                })
                .catch(() => { })
                .finally(() => {
                    inFlight.current = false;
                });
        }

        checkAutoClockOut();
        const id = setInterval(checkAutoClockOut, 60 * 1000);
        return () => clearInterval(id);
    }, [activeShift]);
}
