import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const frontendUrl = import.meta.env.VITE_FRONTEND_URL || 'http://localhost:3000';
const redirectTo = `${frontendUrl}/auth/callback`;
const resetPasswordRedirectTo = `${frontendUrl}/reset-password`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
  },
});

export { redirectTo, resetPasswordRedirectTo };
