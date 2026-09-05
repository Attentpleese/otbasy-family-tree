import { describe, expect, it, vi } from 'vitest';
import {
  VIEWER_SESSION_KEY,
  clearViewerSessionAccess,
  hasViewerSessionAccess,
  isViewerPasswordValid,
  rememberViewerSessionAccess,
  signInViewer,
} from './viewerAccess';

describe('viewer access gate', () => {
  it('accepts only the configured shared password', () => {
    expect(isViewerPasswordValid('534421')).toBe(true);
    expect(isViewerPasswordValid('534420')).toBe(false);
    expect(isViewerPasswordValid(' 534421 ')).toBe(false);
  });

  it('remembers access only in the supplied session storage', () => {
    const values = new Map();
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
    };

    expect(hasViewerSessionAccess(storage)).toBe(false);
    expect(rememberViewerSessionAccess(storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(VIEWER_SESSION_KEY, 'granted');
    expect(hasViewerSessionAccess(storage)).toBe(true);
  });

  it('fails closed when session storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };

    expect(hasViewerSessionAccess(storage)).toBe(false);
    expect(rememberViewerSessionAccess(storage)).toBe(false);
  });

  it('signs the shared viewer account in with the supplied password', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { session: { user: { app_metadata: { app_role: 'viewer' } } } },
      error: null,
    });

    const result = await signInViewer('534421', { auth: { signInWithPassword } });

    expect(result.error).toBeNull();
    expect(signInWithPassword).toHaveBeenCalledWith(expect.objectContaining({
      password: '534421',
    }));
  });

  it('rejects an incorrect password without contacting Supabase', async () => {
    const signInWithPassword = vi.fn();

    const result = await signInViewer('wrong', { auth: { signInWithPassword } });

    expect(result.error).toBeInstanceOf(Error);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('can clear the session marker', () => {
    const removeItem = vi.fn();

    expect(clearViewerSessionAccess({ removeItem })).toBe(true);
    expect(removeItem).toHaveBeenCalledWith(VIEWER_SESSION_KEY);
  });
});
