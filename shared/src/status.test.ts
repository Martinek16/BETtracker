import { describe, expect, it } from 'vitest';
import type { SyncMeta } from './db';
import { connectionOf } from './status';

const NOW = Date.parse('2026-01-01T12:00:00Z');

const meta = (over: Partial<SyncMeta> = {}): SyncMeta => ({
  lastSyncAt: '2026-01-01T11:00:00Z',
  lastStatus: 'synced',
  lastError: null,
  ...over,
});

describe('connectionOf', () => {
  it('says nothing about an account that was never read', () => {
    expect(connectionOf(meta({ lastSyncAt: null }), NOW)).toEqual({
      tone: 'idle',
      label: 'Not connected',
    });
  });

  it('names the one thing that fixes a lost session', () => {
    const state = connectionOf(meta({ lastStatus: 'logged_out' }), NOW);
    expect(state.tone).toBe('stuck');
    expect(state.label).toContain('Sign in');
  });

  it('keeps a failure apart from a lost session', () => {
    expect(connectionOf(meta({ lastStatus: 'error' }), NOW).tone).toBe('failed');
  });

  it('counts the weeks once what is stored has gone stale', () => {
    const state = connectionOf(meta({ lastSyncAt: '2025-12-01T11:00:00Z' }), NOW);
    expect(state.tone).toBe('idle');
    expect(state.label).toBe('Out of date - last read 4 weeks ago');
  });

  it('is connected when a recent run succeeded', () => {
    expect(connectionOf(meta(), NOW)).toEqual({ tone: 'ok', label: 'Connected' });
  });
});
