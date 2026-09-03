// Convite de agenda (addendum 02/09/2026, spec seção 7) — nível de
// automação escolhido: "sem alterações no backend" (a spec descreve dois
// níveis; o outro, envio automático e silencioso via Microsoft Graph API,
// exige OAuth + componente de backend novo — fora de escopo aqui, decisão
// de negócio pra revisitar se quiserem). Gera um .ics baixável
// (importável em qualquer calendário) e um link do Outlook Web já
// preenchido, faltando só clicar em enviar.

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeIcsText(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

// date: "YYYY-MM-DD" (valor de um campo type=date). time: "HH:mm"
// (type=time) ou vazio/null — evento de dia inteiro nesse caso, conforme
// a spec ("evento de dia inteiro se o horário não for informado").
function toIcsDate(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  if (!time) return { allDay: true, value: `${y}${pad2(m)}${pad2(d)}` };
  const [hh, mm] = time.split(":").map(Number);
  return { allDay: false, value: `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00` };
}

function buildDescription({ internalLocation, machineCategory, machineModel, businessModel }) {
  const lines = [
    internalLocation && `Local interno: ${internalLocation}`,
    (machineCategory || machineModel) && `Categoria/Modelo: ${[machineCategory, machineModel].filter(Boolean).join(" — ")}`,
    businessModel && `Modelo de negócio: ${businessModel}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildInstallationInvite({
  contractNumber,
  customerName,
  date,
  time,
  address,
  attendeeEmail,
  internalLocation,
  machineCategory,
  machineModel,
  businessModel,
}) {
  const subject = `Instalação de máquina — Contrato ${contractNumber ?? "—"} — ${customerName ?? ""}`;
  const description = buildDescription({ internalLocation, machineCategory, machineModel, businessModel });
  return { subject, description, address, attendeeEmail, date, time };
}

export function buildInstallationIcs(invite) {
  const start = toIcsDate(invite.date, invite.time);
  const uid = `prep-${invite.date}-${Math.random().toString(36).slice(2)}@painelgerencial`;
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Painel Gerencial//Pedidos de Preparacao//PT-BR",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    start.allDay ? `DTSTART;VALUE=DATE:${start.value}` : `DTSTART:${start.value}`,
    start.allDay ? `DTEND;VALUE=DATE:${start.value}` : `DTEND:${start.value}`,
    `SUMMARY:${escapeIcsText(invite.subject)}`,
    invite.address ? `LOCATION:${escapeIcsText(invite.address)}` : "",
    invite.description ? `DESCRIPTION:${escapeIcsText(invite.description)}` : "",
    invite.attendeeEmail ? `ATTENDEE;CN=${escapeIcsText(invite.attendeeEmail)}:mailto:${invite.attendeeEmail}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadIcs(invite, fileName) {
  const blob = new Blob([buildInstallationIcs(invite)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Compose deep-link do Outlook Web — abre um rascunho pronto, só falta
// clicar em enviar (spec seção 7, mesmo nível "sem alterações no
// backend").
export function buildOutlookComposeUrl(invite) {
  const startDt = invite.time ? `${invite.date}T${invite.time}:00` : `${invite.date}T00:00:00`;
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: invite.subject,
    location: invite.address ?? "",
    body: invite.description ?? "",
    startdt: startDt,
    enddt: startDt,
    allday: invite.time ? "false" : "true",
    to: invite.attendeeEmail ?? "",
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}
