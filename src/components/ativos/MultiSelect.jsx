import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((opt) => opt.toLowerCase().includes(normalizedQuery))
    : options;

  function toggleOption(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const summary =
    selected.length === 0 ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} selecionados`;

  return (
    <div className="multiselect" ref={containerRef}>
      <span className="multiselect__label">{label}</span>
      <button
        type="button"
        className={`multiselect__trigger ${selected.length > 0 ? "has-value" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="multiselect__trigger-text" title={selected.join(", ")}>
          {summary}
        </span>
        <Icon name="chevronDown" size={14} className={`multiselect__chevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <div className="multiselect__panel" role="listbox" aria-multiselectable="true">
          {options.length > 8 && (
            <div className="multiselect__search">
              <Icon name="search" size={13} />
              <input
                type="text"
                placeholder="Buscar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="multiselect__options">
            {filteredOptions.length === 0 && <div className="multiselect__empty">Nenhuma opção encontrada</div>}
            {filteredOptions.map((opt) => (
              <label key={opt} className="multiselect__option">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <button type="button" className="multiselect__clear" onClick={() => onChange([])}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
