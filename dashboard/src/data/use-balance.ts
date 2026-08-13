import { useEffect, useState } from 'react';
import { loadBalances, loadBonuses, type BalanceInfo } from '@/data/source';

/**
 * Live balance per connected account, scraped by the content script and stored
 * in IndexedDB. Reads the persisted values on mount and replaces the entry of
 * whichever account the background reports next. Empty outside the extension.
 */
export const useBalances = (): BalanceInfo[] => {
  const [balances, setBalances] = useState<BalanceInfo[]>([]);

  useEffect(() => {
    let active = true;
    void loadBalances().then((all) => {
      if (active) setBalances(all);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    const onMessage = (message: { type?: string; balance?: BalanceInfo }): void => {
      const fresh = message.balance;
      if (message.type !== 'BALANCE' || fresh === undefined) return;
      setBalances((prev) => [...prev.filter((b) => b.bookmaker !== fresh.bookmaker), fresh]);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  return balances;
};

/**
 * Money sitting in the bonus wallet right now — only `active` grants still hold
 * one; every other status has already been paid out, expired or forfeited.
 */
export const useBonusBalance = (): number => {
  const [bonus, setBonus] = useState(0);

  useEffect(() => {
    let active = true;
    void loadBonuses().then((bonuses) => {
      if (!active) return;
      setBonus(
        bonuses.reduce((sum, b) => (b.status === 'active' ? sum + b.currentAmount : sum), 0),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return bonus;
};
