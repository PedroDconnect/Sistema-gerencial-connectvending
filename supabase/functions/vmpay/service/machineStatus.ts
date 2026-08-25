import { Installation, MachineMonitorStatus, VendWindowEntry } from "../integrations/types.ts";

export interface ClassifyOptions {
  vendsUnavailable: boolean;
  installationsUnavailable: boolean;
}

// Decisão de negócio (19/08/2026): o que importa pra operação é só "gerou
// dose ou não" — offline confirmado pela API (states.includes("no_communication")),
// comunicação antiga (lastCommunicationAt vs threshold) e comunicação ok sem
// venda eram três status distintos, mas todos viravam a mesma ação prática
// pra quem olha o painel. Colapsados num "no_doses" só.
export function classifyMachineStatus(
  installation: Installation | null,
  vend: VendWindowEntry | null,
  options: ClassifyOptions
): MachineMonitorStatus {
  // Teve venda de verdade na janela é o sinal mais forte que existe — vale
  // mesmo que a busca de installations tenha falhado (não some do resultado
  // por causa de outro dado indisponível, seção 22 do pedido).
  if (vend) return "operating";
  if (options.vendsUnavailable) return "data_unavailable";
  // Se a busca de installations falhou por completo, todo mundo cai aqui
  // sem installation (não tem como saber qual tinha e qual não tinha) —
  // por isso installationsUnavailable é checado antes de decidir
  // "no_installation" de verdade.
  if (!installation) return options.installationsUnavailable ? "data_unavailable" : "no_installation";

  return "no_doses";
}
