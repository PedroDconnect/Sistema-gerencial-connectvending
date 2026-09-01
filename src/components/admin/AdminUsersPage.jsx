import { useState } from "react";
import { Icon } from "../Icon";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { createAdminUser, updateAdminUser, deleteAdminUser } from "../../lib/adminApi";
import { ASSIGNABLE_MODULES } from "../../data/mockData";

function ModulesCell({ role, modules }) {
  if (role === "admin") return <span className="badge badge--info">Todos (admin)</span>;
  if (!modules || modules.length === 0) return <span className="badge badge--neutral">Nenhum</span>;
  const labels = modules.map((id) => ASSIGNABLE_MODULES.find((m) => m.id === id)?.label ?? id);
  return (
    <span title={labels.join(", ")}>
      {labels.length} módulo{labels.length > 1 ? "s" : ""}
    </span>
  );
}

// undefined (fechado) / null (criar) / objeto (editar) controlado pelo pai.
function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role ?? "user");
  const [modules, setModules] = useState(() => new Set(user?.modules ?? []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function toggleModule(id) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await updateAdminUser(user.id, { role, modules: Array.from(modules) });
      } else {
        await createAdminUser({ email, password, role, modules: Array.from(modules) });
      }
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="metric-modal-backdrop" onClick={onClose}>
      <div
        className="metric-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Editar usuário" : "Novo usuário"}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="metric-modal-panel__header">
          <div>
            <h2>{isEdit ? "Editar usuário" : "Novo usuário"}</h2>
            <p>{isEdit ? user.email : "Cria a conta e já libera os módulos certos."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 24px 24px" }}>
          {!isEdit && (
            <>
              <label className="form-field">
                <span className="form-field__label">Email</span>
                <input
                  className="form-field__input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@connectvending.com.br"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">Senha temporária</span>
                <input
                  className="form-field__input"
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                />
                <span className="form-field__hint">Combine com a pessoa por fora — ela pode trocar depois de entrar.</span>
              </label>
            </>
          )}

          <label className="form-field">
            <span className="form-field__label">Nível de acesso</span>
            <select className="form-field__input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Usuário — só os módulos marcados abaixo</option>
              <option value="admin">Administrador — acesso total, inclusive esta tela</option>
            </select>
          </label>

          {role === "user" && (
            <div className="form-field">
              <span className="form-field__label">Módulos liberados</span>
              <div className="admin-users__module-grid">
                {ASSIGNABLE_MODULES.map((m) => (
                  <label key={m.id} className="admin-users__module-item">
                    <input type="checkbox" checked={modules.has(m.id)} onChange={() => toggleModule(m.id)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <span className="form-field__error">{error.message}</span>}

          <div className="admin-users__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? "Salvando…" : isEdit ? "Salvar" : "Criar usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const { loading, error, items, refetch } = useAdminUsers();
  const [modalUser, setModalUser] = useState(undefined);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  async function handleDelete(user) {
    if (!window.confirm(`Remover o acesso de ${user.email}? Essa ação não pode ser desfeita.`)) return;
    setDeletingId(user.id);
    setDeleteError(null);
    try {
      await deleteAdminUser(user.id);
      refetch();
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="main">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">Administração</h1>
          <p className="topbar__subtitle">Quem tem acesso ao painel e a quais módulos.</p>
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn btn--primary" onClick={() => setModalUser(null)}>
            <Icon name="users" size={16} />
            Novo usuário
          </button>
        </div>
      </header>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar os usuários.</strong>
            <p>{error.message}</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={refetch}>
            Tentar novamente
          </button>
        </div>
      )}

      {deleteError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível remover o usuário.</strong>
            <p>{deleteError.message}</p>
          </div>
        </div>
      )}

      <section className="card">
        {loading ? (
          <div className="skeleton" style={{ height: 200, marginTop: 14 }} />
        ) : items.length === 0 ? (
          <div className="state-empty" style={{ height: 100 }}>
            Nenhum usuário ainda.
          </div>
        ) : (
          <div className="ativos-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nível</th>
                  <th>Módulos</th>
                  <th className="num">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="k">{u.email}</td>
                    <td>
                      <span className={`badge badge--${u.role === "admin" ? "info" : "neutral"}`}>
                        {u.role === "admin" ? "Administrador" : "Usuário"}
                      </span>
                    </td>
                    <td>
                      <ModulesCell role={u.role} modules={u.modules} />
                    </td>
                    <td className="num">
                      <div className="admin-users__actions">
                        <button type="button" className="btn btn--ghost" onClick={() => setModalUser(u)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalUser !== undefined && (
        <UserFormModal
          user={modalUser}
          onClose={() => setModalUser(undefined)}
          onSaved={() => {
            setModalUser(undefined);
            refetch();
          }}
        />
      )}
    </main>
  );
}
