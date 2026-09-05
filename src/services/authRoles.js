export const APP_ROLES = {
  editor: 'editor',
  viewer: 'viewer',
};

export const getSessionAppRole = (session) => session?.user?.app_metadata?.app_role || null;

export const hasSessionAppRole = (session, role) => getSessionAppRole(session) === role;

export const isEditorSession = (session) => hasSessionAppRole(session, APP_ROLES.editor);

export const isViewerSession = (session) => hasSessionAppRole(session, APP_ROLES.viewer);
