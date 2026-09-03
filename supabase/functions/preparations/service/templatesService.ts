import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ControlledError } from "../shared/http.ts";
import { CallerInfo } from "../shared/auth.ts";
import { TemplateField, TemplateSchema } from "./pdfService.ts";

export interface TemplateRow {
  id: string;
  name: string;
  version: number;
  schema: TemplateSchema;
  active: boolean;
  createdAt: string;
}

const TEMPLATE_NAME = "Ficha de preparação Connect Vending";
// "time" adicionado no addendum de 02/09/2026 — convite de agenda
// (seção 7) usa horário opcional junto da Previsão de instalação.
const ALLOWED_FIELD_TYPES = new Set(["text", "textarea", "number", "date", "time", "email", "single_select", "multi_select", "boolean"]);
const CONDITION_OPS = new Set(["eq", "neq", "in", "notIn"]);

function toTemplateRow(row: Record<string, unknown>): TemplateRow {
  return {
    id: row.id as string,
    name: row.name as string,
    version: row.version as number,
    schema: row.schema as TemplateSchema,
    active: row.active as boolean,
    createdAt: row.created_at as string,
  };
}

// Regra crítica da spec (seção 6): nunca altera uma ficha histórica quando
// o template muda. Toda ficha já criada guarda template_id +
// template_version na hora — trocar o template ativo não afeta o que já
// existe, só o que for criado dali em diante.
export async function getActiveTemplate(db: SupabaseClient): Promise<TemplateRow> {
  const { data, error } = await db
    .from("preparation_form_templates")
    .select("*")
    .eq("name", TEMPLATE_NAME)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar o template da ficha: ${error.message}`, 502);
  if (!data) throw new ControlledError("Nenhum template de ficha ativo — rode o schema.sql (seed do template v1).", 500);
  return toTemplateRow(data);
}

// Usado na hora de gerar o PDF de uma ficha já criada — sempre pelo
// template_id/version guardado NA FICHA, nunca pelo template ativo atual
// (regra crítica da spec seção 6: ficha histórica nunca muda de template).
export async function getTemplateById(db: SupabaseClient, templateId: string): Promise<TemplateRow> {
  const { data, error } = await db.from("preparation_form_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw new ControlledError(`Falha ao consultar template: ${error.message}`, 502);
  if (!data) throw new ControlledError("Template da ficha não encontrado.", 404);
  return toTemplateRow(data);
}

export async function listTemplateVersions(db: SupabaseClient): Promise<TemplateRow[]> {
  const { data, error } = await db
    .from("preparation_form_templates")
    .select("*")
    .eq("name", TEMPLATE_NAME)
    .order("version", { ascending: false });
  if (error) throw new ControlledError(`Falha ao listar versões do template: ${error.message}`, 502);
  return (data ?? []).map(toTemplateRow);
}

// Validação frouxa de propósito: visibleIf/optionRules são o "modo
// avançado" da tela de admin (editado como JSON cru, ver
// PreparationTemplateSettingsPage.jsx) — melhor aceitar um shape razoável
// e ignorar entrada claramente inválida do que travar o salvamento do
// template inteiro por um detalhe de uma condição.
function sanitizeConditions(raw: unknown): { field: string; op: string; value: unknown }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c?.field === "string" && typeof c?.op === "string" && CONDITION_OPS.has(c.op as string))
    .map((c) => ({ field: c.field as string, op: c.op as string, value: c.value }));
  return out.length > 0 ? out : undefined;
}

function sanitizeOptionRules(raw: unknown): { when: { field: string; op: string; value: unknown }[]; removeOptions: string[] }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((r) => r as Record<string, unknown>)
    .map((r) => ({
      when: sanitizeConditions(r?.when) ?? [],
      removeOptions: Array.isArray(r?.removeOptions) ? (r.removeOptions as unknown[]).filter((o): o is string => typeof o === "string") : [],
    }))
    .filter((r) => r.when.length > 0 && r.removeOptions.length > 0);
  return out.length > 0 ? out : undefined;
}

function validateFields(fields: unknown): TemplateField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ControlledError("O template precisa de pelo menos 1 campo.", 400);
  }
  const seenKeys = new Set<string>();
  return fields.map((raw, index) => {
    const field = raw as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key.trim() : "";
    const label = typeof field.label === "string" ? field.label.trim() : "";
    const type = typeof field.type === "string" ? field.type : "";
    if (!key || !label) throw new ControlledError(`Campo #${index + 1}: chave e rótulo são obrigatórios.`, 400);
    if (seenKeys.has(key)) throw new ControlledError(`Chave de campo duplicada: "${key}".`, 400);
    seenKeys.add(key);
    if (!ALLOWED_FIELD_TYPES.has(type)) throw new ControlledError(`Tipo de campo inválido em "${key}": ${type}.`, 400);
    const options = Array.isArray(field.options) ? field.options.filter((o): o is string => typeof o === "string") : undefined;
    if ((type === "single_select" || type === "multi_select") && (!options || options.length === 0)) {
      throw new ControlledError(`Campo "${key}" (${type}) precisa de pelo menos 1 opção.`, 400);
    }
    const visibleIf = sanitizeConditions(field.visibleIf);
    const optionRules = sanitizeOptionRules(field.optionRules);
    return {
      key,
      label,
      type,
      required: Boolean(field.required),
      perForm: Boolean(field.perForm),
      ...(options ? { options } : {}),
      ...(visibleIf ? { visibleIf } : {}),
      ...(optionRules ? { optionRules } : {}),
    } as TemplateField;
  });
}

// Cria uma NOVA versão (nunca faz update numa existente) — desativa a
// anterior e ativa a nova na mesma escrita, pra nunca ter duas ativas ao
// mesmo tempo nem um "buraco" sem nenhuma ativa entre as duas operações.
export async function createTemplateVersion(db: SupabaseClient, caller: CallerInfo, fields: unknown): Promise<TemplateRow> {
  const validFields = validateFields(fields);
  const current = await getActiveTemplate(db).catch(() => null);
  const nextVersion = (current?.version ?? 0) + 1;

  if (current) {
    const { error: deactivateError } = await db.from("preparation_form_templates").update({ active: false }).eq("id", current.id);
    if (deactivateError) throw new ControlledError(`Falha ao desativar template anterior: ${deactivateError.message}`, 502);
  }

  const { data, error } = await db
    .from("preparation_form_templates")
    .insert({
      name: TEMPLATE_NAME,
      version: nextVersion,
      schema: { fields: validFields },
      active: true,
      created_by: caller.id,
    })
    .select("*")
    .single();
  if (error) throw new ControlledError(`Falha ao criar nova versão do template: ${error.message}`, 502);
  return toTemplateRow(data);
}
