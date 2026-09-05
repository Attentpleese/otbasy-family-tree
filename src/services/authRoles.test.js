import { describe, expect, it } from 'vitest';
import { getSessionAppRole, isEditorSession, isViewerSession } from './authRoles';

describe('auth roles', () => {
  it('reads roles only from trusted app metadata', () => {
    expect(getSessionAppRole({
      user: {
        app_metadata: { app_role: 'editor' },
        user_metadata: { app_role: 'viewer' },
      },
    })).toBe('editor');
  });

  it('never treats a viewer session as an editor session', () => {
    const viewerSession = { user: { app_metadata: { app_role: 'viewer' } } };

    expect(isViewerSession(viewerSession)).toBe(true);
    expect(isEditorSession(viewerSession)).toBe(false);
  });

  it('fails closed for missing or unknown claims', () => {
    expect(isEditorSession(null)).toBe(false);
    expect(isViewerSession({ user: { app_metadata: {} } })).toBe(false);
    expect(isEditorSession({ user: { app_metadata: { app_role: 'owner' } } })).toBe(false);
  });
});
