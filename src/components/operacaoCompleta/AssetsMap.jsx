import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

const BRAZIL_CENTER = [-14.235, -51.9253];
const BRAZIL_ZOOM = 4;

// O mapa começava sempre no mesmo zoom fixo (Brasil inteiro) e nunca
// reagia à filtragem — filtrar pra um cliente/modelo específico deixava as
// máquinas resultantes minúsculas/agrupadas num canto, exigindo zoom manual
// pra enxergar. Este componente roda dentro do MapContainer (único jeito de
// acessar a instância do mapa via useMap) e reenquadra a visão pros pontos
// atuais toda vez que a lista filtrada muda.
function FitBoundsToMarkers({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView(BRAZIL_CENTER, BRAZIL_ZOOM);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [points, map]);

  return null;
}

// Marker próprio (pin com sombra) em vez do ícone padrão do Leaflet — evita
// o problema clássico de bundler (webpack/vite não resolve os PNGs padrão
// sem configuração extra) e mantém a mesma estética "SVG à mão" do resto do
// painel (nenhum outro gráfico usa ícone de imagem).
function pointIcon(active) {
  const color = active ? "var(--status-good)" : "var(--text-faint)";
  return L.divIcon({
    className: "assets-map__marker",
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function AssetsMap({ points, loading, withoutLocation, totalMatching, onSelect }) {
  const markers = useMemo(() => points ?? [], [points]);
  const hasFilterContext = typeof totalMatching === "number";

  return (
    <section className="card assets-map-card">
      <div className="ativos-table-card__header">
        <div>
          <h2 className="card-title">Mapa dos Ativos</h2>
          {hasFilterContext && (
            <p className="assets-map__subtitle">
              {totalMatching.toLocaleString("pt-BR")} máquina{totalMatching === 1 ? "" : "s"} correspond
              {totalMatching === 1 ? "e" : "em"} aos filtros — {markers.length.toLocaleString("pt-BR")} aparece
              {markers.length === 1 ? "" : "m"} no mapa
            </p>
          )}
        </div>
        <span className="ativos-table-card__count">{markers.length.toLocaleString("pt-BR")} localizados</span>
      </div>

      <div className="assets-map__wrap">
        <div className="assets-map__container">
          {loading && markers.length === 0 ? (
            <div className="stat-tile--skeleton" style={{ height: "100%", borderRadius: "var(--radius-md)" }} />
          ) : (
            <MapContainer center={BRAZIL_CENTER} zoom={BRAZIL_ZOOM} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBoundsToMarkers points={markers} />
              <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
                {markers.map((point) => (
                  <Marker
                    key={point.equipmentId}
                    position={[point.latitude, point.longitude]}
                    icon={pointIcon(point.equipmentActive)}
                    eventHandlers={{ click: () => onSelect?.(point.equipmentId) }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                      <div className="assets-map__tooltip">
                        <strong>{point.equipmentName || "Não informado"}</strong>
                        <span>{point.customerName || "Sem cliente associado"}</span>
                        {point.address && <span className="assets-map__tooltip-address">{point.address}</span>}
                        {(point.city || point.state) && (
                          <span className="assets-map__tooltip-address">
                            {[point.city, point.state].filter(Boolean).join(" - ")}
                          </span>
                        )}
                      </div>
                    </Tooltip>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>
          )}
        </div>

        <div className="assets-map__legend">
          <span className="assets-map__legend-item">
            <span className="assets-map__legend-dot" style={{ background: "var(--status-good)" }} />
            Ativa
          </span>
          <span className="assets-map__legend-item">
            <span className="assets-map__legend-dot" style={{ background: "var(--text-faint)" }} />
            Inativa
          </span>
        </div>
      </div>

      {!loading && markers.length === 0 && (
        <p className="drawer-field__hint" style={{ marginTop: 12 }}>
          Nenhuma máquina com localização válida para os filtros atuais.
        </p>
      )}

      {withoutLocation > 0 && (
        <p className="assets-map__hint">
          {withoutLocation.toLocaleString("pt-BR")} máquina{withoutLocation === 1 ? "" : "s"} não aparece
          {withoutLocation === 1 ? "" : "m"} no mapa (sem cliente associado ou sem coordenadas cadastradas).
        </p>
      )}
    </section>
  );
}
