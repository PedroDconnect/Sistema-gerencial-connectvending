import { useState } from "react";
import { Icon } from "./Icon";
import { navItems } from "../data/mockData";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";

const THEME_CHOICES = [
  { id: "system", label: "Auto" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
];

// Grupo cujo filho está ativo já começa aberto (ex.: entrar direto em
// "Operação Completa" não deve exigir clicar em "Operação" de novo pra
// ver onde você está).
function findActiveParentId(active) {
  const parent = navItems.find((item) => item.children?.some((child) => child.id === active));
  return parent?.id ?? null;
}

// "administracao" é role-gated (só admin), os demais são module-gated
// (ver hasModuleAccess) — um grupo (ex.: "Operação") só aparece se sobrar
// pelo menos 1 filho visível, nunca um cabeçalho vazio sem nada dentro.
function visibleNavItems(isAdmin, hasModuleAccess) {
  return navItems
    .map((item) => {
      if (item.id === "administracao") return isAdmin ? item : null;
      if (item.children) {
        const children = item.children.filter((child) => hasModuleAccess(child.id));
        return children.length > 0 ? { ...item, children } : null;
      }
      return hasModuleAccess(item.id) ? item : null;
    })
    .filter(Boolean);
}

export function Sidebar({ active, onNavigate, collapsed = false, onToggleCollapse }) {
  const { user, signOut, isAdmin, hasModuleAccess } = useAuth();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(() => findActiveParentId(active));
  const initials = (user?.email ?? "CM").slice(0, 2).toUpperCase();
  const items = visibleNavItems(isAdmin, hasModuleAccess);

  function handleGroupClick(item) {
    setOpenGroup((prev) => (prev === item.id ? null : item.id));
  }

  function handleChildClick(child) {
    onNavigate(child.id);
  }

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar__brand">
        <span className="sidebar__logo">
          <img src="/favicon.svg" alt="Connect Vending" />
        </span>
        <div className="sidebar__brand-text">
          <div className="sidebar__title">Painel Gerencial</div>
          <div className="sidebar__subtitle">Dashboard Executivo</div>
        </div>
        <button
          type="button"
          className="sidebar__collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Icon name={collapsed ? "chevronsRight" : "chevronsLeft"} size={16} />
        </button>
      </div>

      <div className="theme-switch" role="group" aria-label="Tema da interface">
        {THEME_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={`theme-switch__btn ${theme === choice.id ? "is-active" : ""}`}
            onClick={() => setTheme(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => {
          if (!item.children) {
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar__link ${active === item.id ? "is-active" : ""}`}
                onClick={() => onNavigate(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            );
          }

          const isOpen = openGroup === item.id;
          const hasActiveChild = item.children.some((child) => child.id === active);

          return (
            <div key={item.id} className="sidebar__group">
              <button
                type="button"
                className={`sidebar__link sidebar__link--group ${hasActiveChild ? "is-active" : ""}`}
                onClick={() => handleGroupClick(item)}
                aria-expanded={isOpen}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                <Icon name="chevronDown" size={14} className={`sidebar__group-chevron ${isOpen ? "is-open" : ""}`} />
              </button>
              {/* Recolhida, a sidebar vira um trilho de ícones: o submenu
                  sempre existe no DOM e aparece como flyout no hover (CSS).
                  Expandida, segue o acordeão controlado por openGroup. */}
              {(isOpen || collapsed) && (
                <div className="sidebar__submenu">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className={`sidebar__link sidebar__link--sub ${active === child.id ? "is-active" : ""}`}
                      onClick={() => handleChildClick(child)}
                    >
                      <Icon name={child.icon} size={16} />
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__profile-wrap">
          <button
            type="button"
            className="sidebar__profile"
            onClick={() => setMenuOpen((v) => !v)}
            title={collapsed ? (user?.email ?? undefined) : undefined}
          >
            <span className="sidebar__avatar">{initials}</span>
            <span className="sidebar__profile-text">
              <span className="sidebar__profile-name">{user?.email ?? "Carlos Mendes"}</span>
              <span className="sidebar__profile-role">{isAdmin ? "Administrador" : "Usuário"}</span>
            </span>
            <Icon name="chevronDown" size={16} />
          </button>
          {menuOpen && (
            <div className="sidebar__menu">
              <button type="button" className="sidebar__menu-item" onClick={signOut}>
                Sair da conta
              </button>
            </div>
          )}
        </div>
        <div className="sidebar__updated">
          <div>Última atualização</div>
          <div className="sidebar__updated-time">31/05/2025 08:30</div>
        </div>
      </div>
    </aside>
  );
}
