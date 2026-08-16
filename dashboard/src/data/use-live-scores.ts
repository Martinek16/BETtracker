import { useEffect, useState } from 'react';
import type { LiveScore } from '@betanal/shared';

/**
 * Live scores for in-play events, over the bookmaker's WAMP feed.
 *
 * The open-bets REST payload carries no score, so this is the only source. The
 * feed is anonymous - the handshake carries no session token - and the socket
 * is opened from the dashboard page rather than the service worker, which has
 * no lifetime of its own to speak of.
 *
 * Only what the feed actually gives us is exposed: the match score, and the
 * clock - which the book keeps on a topic of its own, one per match.
 */

const WS_URL = 'wss://sportsapiem.bah26.com/v2';
const REALM = 'www.bet-at-home.com';
/** Same operator as the `x-operator-id` header the REST calls send. */
const OPERATOR_ID = '2686';
const RECONNECT_MS = 5_000;
const MAX_RETRIES = 3;

const HELLO = 1;
const WELCOME = 2;
const CALL = 48;
const RESULT = 50;
const REGISTER = 64;
const REGISTERED = 65;
const INVOCATION = 68;
const YIELD = 70;

interface ScoreRecord {
  eventPartKey?: string;
  homeScore?: string;
  awayScore?: string;
}

/**
 * How far the match is, as the book counts it: the minute on one record and the
 * period it falls in on another, told apart by `typeId`. Its own topic, so a
 * match that carries no clock simply never answers.
 */
const MATCH_TIME_ID = '95';
const EVENT_PART_ID = '92';

interface InfoRecord {
  typeId?: string;
  paramFloat1?: number | string | null;
  paramEventPartName1?: string | null;
}

/**
 * `#debug=feed` swaps in the fat projection and parks every record on
 * `window.__betanalFeed`.
 *
 * Probing the broker shows `eventPartScores` is the only topic it serves per
 * event - no statistics or clock topic - so whether corners, cards or a tennis
 * set score are reachable at all can only be settled by reading what a real
 * in-play match actually pushes.
 */
