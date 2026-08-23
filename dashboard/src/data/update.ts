import { useEffect, useState } from 'react';

export interface UpdateNotice {
  version: string;
  url: string;
}

/**
 * The release the background worker found, when this copy is a minor version
 * behind it. There is never one to read in a copy installed from the store: it
 * is already being kept current, and the worker does not go looking.
 *
 * Read once, on mount. The worker writes this when the browser opens, which is
 * always before a dashboard tab exists to read it.
 */
export const useUpdateNotice = (): UpdateNotice | null => {
  const [notice, setNotice] = useState<UpdateNotice | null>(null);

  useEffect(() => {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) return;
    void chrome.storage.local
      .get('updateNotice')
      .then((stored) => setNotice((stored['updateNotice'] as UpdateNotice | undefined) ?? null));
  }, []);

  return notice;
};
