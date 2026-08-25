export function SetupNeeded() {
  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 460, alignItems: "flex-start", gap: 10 }}>
        <h1 className="login-card__title">Configuração pendente</h1>
        <p className="login-card__subtitle" style={{ textAlign: "left", marginTop: 0 }}>
          O dashboard ainda não tem as credenciais do Supabase. Para conectar:
        </p>
        <ol style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, paddingLeft: 18 }}>
          <li>
            Copie <code>.env.example</code> para <code>.env</code>
          </li>
          <li>
            Preencha <code>VITE_SUPABASE_FRONTEND_URL</code> e <code>VITE_SUPABASE_FRONTEND_ANON_KEY</code> com os valores do seu
            projeto (Settings → API no painel do Supabase)
          </li>
          <li>
            Rode <code>supabase/schema.sql</code> no SQL Editor do Supabase
          </li>
          <li>
            Opcional: rode <code>supabase/seed.sql</code> para dados de teste
          </li>
          <li>Reinicie o servidor de desenvolvimento (npm run dev)</li>
        </ol>
      </div>
    </div>
  );
}
