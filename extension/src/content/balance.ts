/**
 * Account-balance scraper (ISOLATED world, runs in every frame).
 *
 * The EveryMatrix bets-api exposes no wallet/balance endpoint, so the only place
 * the current balance exists is the rendered page. bet-at-home prints every money
 * value with `<span class="FormattedAmount">…</span>`, which is far too generic to
 * target directly. We instead score each candidate by its surrounding markup and
 * screen position and pick the one that most looks like the header wallet figure.
 *
 * This is inherently fragile to site redesigns; everything site-specific lives in
 * the constants below so it can be retuned without touching the wiring.
 */

import type { ScrapedBalance } from '../messaging';

const AMOUNT_SELECTOR = '.FormattedAmount';

// Money-looking leaf text: at most a symbol either side of a grouped figure with
// two decimals. Deliberately strict — this stands in for a class name, so a false
// match here becomes a wrong balance.
const MONEY_TEXT = /^\D{0,3}\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\D{0,4}$/;

export const looksLikeMoney = (text: string): boolean => MONEY_TEXT.test(text.trim());

// Markup hints scored when walking up from a candidate amount.
const STRONG_HINT = /balance|wallet|saldo|funds|cashier|guthaben|stanje/i;
const WEAK_HINT = /account|user|profile|header|navbar|nav-|topbar|deposit/i;
const NEGATIVE_HINT = /betslip|bet-slip|slip|stake|coupon|ticket|odds|market|payout|winnings|quota|input/i;

const CURRENCY_TOKENS: ReadonlyArray<readonly [RegExp, string]> = [
  [/€|\beur\b/i, 'EUR'],
  [/\$|\busd\b/i, 'USD'],
  [/£|\bgbp\b/i, 'GBP'],
  [/\bchf\b/i, 'CHF'],
  [/\brsd\b|\bdin\b/i, 'RSD'],
];

/** Parse a localized money string ("1.234,56", "1,234.56", "0.00") to a number. */
export const parseAmount = (text: string): number | null => {
  const cleaned = text.replace(/[^\d.,-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }

  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
};

const detectCurrency = (el: Element): string | null => {
  let node: Element | null = el;
  for (let depth = 0; depth < 3 && node !== null; depth += 1) {
    const text = node.textContent ?? '';
    for (const [re, code] of CURRENCY_TOKENS) {
      if (re.test(text)) return code;
    }
    node = node.parentElement;
  }
  return null;
};

const isVisible = (el: Element): boolean => {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const contextScore = (el: Element): number => {
  let score = 0;
  let node: Element | null = el;
  for (let depth = 0; depth < 6 && node !== null; depth += 1) {
    const hay = `${node.className} ${node.id} ${node.getAttribute('data-testid') ?? ''} ${node.getAttribute('aria-label') ?? ''}`;
    if (STRONG_HINT.test(hay)) score += 3;
    if (WEAK_HINT.test(hay)) score += 1;
    if (NEGATIVE_HINT.test(hay)) score -= 2;
    node = node.parentElement;
  }
  // Wallet figures live in the top toolbar; reward proximity to the top edge.
  const top = el.getBoundingClientRect().top;
  if (top >= 0 && top < 120) score += 2;
  else if (top >= 0 && top < 260) score += 1;
  return score;
};

/**
 * Header fallback: bet-at-home obfuscates class names, so the wallet figure may
 * carry no keyword signal. The balance sits in the top toolbar, so when nothing
 * scores positively we take the topmost (then right-most) visible amount near the
 * top edge — the usual position for the account balance.
 */
const headerFallback = (candidates: readonly Element[]): Element | null => {
  let best: Element | null = null;
  let bestTop = Infinity;
  let bestLeft = -Infinity;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.top > 130) continue;
    if (rect.top < bestTop - 8 || (Math.abs(rect.top - bestTop) <= 8 && rect.left > bestLeft)) {
      best = el;
      bestTop = rect.top;
      bestLeft = rect.left;
    }
  }
  return best;
};

/**
 * The site's own class is the only thing tying us to its markup, and it is
 * generated — a redesign renames it and the balance silently disappears for good.
 * When it matches nothing, any short money-looking leaf is a candidate instead and
 * the scoring below picks between them exactly as before.
 */
const looseCandidates = (): Element[] =>
  Array.from(document.querySelectorAll('span, b, strong, div')).filter(
    (el) => el.childElementCount === 0 && looksLikeMoney(el.textContent ?? ''),
  );

/** Returns the best-guess balance in this frame, or null if none looks right. */
export const scrapeBalance = (): ScrapedBalance | null => {
  const tagged = Array.from(document.querySelectorAll(AMOUNT_SELECTOR)).filter(isVisible);
  const candidates = tagged.length > 0 ? tagged : looseCandidates().filter(isVisible);
  if (candidates.length === 0) return null;

  let best: Element | null = null;
  let bestScore = -Infinity;
  let bestTop = Infinity;
  for (const el of candidates) {
    const score = contextScore(el);
    const top = el.getBoundingClientRect().top;
    if (score > bestScore || (score === bestScore && top < bestTop)) {
      best = el;
      bestScore = score;
      bestTop = top;
    }
  }

  // No keyword signal — fall back to the header-region amount by position.
  if (best === null || bestScore <= 0) best = headerFallback(candidates);
  if (best === null) return null;

  const amount = parseAmount(best.textContent ?? '');
  if (amount === null) return null;

  return { amount, currency: detectCurrency(best) };
};
