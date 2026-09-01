import { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const user = session?.user ?? null;
  const appMetadata = user?.app_metadata ?? {};
  // Conta sem app_metadata.role definido é anterior à tela de
  // Administração (implantada em 01/09/2026) — tratada como admin com
  // acesso total, pra nunca trancar quem já usava o painel sem querer no
  // dia em que isso entrou no ar. Só passa a valer a regra "real" (role
  // explícito + módulos concedidos) depois que um admin salva a conta
  // pela tela, mesmo que só pra reafirmar "admin".
  const hasExplicitRole = typeof appMetadata.role === "string";
  const isAdmin = hasExplicitRole ? appMetadata.role === "admin" : true;
  const modules = Array.isArray(appMetadata.modules) ? appMetadata.modules : null;

  function hasModuleAccess(moduleId) {
    if (isAdmin) return true;
    if (modules === null) return true; // grandfathered — ver comentário acima
    return modules.includes(moduleId);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        configured: isSupabaseConfigured,
        signIn,
        signOut,
        isAdmin,
        hasModuleAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
