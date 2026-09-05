export const VIEWER_PASSWORD = '534421';
export const VIEWER_SESSION_KEY = 'familyTreeViewerAccess';
export const VIEWER_EMAIL = import.meta.env.VITE_SUPABASE_VIEWER_EMAIL || 'viewer@xn----7sbfkf5bif1g.kz';

export const isViewerPasswordValid = (password) => password === VIEWER_PASSWORD;

export const hasViewerSessionAccess = (storage) => {
  try {
    return storage?.getItem(VIEWER_SESSION_KEY) === 'granted';
  } catch {
    return false;
  }
};

export const rememberViewerSessionAccess = (storage) => {
  try {
    storage?.setItem(VIEWER_SESSION_KEY, 'granted');
    return true;
  } catch {
    return false;
  }
};

export const clearViewerSessionAccess = (storage) => {
  try {
    storage?.removeItem(VIEWER_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
};

export const signInViewer = async (password, authClient) => {
  if (!isViewerPasswordValid(password)) return { session: null, error: new Error('Invalid viewer password') };

  const { data, error } = await authClient.auth.signInWithPassword({
    email: VIEWER_EMAIL,
    password,
  });
  return { session: data?.session || null, error };
};
