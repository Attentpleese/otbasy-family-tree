import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const viewerSessionStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export const viewerSupabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      persistSession: Boolean(viewerSessionStorage),
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: viewerSessionStorage,
      storageKey: 'family-tree-viewer-auth',
    },
  },
);
