import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { searchPreparationCustomers, createPreparationCustomer } from "../../lib/preparationsApi";

// Busca cliente já sincronizado (auvo_customers) por nome/CNPJ, com opção
// de criar direto na Auvo se não existir (spec seção 4.2/9.2). Não é um
// MultiSelect de 1 valor porque "criar novo cliente" precisa de um
// mini-formulário embutido, não só uma lista de opções.
export function CustomerSearchField({ value, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", cpfCnpj: "", address: "", email: "" });

  useEffect(() => {
    if (value || !query.trim()) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(() => {
      searchPreparationCustomers(query)
        .then((data) => {
          if (!cancelled) setResults(data?.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, value]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const customer = await createPreparationCustomer(newCustomer);
      onSelect(customer);
      setShowCreate(false);
    } catch (err) {
      setCreateError(err);
    } finally {
      setCreating(false);
    }
  }

  if (value) {
    return (
      <div className="form-field">
        <span className="form-field__label">Cliente</span>
        <div className="metric-modal__customer-row" style={{ padding: "8px 10px", background: "var(--input-bg)", borderRadius: "var(--radius-sm)" }}>
          <span className="metric-modal__customer-name">{value.name}</span>
          <button type="button" className="link-btn" onClick={() => onSelect(null)}>
            Trocar
          </button>
        </div>
      </div>
    );
  }

  if (showCreate) {
    return (
      <form onSubmit={handleCreate} className="form-field" style={{ gap: 10 }}>
        <span className="form-field__label">Novo cliente (Auvo)</span>
        <input
          className="form-field__input"
          placeholder="Nome do cliente"
          required
          value={newCustomer.name}
          onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))}
        />
        <input
          className="form-field__input"
          placeholder="CNPJ/CPF"
          required
          value={newCustomer.cpfCnpj}
          onChange={(e) => setNewCustomer((prev) => ({ ...prev, cpfCnpj: e.target.value }))}
        />
        <input
          className="form-field__input"
          placeholder="Endereço"
          value={newCustomer.address}
          onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))}
        />
        <input
          className="form-field__input"
          placeholder="E-mail (opcional)"
          type="email"
          value={newCustomer.email}
          onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))}
        />
        {createError && <span className="form-field__error">{createError.message}</span>}
        <div className="admin-users__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setShowCreate(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={creating}>
            {creating ? "Criando…" : "Criar cliente"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="form-field">
      <span className="form-field__label">Cliente</span>
      <div className="multiselect__search">
        <Icon name="search" size={13} />
        <input placeholder="Buscar por nome ou CNPJ…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      {searching && <span className="form-field__hint">Buscando…</span>}
      {!searching && query.trim() && results.length === 0 && (
        <span className="form-field__hint">Nenhum cliente encontrado.</span>
      )}
      {results.length > 0 && (
        <div className="multiselect__options" style={{ maxHeight: 200 }}>
          {results.map((customer) => (
            <button key={customer.id} type="button" className="multiselect__option" onClick={() => onSelect(customer)}>
              <span>
                {customer.name} {customer.cpfCnpj ? `— ${customer.cpfCnpj}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="link-btn" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setShowCreate(true)}>
        + Criar novo cliente
      </button>
    </div>
  );
}
