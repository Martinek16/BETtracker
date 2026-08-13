import { useCallback, useEffect, useState } from 'react';
import { getSettings, requestRateSync, setSettings, type AppSettings } from '@/data/source';

interface UseSettings {
  settings: AppSettings | null;
  /** Resolves once written, so a caller can reload views that read settings. */
  patch: (changes: Partial<AppSettings>) => Promise<void>;
}

/**
 * One copy of the settings for the whole app. Several places read them at once —
 * the header, the account pages, every section of the settings page — and a
 * change made in any of them has to show up in all the others straight away.
 */
let cached: AppSettings | null = null;
const listeners = new Set<(settings: AppSettings) => void>();

const publish = (next: AppSettings): void => {
  cached = next;
  for (const notify of listeners) notify(next);
};

/** Called after every change, with the settings as they now stand. */
export const subscribeToSettings = (listener: (settings: AppSettings) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSettings = (): UseSettings => {
  const [settings, setLocal] = useState<AppSettings | null>(cached);

  useEffect(() => {
    const unsubscribe = subscribeToSettings(setLocal);
    if (cached === null) {
      // A change may land while this read is in flight; that copy is the newer one.
      void getSettings().then((stored) => {
        if (cached === null) publish(stored);
      });
    } else {
      setLocal(cached);
    }
    return unsubscribe;
  }, []);

  const patch = useCallback(async (changes: Partial<AppSettings>): Promise<void> => {
    const next = { ...(cached ?? (await getSettings())), ...changes };
    publish(next);
    await setSettings(next);
    // The stored records were only ever priced against the old currency.
    if (changes.currency !== undefined) requestRateSync();
  }, []);

  return { settings, patch };
};
