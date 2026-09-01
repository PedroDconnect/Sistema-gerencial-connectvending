import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mapeamento nome→id de tipo de tarefa, descoberto ao vivo (ver
// auvo.provider.ts) — nunca inventado. Permite às páginas "Chamados" e
// "Abastecimento Rotina" pedir direto pra Auvo só o(s) tipo(s) que
// interessam (taskTypeId), em vez de buscar o período inteiro pra depois
// separar aqui (ver fetchTasksForRange em operationService.ts).
export async function readTaskTypeCatalog(db: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await db.from("auvo_task_type_catalog").select("task_type_name, task_type_id");
  return new Map((data ?? []).map((row) => [row.task_type_name as string, row.task_type_id as number]));
}

// Chamado a cada página de tarefas buscada SEM filtro de tipo (qualquer
// listTasks/countTasks da Auvo já devolve taskTypeId+taskTypeName de
// graça) — grava o que for novo, sem custo perceptível (upsert pequeno,
// no máximo 1 linha por tipo real distinto). É o que auto-preenche o
// catálogo com uso normal do sistema, sem sincronização dedicada.
export async function recordTaskTypeSightings(
  db: SupabaseClient,
  tasks: Array<{ taskTypeId: number; taskTypeName: string }>
): Promise<void> {
  const seen = new Map<string, number>();
  for (const task of tasks) {
    if (task.taskTypeName) seen.set(task.taskTypeName, task.taskTypeId);
  }
  if (seen.size === 0) return;

  const rows = Array.from(seen.entries()).map(([task_type_name, task_type_id]) => ({
    task_type_name,
    task_type_id,
    updated_at: new Date().toISOString(),
  }));

  // Best-effort: um erro aqui (ex.: RLS mal configurada num projeto novo)
  // nunca pode derrubar a resposta real da tarefa que já foi buscada — só
  // significa que o caminho rápido continua indisponível até a próxima
  // tentativa.
  try {
    await db.from("auvo_task_type_catalog").upsert(rows, { onConflict: "task_type_name" });
  } catch {
    // silencioso de propósito — ver comentário acima
  }
}
