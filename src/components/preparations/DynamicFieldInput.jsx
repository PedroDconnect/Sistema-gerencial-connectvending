// Renderiza 1 campo do template (schema dinâmico — ver spec seção 5) de
// acordo com o "type" configurado pelo admin. Usado tanto no wizard de
// criação de pedido quanto em qualquer lugar que precise mostrar/editar
// um valor de form_data sem hardcodar os 19 campos do template v1 — um
// campo novo que o admin adicionar já funciona aqui sem mudar este
// arquivo, contanto que o "type" seja um dos já suportados.
export function DynamicFieldInput({ field, value, onChange }) {
  const commonProps = {
    className: "form-field__input",
    required: field.required,
  };

  if (field.type === "textarea") {
    return <textarea {...commonProps} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }

  if (field.type === "boolean") {
    return (
      <label className="admin-users__module-item">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        Sim
      </label>
    );
  }

  if (field.type === "single_select") {
    return (
      <select {...commonProps} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    function toggle(opt) {
      onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
    }
    return (
      <div className="admin-users__module-grid" style={{ maxHeight: 160 }}>
        {(field.options ?? []).map((opt) => (
          <label key={opt} className="admin-users__module-item">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  const inputType = field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
  return <input {...commonProps} type={inputType} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}
