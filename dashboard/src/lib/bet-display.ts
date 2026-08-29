import { formatOdds, type Bet, type BetLeg, type OddsFormat } from '@betanal/shared';
import { formatDateTime } from '@/lib/utils';

export const formatLegEvent = (leg: BetLeg): string => leg.event ?? '—';

/** Words that say the shape of the bet rather than what it is on. */
const MARKET_NOISE =
  /^(?:total|totals|match|matchbet|bet|bets|player|players|team|teams|full|regular|time|the|a|of|to|in|on|at|and|&|or|over|under|over\/under|o\/u|1x2|moneyline|money|line|result|winner|[+-]?\d[\d.:,+-]*)$/i;

const WORD = /[^\p{L}\p{N}/]+/gu;

/**
 * What the line is counted in - goals, corners, cards, shots - taken from the
 * market name and stripped of everything the selection already says.
 */
const marketSubject = (marketType: string, selection: string): string => {
  const said = new Set(selection.toLowerCase().replace(WORD, ' ').split(' ').filter(Boolean));
  const words = marketType.trim().split(/\s+/);
  const informative = words.map((word) => {
    const bare = word.toLowerCase().replace(WORD, '');
    return bare !== '' && !MARKET_NOISE.test(bare) && !said.has(bare);
  });
  const first = informative.indexOf(true);
  if (first === -1) return '';
  return words.slice(first, informative.lastIndexOf(true) + 1).join(' ');
};

/** Which way a priced line was taken; the subject belongs in front of it. */
const DIRECTION = /\b(?:over|under)\b/i;

/**
 * What was backed, in the punter's own words. "Over 1.5" alone never says
 * whether it is goals, corners or cards, so a priced line gets its subject
 * spliced in - but only the part of the market name the selection is missing.
 */
export const pickLabel = (marketType: string | null, selection: string | null): string => {
  if (!selection) return marketType ?? '—';
  if (!marketType) return selection;
  const at = DIRECTION.exec(selection);
  if (at === null) return selection;
  const subject = marketSubject(marketType, selection);
  if (subject === '') return selection;
  const before = selection.slice(0, at.index);
  return `${before}${before.endsWith(' ') || before === '' ? '' : ' '}${subject} ${selection.slice(at.index)}`;
};

export const formatLegSelection = (leg: BetLeg, oddsFormat?: OddsFormat): string => {
  const name = pickLabel(leg.marketType, leg.selection);
  if (name === '—') return name;
  return leg.odds != null ? `${name} @${formatOdds(leg.odds, oddsFormat)}` : name;
};

export const formatLegLine = (leg: BetLeg): string => {
  const event = leg.event;
  const pick = leg.selection ?? leg.marketType;
  if (event && pick) return `${event} - ${pick}`;
  return event ?? pick ?? '—';
};

/** Short title for cards and highlights. */
export const betDisplayTitle = (bet: Bet): string => {
  if (bet.legs.length <= 1) return bet.event ?? bet.selection ?? bet.betId;
  return comboBetLabel(bet);
};

export const comboBetLabel = (bet: Bet): string => `Combo · ${bet.legs.length}`;

/**
 * How a slip reads to the punter, which is finer-grained than `betType`: the
 * bookmaker files a bet builder as a plain accumulator, and the only thing that
 * tells the two apart is that every leg of a builder sits on one fixture.
 */
export type SlipKind = 'single' | 'combo' | 'betBuilder' | 'system';

export const SLIP_KIND_LABEL: Record<SlipKind, string> = {
  single: 'Single',
  combo: 'Combo',
  betBuilder: 'Bet Builder',
  system: 'System',
};

/** The fixture every leg is on, or null when the legs span several events. */
export const sharedEventName = (bet: Bet): string | null => {
  if (bet.legs.length === 0) return null;
  const keys = bet.legs.map((leg) => leg.eventId ?? leg.event);
  if (keys.some((key) => key == null) || new Set(keys).size !== 1) return null;
  return bet.legs[0]?.event ?? null;
};

export const slipKind = (bet: Bet): SlipKind => {
  if (bet.betType === 'system') return 'system';
  if (bet.legs.length <= 1) return 'single';
  return sharedEventName(bet) !== null ? 'betBuilder' : 'combo';
};

/**
 * A short combo is named by its size, the way a punter says it out loud - a
 * double, a triple. Past four the word stops being common and the count is the
 * clearer thing, so those stay Combo and say how many beside the fixture.
 */
const COMBO_SIZE_LABEL: Record<number, string> = { 2: 'Double', 3: 'Triple', 4: 'Quadruple' };

/** What the slip is called in the Type column. */
export const slipLabel = (bet: Bet): string => {
  const kind = slipKind(bet);
  return (kind === 'combo' ? COMBO_SIZE_LABEL[bet.legs.length] : undefined) ?? SLIP_KIND_LABEL[kind];
};

/** Fixture of a single, falling back to the slip summary when legs are absent. */
export const singleEventLabel = (bet: Bet): string => bet.legs[0]?.event ?? bet.event ?? '—';

/** What was actually backed on a single, market included. */
export const singlePickLabel = (bet: Bet): string => {
  const leg = bet.legs[0];
  return pickLabel(leg?.marketType ?? bet.marketType, leg?.selection ?? bet.selection);
};

/**
 * Free-text haystack for one slip: everything the row shows plus the leg detail
 * hidden behind the expander, so a search finds a fixture that is only named
 * inside a combo.
 */
export const betSearchText = (bet: Bet): string =>
  [
    bet.placedAt,
    formatDateTime(bet.placedAt),
    SLIP_KIND_LABEL[slipKind(bet)],
    slipLabel(bet),
    bet.event,
    bet.sport,
    bet.league,
    bet.marketType,
    bet.selection,
    bet.status,
    bet.bookmaker,
    bet.currency,
    bet.odds,
    bet.stake,
    bet.actualReturn,
    ...bet.legs.flatMap((leg) => [
      leg.event,
      leg.sport,
      leg.league,
      leg.marketType,
      leg.selection,
      leg.status,
      leg.odds,
    ]),
  ]
    .filter((part) => part != null && part !== '')
    .join(' ')
    .toLowerCase();

/** One line per leg - full detail for tables and lists. */
export const betLegLines = (bet: Bet): string[] => {
  if (bet.legs.length > 0) return bet.legs.map(formatLegLine);
  const fallback = formatLegLine({
    sport: bet.sport,
    league: bet.league,
    event: bet.event,
    marketType: bet.marketType,
    selection: bet.selection,
    odds: bet.odds,
    status: bet.status,
    eventDate: null,
    isLive: false,
  });
  return [fallback];
};