const DEBUG = /[?&#]debug=feed/.test(window.location.href);

const topicFor = (eventId: string): string =>
  `/sports/${OPERATOR_ID}/en/${eventId}/eventPartScores/${DEBUG ? 'full' : 'small'}`;

const clockTopicFor = (eventId: string): string =>
  `/sports/${OPERATOR_ID}/en/${eventId}/eventInfo/default-event-info`;

export const useLiveScores = (
  enabled: boolean,
  eventIds: string[],
): Record<string, LiveScore[]> => {
  const [scores, setScores] = useState<Record<string, LiveScore[]>>({});
  const key = eventIds.join(',');

  useEffect(() => {
    if (!enabled || key === '') {
      setScores({});
      return;
    }

    const ids = key.split(',');
    const byEvent = new Map<string, Map<string, ScoreRecord>>();
    const clocks = new Map<string, { clock?: string; period?: string }>();
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let retries = 0;
    let stopped = false;

    const publish = (): void => {
      const next: Record<string, LiveScore[]> = {};
      for (const [eventId, records] of byEvent) {
        const all = [...records.values()];
        const match = all.find((r) => r.eventPartKey === 'WholeMatch') ?? all[0];
        if (match?.homeScore !== undefined && match.awayScore !== undefined) {
          next[eventId] = [
            { home: match.homeScore, away: match.awayScore, ...clocks.get(eventId) },
          ];
        }
      }
      setScores(next);
    };

    /**
     * The minute and the part being played, each on its own record. Both are
     * read: a sport with no running clock has only the second, and which of them
     * belongs on screen is the reader's question, not the feed's.
     */
    const readClock = (records: Record<string, unknown>[]): { clock?: string; period?: string } => {
      const infos = records
        .filter((r) => (r._type ?? r.entityType) === 'EVENT_INFO')
        .map((r) => (r.changedProperties ?? r) as InfoRecord);
      const minute = Number(
        infos.find((r) => r.typeId === MATCH_TIME_ID)?.paramFloat1 ?? Number.NaN,
      );
      const part = infos.find((r) => r.typeId === EVENT_PART_ID)?.paramEventPartName1;
      return {
        ...(Number.isFinite(minute) ? { clock: `${String(Math.floor(minute))}'` } : {}),
        ...(part == null || part === '' ? {} : { period: part }),
      };
    };

    /** Dumps carry whole records, updates only the changed keys - both merge by record id. */
    const apply = (eventId: string | undefined, records: unknown): void => {
      if (eventId === undefined || !Array.isArray(records)) return;
      if (DEBUG) {
        const dump = ((window as unknown as { __betanalFeed?: unknown[] }).__betanalFeed ??= []);
        dump.push({ eventId, records });
      }
      const known = byEvent.get(eventId) ?? new Map<string, ScoreRecord>();
      for (const entry of records as Record<string, unknown>[]) {
        const type = entry._type ?? entry.entityType;
        if (type !== 'EVENT_PART_SCORE' || typeof entry.id !== 'string') continue;
        const changed = (entry.changedProperties ?? entry) as ScoreRecord;
        known.set(entry.id, { ...known.get(entry.id), ...changed });
      }
      byEvent.set(eventId, known);
      // The minute and the part arrive as separate records and an update may
      // carry only one of them, so what is already known is kept beside it.
      const clock = readClock(records as Record<string, unknown>[]);
      if (clock.clock !== undefined || clock.period !== undefined) {
        clocks.set(eventId, { ...clocks.get(eventId), ...clock });
      }
      publish();
    };

    const connect = (): void => {
      const ws = new WebSocket(WS_URL, 'wamp.2.json');
      socket = ws;

      const topicForRequest = new Map<number, { eventId: string; topic: string }>();
      const eventForRegistration = new Map<number, string>();
      let requestId = 0;

      const send = (frame: unknown[]): void => ws.send(JSON.stringify(frame));

      ws.onopen = () => {
        retries = 0;
        // `callee` is required: the broker pushes updates as INVOCATION, not EVENT.
        send([HELLO, REALM, { roles: { subscriber: {}, caller: {}, callee: {} } }]);
      };

      ws.onmessage = (message: MessageEvent<string>) => {
        let frame: unknown;
        try {
          frame = JSON.parse(message.data);
        } catch {
          return;
        }
        if (!Array.isArray(frame)) return;

        switch (frame[0]) {
          case WELCOME:
            for (const eventId of ids) {
              // The score and the clock are two topics on the same match; a book
              // that serves only the first simply never answers on the second.
              for (const topic of [topicFor(eventId), clockTopicFor(eventId)]) {
                requestId += 1;
                topicForRequest.set(requestId, { eventId, topic });
                send([REGISTER, requestId, {}, topic]);
              }
            }
            break;

          case REGISTERED: {
            const asked = topicForRequest.get(frame[1] as number);
            if (asked === undefined) break;
            eventForRegistration.set(frame[2] as number, asked.eventId);
            requestId += 1;
            topicForRequest.set(requestId, asked);
            send([CALL, requestId, {}, '/sports#initialDump', [], { topic: asked.topic }]);
            break;
          }

          case RESULT:
            apply(
              topicForRequest.get(frame[1] as number)?.eventId,
              (frame[4] as { records?: unknown })?.records,
            );
            break;

          case INVOCATION:
            // The broker stops sending until the invocation is answered.
            send([YIELD, frame[1] as number, {}]);
            apply(
              eventForRegistration.get(frame[2] as number),
              (frame[5] as { records?: unknown })?.records,
            );
            break;
        }
      };

      ws.onclose = () => {
        if (stopped || retries >= MAX_RETRIES) return;
        retries += 1;
        retryTimer = window.setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [enabled, key]);

  return scores;
};
