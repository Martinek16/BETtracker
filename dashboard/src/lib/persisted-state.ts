import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/* Session, not local: a refresh has to keep whatever the user picked, but a
   newly opened dashboard starts from the defaults its settings describe. */
const full = (key: string): string => `betanal:${key}`;

const read = <T,>(key: string, allowed?: readonly T[]): T | undefined => {
  try {
    const raw = sessionStorage.getItem(full(key));
    if (raw === null) return undefined;
    const value = JSON.parse(raw) as T;
    // A stored value outlives the code that wrote it: a tab name or sort key can
    // be gone by the next release, and restoring it would render nothing.
    if (allowed !== undefined && !allowed.includes(value)) return undefined;
    return value;
  } catch {
    return undefined;
  }
};

export const hasStored = (key: string): boolean => {
  try {
    return sessionStorage.getItem(full(key)) !== null;
  } catch {
    return false;
  }
};

export const usePersistedState = <T,>(
  key: string,
  initial: T,
  allowed?: readonly T[],
): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState<T>(() => read(key, allowed) ?? initial);

  useEffect(() => {
    try {
      sessionStorage.setItem(full(key), JSON.stringify(value));
    } catch {
      /* storage can be denied; the filter then simply does not survive a reload */
    }
  }, [key, value]);

  // Navigating away is a fresh start, reloading is not: a reload tears the page
  // down without running cleanups, so only leaving the view drops the value.
  useEffect(
    () => () => {
      try {
        sessionStorage.removeItem(full(key));
      } catch {
        /* nothing stored means nothing to forget */
      }
    },
    [key],
  );

  return [value, setValue];
};
