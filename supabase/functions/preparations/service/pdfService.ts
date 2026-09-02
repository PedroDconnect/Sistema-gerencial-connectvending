// pdf-lib: única lib de PDF usada no projeto (nenhuma outra existia —
// zero precedente, confirmado antes de implementar). Puro JS, roda em
// Deno via esm.sh sem dependência nativa — mesma convenção de import de
// https://esm.sh/@supabase/supabase-js@2 já usada em toda function.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export interface TemplateField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  perForm?: boolean;
  options?: string[];
}

export interface TemplateSchema {
  fields: TemplateField[];
}

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const LINE_HEIGHT = 16;
const LABEL_SIZE = 9;
const VALUE_SIZE = 11;
const MAX_CHARS_PER_LINE = 88;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  return String(value);
}

// Quebra simples por largura de caractere (Helvetica não é monoespaçada,
// mas pra um documento operacional interno — não pra impressão de alta
// fidelidade — essa aproximação é suficiente e evita depender de medição
// de glyph exata).
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["—"];
}

// Gera 1 PDF por ficha — dinâmico a partir do schema do template (não um
// layout fixo): itera template.schema.fields na ordem configurada, então
// um campo que o admin adicionar depois aparece aqui sem precisar tocar
// neste arquivo (decisão registrada no plano — seção 5 da spec).
export async function generatePreparationFormPdf(params: {
  orderCode: string;
  formSequence: number;
  formCount: number;
  internalLocation: string;
  formData: Record<string, unknown>;
  schema: TemplateSchema;
  documentVersion: number;
}): Promise<Uint8Array> {
  const { orderCode, formSequence, formCount, internalLocation, formData, schema, documentVersion } = params;
  const mergedValues: Record<string, unknown> = { internal_location: internalLocation, ...formData };

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  function ensureSpace(neededHeight: number) {
    if (cursorY - neededHeight < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawHeading(text: string, size: number, useBold: boolean) {
    ensureSpace(size + 6);
    page.drawText(text, { x: MARGIN, y: cursorY, size, font: useBold ? bold : font, color: rgb(0.15, 0.16, 0.13) });
    cursorY -= size + 6;
  }

  drawHeading(`Ficha de Preparação — ${orderCode}`, 16, true);
  drawHeading(`Ficha ${String(formSequence).padStart(2, "0")}/${String(formCount).padStart(2, "0")}${documentVersion > 1 ? ` — v${documentVersion}` : ""}`, 11, false);
  cursorY -= 8;

  for (const field of schema.fields) {
    const label = field.label.toUpperCase();
    const value = formatValue(mergedValues[field.key]);
    const lines = wrapText(value, MAX_CHARS_PER_LINE);

    ensureSpace(LABEL_SIZE + 4 + lines.length * LINE_HEIGHT + 6);
    page.drawText(label, { x: MARGIN, y: cursorY, size: LABEL_SIZE, font: bold, color: rgb(0.4, 0.42, 0.37) });
    cursorY -= LABEL_SIZE + 4;

    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: cursorY, size: VALUE_SIZE, font, color: rgb(0.1, 0.1, 0.1) });
      cursorY -= LINE_HEIGHT;
    }
    cursorY -= 6;
  }

  return doc.save();
}
