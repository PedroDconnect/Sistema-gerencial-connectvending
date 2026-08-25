import { useState } from "react";
import { Icon } from "../Icon";
import { groupBy } from "../../services/ativosService";

export function GroupDistribution({
  title,
  hint,
  data,
  field,
  emptyLabel,
  secondaryField,
  secondaryEmptyLabel,
  secondaryLabel,
  columns,
  onSelect,
}) {
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedSubgroup, setExpandedSubgroup] = useState(null);
  const groups = groupBy(data, field, { emptyLabel });

  function toggleGroup(label) {
    setExpandedGroup((prev) => (prev === label ? null : label));
    setExpandedSubgroup(null);
  }

  function toggleSubgroup(label) {
    setExpandedSubgroup((prev) => (prev === label ? null : label));
  }

  return (
    <section className="card ativos-distribution">
      <h2 className="card-title">{title}</h2>
      {hint && <p className="ativos-distribution__hint">{hint}</p>}

      <div className="ativos-distribution__header">
        <span />
        <span>{title.replace("Distribuição por ", "")}</span>
        <span>Distribuição</span>
        <span className="num">Máquinas</span>
        <span className="num">%</span>
      </div>

      <ul className="ativos-distribution__list">
        {groups.map((group) => {
          const isOpen = expandedGroup === group.label;
          const subGroups = isOpen ? groupBy(group.items, secondaryField, { emptyLabel: secondaryEmptyLabel }) : [];

          return (
            <li key={group.label} className="ativos-distribution__group">
              <button
                type="button"
                className="ativos-distribution__row"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={isOpen}
              >
                <Icon
                  name="chevronDown"
                  size={14}
                  className={`ativos-distribution__chevron ${isOpen ? "is-open" : ""}`}
                />
                <span className="ativos-distribution__name" title={group.label}>
                  {group.label}
                </span>
                <span className="ativos-distribution__track">
                  <span className="ativos-distribution__fill" style={{ width: `${group.pct}%` }} />
                </span>
                <span className="ativos-distribution__count num">{group.count.toLocaleString("pt-BR")}</span>
                <span className="ativos-distribution__pct num">{group.pct}%</span>
              </button>

              {isOpen && (
                <div className="ativos-distribution__detail">
                  <p className="ativos-distribution__subhint">
                    {secondaryLabel} em "{group.label}" — clique para ver os números de cada máquina.
                  </p>
                  <ul className="ativos-distribution__sublist">
                    {subGroups.map((sub) => {
                      const subOpen = expandedSubgroup === sub.label;
                      return (
                        <li key={sub.label} className="ativos-distribution__subgroup">
                          <button
                            type="button"
                            className="ativos-distribution__subrow"
                            onClick={() => toggleSubgroup(sub.label)}
                            aria-expanded={subOpen}
                          >
                            <span className="ativos-distribution__name" title={sub.label}>
                              {sub.label}
                            </span>
                            <span className="ativos-distribution__track">
                              <span className="ativos-distribution__fill ativos-distribution__fill--sub" style={{ width: `${sub.pct}%` }} />
                            </span>
                            <span className="ativos-distribution__count num">{sub.count.toLocaleString("pt-BR")}</span>
                            <span className="ativos-distribution__pct num">{sub.pct}%</span>
                            <Icon
                              name="eye"
                              size={14}
                              className={`ativos-distribution__eye ${subOpen ? "is-open" : ""}`}
                            />
                          </button>

                          {subOpen && (
                            <div className="ativos-distribution__machines">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    {columns.map((col) => (
                                      <th key={col.key} className={col.numeric ? "num" : ""}>
                                        {col.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sub.items.map((item) => (
                                    <tr key={item.id} tabIndex={0} onClick={() => onSelect(item)}>
                                      {columns.map((col) => (
                                        <td key={col.key} className={col.numeric ? "num" : ""}>
                                          {item[col.key] || <span className="ativos-table__muted">—</span>}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
