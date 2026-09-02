// Idêntico ao padrão de admin/shared/http.ts e operation/shared/http.ts —
// duplicado aqui porque cada Edge Function é empacotada só a partir da
// própria pasta (confirmado: nenhuma function deste projeto importa de
// fora do próprio diretório).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // PATCH e DELETE não são métodos CORS-safelisted — sem listá-los aqui o
  // preflight falha no navegador ("Failed to fetch") mesmo que este
  // módulo não use os dois hoje (só GET/POST); mais barato incluir agora
  // do que repetir o bug já corrigido em admin/shared/http.ts.
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export class ControlledError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ControlledError) {
    return jsonResponse({ error: error.message }, error.status);
  }
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  return jsonResponse({ error: message }, 500);
}
