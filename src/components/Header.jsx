import { useAuth } from "../context/AuthContext";

function greetingPeriod() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Nome vem do usuário autenticado (metadata ou parte local do e-mail) —
// antes era "Carlos" fixo pra qualquer conta logada.
function greetingName(user) {
  const meta = user?.user_metadata ?? {};
  const full = meta.full_name || meta.name;
  if (full) return String(full).trim().split(" ")[0];
  const local = user?.email?.split("@")[0]?.split(/[._-]/)[0];
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// Removidos em 02/09/2026: botão de período fixo ("01 – 31 Mai 2025"),
// "Filtros" e sino de notificações com contador "3" travado — nenhum dos
// três fazia algo de verdade (não filtravam nada, não abriam nada), eram
// só decoração fictícia.
export function Header() {
  const { user } = useAuth();
  const name = greetingName(user);

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar__title">
          {greetingPeriod()}
          {name ? `, ${name}!` : "!"}
        </h1>
        <p className="topbar__subtitle">Aqui está o resumo executivo da sua empresa hoje.</p>
      </div>
    </header>
  );
}
