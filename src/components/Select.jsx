import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

// Dropdown de seleção única com o mesmo visual/comportamento do MultiSelect
// (ver components/ativos/MultiSelect.jsx: mesmas classes .multiselect__*,
// painel abre pra baixo do gatilho, com busca quando tem muita opção,
// fecha ao clicar fora ou Esc). Existe separado dele porque aqui o valor é
// 1 string só (não array) — escolher uma opção já fecha o painel, no
// lugar de continuar marcando várias.
//
// Substitui o <select> nativo nos filtros de Operação: o nativo abre como
// popup do sistema operacional (pode abrir pra cima cobrindo a própria
// janela do navegador se estiver perto do fim da tela) e não tem como
// estilizar — daí o visual quebrado reportado.
//
// value/option.value sempre comparados como string — mantém compatível
// com o estado de filtro existente, que já guardava string mesmo quando a
// option original tinha value numérico (comportamento herdado do <select>
// nativo, cujo e.target.value sempre voltava string).
export function Select({ label, value, options, onChange, placeholder = "Todos", className }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
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
    ? options.filter((opt) => opt.label.toLowerCase().includes(normalizedQuery))
    : options;

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  function handleSelect(optValue) {
    onChange(optValue);
    setOpen(false);
  }

  return (
    <div className={`multiselect ${className ?? ""}`} ref={containerRef}>
      {label && <span className="multiselect__label">{label}</span>}
      <button
        type="button"
        className={`multiselect__trigger ${value ? "has-value" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="multiselect__trigger-text" title={selectedOption?.label ?? placeholder}>
          {selectedOption?.label ?? placeholder}
        </span>
        <Icon name="chevronDown" size={14} className={`multiselect__chevron ${open ? "is-open" : ""}`} />
      </button>

      {open && (
        <div className="multiselect__panel" role="listbox">
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
            <button
              type="button"
              className={`multiselect__option ${!value ? "is-selected" : ""}`}
              onClick={() => handleSelect("")}
            >
              <span>{placeholder}</span>
              {!value && <Icon name="check" size={13} className="multiselect__option-check" />}
            </button>

            {filteredOptions.length === 0 && <div className="multiselect__empty">Nenhuma opção encontrada</div>}
            {filteredOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`multiselect__option ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Icon name="check" size={13} className="multiselect__option-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
