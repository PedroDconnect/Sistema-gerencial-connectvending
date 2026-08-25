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

export function Sidebar({ active, onNavigate }) {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(() => findActiveParentId(active));
  const initials = (user?.email ?? "CM").slice(0, 2).toUpperCase();

  function handleGroupClick(item) {
    setOpenGroup((prev) => (prev === item.id ? null : item.id));
  }

  function handleChildClick(child) {
    onNavigate(child.id);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">
          <Icon name="bolt" size={20} />
        </span>
        <div>
          <div className="sidebar__title">CEO</div>
          <div className="sidebar__subtitle">Dashboard Executivo</div>
        </div>
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
        {navItems.map((item) => {
          if (!item.children) {
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar__link ${active === item.id ? "is-active" : ""}`}
                onClick={() => onNavigate(item.id)}
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
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                <Icon name="chevronDown" size={14} className={`sidebar__group-chevron ${isOpen ? "is-open" : ""}`} />
              </button>
              {isOpen && (
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
          <button type="button" className="sidebar__profile" onClick={() => setMenuOpen((v) => !v)}>
            <span className="sidebar__avatar">{initials}</span>
            <span className="sidebar__profile-text">
              <span className="sidebar__profile-name">{user?.email ?? "Carlos Mendes"}</span>
              <span className="sidebar__profile-role">CEO</span>
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
