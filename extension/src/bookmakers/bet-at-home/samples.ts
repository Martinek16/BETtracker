import { SAMPLE_ACCOUNT_ID, sampleRef, type Samples } from '../samples';
import settledFixture from './__fixtures__/settled-bets.json';
import openFixture from './__fixtures__/open-bets.json';
import { betAtHome, parseSettled } from './adapter';

export const samples: Samples = {
  settled: parseSettled(settledFixture, SAMPLE_ACCOUNT_ID).bets,
  open: betAtHome.parseOpen(openFixture, sampleRef('bet-at-home')),
};
