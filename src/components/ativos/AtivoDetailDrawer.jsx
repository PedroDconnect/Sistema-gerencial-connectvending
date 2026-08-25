import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { ATIVO_FIELD_LABELS, formatCnpj } from "../../services/ativosService";

function CopyRow({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard indisponível — ignora silenciosamente
    }
  }

  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <div className="drawer-field__value-row">
        <span className={mono ? "drawer-field__value num" : "drawer-field__value"}>{value}</span>
        <button type="button" className="drawer-field__copy" onClick={handleCopy} aria-label={`Copiar ${label}`}>
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function PlainRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="drawer-field">
      <span className="drawer-field__label">{label}</span>
      <span className="drawer-field__value">{value}</span>
    </div>
  );
}

export function AtivoDetailDrawer({ ativo, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!ativo) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ativo, onClose]);

  if (!ativo) return null;

  const cnpjFormatted = formatCnpj(ativo.clienteCnpj);
  const hasCliente = Boolean(ativo.clienteNome || ativo.clienteCodigo || ativo.clienteCnpj);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do ativo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-panel__header">
          <div>
            <h2>Detalhes do Ativo</h2>
            <p>{ativo.modelo || "Modelo não informado"}</p>
          </div>
          <button type="button" className="icon-btn" ref={closeButtonRef} onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="drawer-panel__body">
          {hasCliente && (
            <section className="drawer-section drawer-section--highlight">
              <span className="drawer-section__eyebrow">Cliente</span>
              <h3 className="drawer-client-name">{ativo.clienteNome || "Cliente não identificado"}</h3>
              <div className="drawer-client-meta">
                {ativo.clienteCodigo && <span>Cliente: {ativo.clienteCodigo}</span>}
                {cnpjFormatted && <span>CNPJ: {cnpjFormatted}</span>}
                {ativo.clienteLoja && <span>Loja: {ativo.clienteLoja}</span>}
                {ativo.pontoVenda && <span>Ponto de Venda: {ativo.pontoVenda}</span>}
              </div>
            </section>
          )}

          <section className="drawer-section">
            <span className="drawer-section__eyebrow">Identificação</span>
            <CopyRow label={ATIVO_FIELD_LABELS.codigo} value={ativo.codigo} />
            <PlainRow label={ATIVO_FIELD_LABELS.modelo} value={ativo.modelo} />
            <CopyRow label={ATIVO_FIELD_LABELS.numeroSerie} value={ativo.numeroSerie} />
            <PlainRow label={ATIVO_FIELD_LABELS.filial} value={ativo.filial} />
          </section>

          {(ativo.produtoCodigo || ativo.produtoDescricao) && (
            <section className="drawer-section">
              <span className="drawer-section__eyebrow">Produto</span>
              <CopyRow label={ATIVO_FIELD_LABELS.produtoCodigo} value={ativo.produtoCodigo} />
              <PlainRow label={ATIVO_FIELD_LABELS.produtoDescricao} value={ativo.produtoDescricao} />
            </section>
          )}

          {(ativo.pontoVenda || ativo.clienteLoja) && (
            <section className="drawer-section">
              <span className="drawer-section__eyebrow">Localização</span>
              <PlainRow label={ATIVO_FIELD_LABELS.pontoVenda} value={ativo.pontoVenda} />
              <PlainRow label={ATIVO_FIELD_LABELS.clienteLoja} value={ativo.clienteLoja} />
            </section>
          )}

          {hasCliente && (
            <section className="drawer-section">
              <span className="drawer-section__eyebrow">Cliente</span>
              <PlainRow label={ATIVO_FIELD_LABELS.clienteNome} value={ativo.clienteNome} />
              <PlainRow label={ATIVO_FIELD_LABELS.clienteCodigo} value={ativo.clienteCodigo} />
              <CopyRow label={ATIVO_FIELD_LABELS.clienteCnpj} value={cnpjFormatted} mono={false} />
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
