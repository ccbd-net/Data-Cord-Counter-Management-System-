import { useEffect } from 'react';
import { browserDb, type SyncPayload } from '../services/browserDb.ts';

/**
 * Custom React hook to listen for real-time cross-page and cross-tab data changes.
 * Automatically triggers the onSync callback when bookings, schedules, or vehicles change.
 */
export function useDataSync(
  onSync: (payload: SyncPayload) => void,
  filterTypes?: Array<SyncPayload['type']>
) {
  useEffect(() => {
    const unsubscribe = browserDb.onSync((payload) => {
      if (!filterTypes || filterTypes.length === 0 || filterTypes.includes(payload.type)) {
        onSync(payload);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onSync, filterTypes]);
}
