import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Sem as duas variáveis públicas, App.jsx mostra a tela de orientação em vez de falhar.
export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

// Sessão persistente permite continuar conectado e processar links de recuperação de senha.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
