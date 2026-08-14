import { SAMPLE_ACCOUNT_ID, type Samples } from '../samples';
import betsFixture from './__fixtures__/bets.json';
import { normalizeBet } from './adapter';

export const samples: Samples = {
  settled: betsFixture.data.user.sportBetList.flatMap(
    (entry) => normalizeBet(entry.bet, SAMPLE_ACCOUNT_ID) ?? [],
  ),
  // Stake answers its open bets over GraphQL, which the page-side bridge cannot
  // recognise by URL, so there is no payload of them to record. They go through
  // the same normalizer as the settled bets above.
  open: [],
};
