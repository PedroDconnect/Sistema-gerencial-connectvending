import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { usePreparationTemplateVersions } from "../../hooks/usePreparationTemplateVersions";
import { createPreparationTemplateVersion } from "../../lib/preparationsApi";

const FIELD_TYPES = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "email", label: "E-mail" },
  { value: "single_select", label: "Seleção única" },
  { value: "multi_select", label: "Seleção múltipla" },
  { value: "boolean", label: "Sim/Não" },
];

function blankField() {
  return { key: "", label: "", type: "text", required: true, perForm: false, options: [] };
}

function slugifyKey(label) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Admin → Configurações → Ficha de Preparação (spec seção 6). Regra
// crítica: salvar NUNCA edita a versão existente — sempre cria uma nova
// (createPreparationTemplateVersion → POST /admin/templates), pra nunca
// mudar o que uma ficha já criada aponta (template_id/version gravado na
// hora da criação da ficha, ver plano/schema.sql).
export function PreparationTemplateSettingsPage() {
  const { loading, error, items: versions, refetch } = usePreparationTemplateVersions();
  const [draftFields, setDraftFields] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const activeVersion = versions.find((v) => v.active) ?? versions[0] ?? null;

  useEffect(() => {
    if (activeVersion && draftFields === null) {
      setDraftFields(activeVersion.schema.fields.map((f) => ({ ...f, options: f.options ?? [] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersion]);

  function updateField(index, patch) {
    setDraftFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setDraftFields((prev) => [...prev, blankField()]);
  }

  function removeField(index) {
    if (!window.confirm("Remover este campo da ficha? Fichas já criadas não são afetadas.")) return;
    setDraftFields((prev) => prev.filter((_, i) => i !== index));
  }

  function moveField(index, direction) {
    setDraftFields((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await createPreparationTemplateVersion(draftFields);
      setDraftFields(null);
      refetch();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="main">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">Ficha de Preparação</h1>
          <p className="topbar__subtitle">
            Campos que aparecem no pedido de preparação de máquinas. Salvar cria uma nova versão — fichas já criadas nunca mudam.
          </p>
        </div>
        <div className="topbar__actions">
          {activeVersion && <span className="badge badge--info">Versão ativa: v{activeVersion.version}</span>}
        </div>
      </header>

      {error && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível carregar o template.</strong>
            <p>{error.message}</p>
          </div>
        </div>
      )}
      {saveError && (
        <div className="state-error-block">
          <div>
            <strong>Não foi possível salvar a nova versão.</strong>
            <p>{saveError.message}</p>
          </div>
        </div>
      )}

      <section className="card">
        {loading || !draftFields ? (
          <div className="skeleton" style={{ height: 300, marginTop: 14 }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {draftFields.map((field, index) => (
              <div key={index} className="card" style={{ padding: 14, background: "var(--card-bg-raised)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="form-field" style={{ flex: "1 1 200px" }}>
                    <span className="form-field__label">Rótulo</span>
                    <input
                      className="form-field__input"
                      value={field.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateField(index, { label, key: field.key || slugifyKey(label) });
                      }}
                    />
                  </label>
                  <label className="form-field" style={{ flex: "0 0 160px" }}>
                    <span className="form-field__label">Chave</span>
                    <input className="form-field__input" value={field.key} onChange={(e) => updateField(index, { key: e.target.value })} />
                  </label>
                  <label className="form-field" style={{ flex: "0 0 170px" }}>
                    <span className="form-field__label">Tipo</span>
                    <select className="form-field__input" value={field.type} onChange={(e) => updateField(index, { type: e.target.value })}>
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-users__module-item">
                    <input type="checkbox" checked={field.required} onChange={(e) => updateField(index, { required: e.target.checked })} />
                    Obrigatório
                  </label>
                  <label className="admin-users__module-item">
                    <input type="checkbox" checked={field.perForm} onChange={(e) => updateField(index, { perForm: e.target.checked })} />
                    Por ficha
                  </label>
                </div>

                {(field.type === "single_select" || field.type === "multi_select") && (
                  <label className="form-field" style={{ marginTop: 10 }}>
                    <span className="form-field__label">Opções (uma por linha)</span>
                    <textarea
                      className="form-field__input"
                      rows={3}
                      value={(field.options ?? []).join("\n")}
                      onChange={(e) => updateField(index, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                    />
                  </label>
                )}

                <div className="admin-users__actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn--ghost" onClick={() => moveField(index, -1)} disabled={index === 0}>
                    <Icon name="chevronDown" size={14} className="sidebar__group-chevron is-open" style={{ transform: "rotate(180deg)" }} />
                    Subir
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => moveField(index, 1)} disabled={index === draftFields.length - 1}>
                    Descer
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => removeField(index)}>
                    Remover
                  </button>
                </div>
              </div>
            ))}

            <button type="button" className="btn btn--ghost" onClick={addField} style={{ alignSelf: "flex-start" }}>
              + Adicionar campo
            </button>

            <div className="admin-users__actions">
              <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : "Salvar nova versão"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
