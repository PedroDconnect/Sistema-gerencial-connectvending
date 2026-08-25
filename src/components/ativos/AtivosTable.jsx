import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { sortAtivos } from "../../services/ativosService";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "modelo", label: "Modelo", sortable: true },
  { key: "codigo", label: "Código do Ativo", sortable: true, mono: true },
  { key: "numeroSerie", label: "Nº de Série", sortable: true, mono: true },
  { key: "clienteNome", label: "Cliente", sortable: true },
  { key: "pontoVenda", label: "Ponto de Venda", sortable: true, mono: true },
  { key: "clienteLoja", label: "Loja", sortable: false, mono: true },
  { key: "filial", label: "Filial", sortable: true, mono: true },
];

export function AtivosTable({ data, onSelect }) {
  const [sortKey, setSortKey] = useState("modelo");
  const [direction, setDirection] = useState("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [data]);

  const sorted = useMemo(() => sortAtivos(data, sortKey, direction), [data, sortKey, direction]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, sorted.length);

  function toggleSort(key) {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  return (
    <section className="card ativos-table-card">
      <div className="ativos-table-card__header">
        <h2 className="card-title">Máquinas</h2>
        <span className="ativos-table-card__count">{sorted.length.toLocaleString("pt-BR")} ativos</span>
      </div>

      <div className="ativos-table-wrap">
        <table className="data-table ativos-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? "is-sortable" : ""}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="ativos-table__th-inner">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <Icon
                        name="chevronDown"
                        size={12}
                        className={`ativos-table__sort-icon ${direction === "desc" ? "is-desc" : ""}`}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.id} tabIndex={0} onClick={() => onSelect(item)}>
                <td className="k">{item.modelo || "Modelo não informado"}</td>
                <td className="num">{item.codigo}</td>
                <td className="num">{item.numeroSerie || "—"}</td>
                <td className="ativos-table__truncate" title={item.clienteNome || undefined}>
                  {item.clienteNome || <span className="ativos-table__muted">Sem cliente atribuído</span>}
                </td>
                <td className="num">{item.pontoVenda || "—"}</td>
                <td className="num">{item.clienteLoja || "—"}</td>
                <td className="num">{item.filial || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 ? (
        <div className="state-empty">
          <p>
            <strong>Nenhum ativo encontrado.</strong>
            <br />
            Tente ajustar os filtros ou realizar uma nova busca.
          </p>
        </div>
      ) : (
        <div className="ativos-pagination">
          <span className="ativos-pagination__label">
            {rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")} de{" "}
            {sorted.length.toLocaleString("pt-BR")} ativos
          </span>
          <div className="ativos-pagination__nav">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span className="ativos-pagination__page">
              Página {safePage} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
