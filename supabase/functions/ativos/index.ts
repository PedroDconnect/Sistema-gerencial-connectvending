// Proxy seguro para a API de ativos do Protheus (WS_ATIVOS).
//
// O Protheus exige Basic Auth e não expõe CORS para chamadas de navegador —
// por isso essa credencial nunca pode viver no front-end. Esta function guarda
// PROTHEUS_ATIVOS_USER / PROTHEUS_ATIVOS_PASS como secrets do projeto Supabase,
// varre todas as páginas (a API pagina em blocos de 1000 via ?page=N e sinaliza
// "hasNext") e devolve ao app só o array já completo.
//
// Configurar antes do primeiro uso (ver instruções de deploy fornecidas separadamente):
//   supabase secrets set PROTHEUS_ATIVOS_USER=<login> PROTHEUS_ATIVOS_PASS=<senha>
//   supabase functions deploy ativos

const PROTHEUS_URL = "https://connectvending144155.protheus.cloudtotvs.com.br:1607/rest/WS_ATIVOS";
const MAX_PAGES = 50; // limite de segurança contra paginação infinita

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const user = Deno.env.get("PROTHEUS_ATIVOS_USER");
  const pass = Deno.env.get("PROTHEUS_ATIVOS_PASS");

  if (!user || !pass) {
    return jsonResponse(
      { error: "Credenciais do Protheus não configuradas (PROTHEUS_ATIVOS_USER / PROTHEUS_ATIVOS_PASS)." },
      500,
    );
  }

  const authHeader = `Basic ${btoa(`${user}:${pass}`)}`;

  try {
    const ativos = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const res = await fetch(`${PROTHEUS_URL}?page=${page}`, {
        headers: { Authorization: authHeader },
      });

      if (!res.ok) {
        throw new Error(`Protheus respondeu ${res.status} na página ${page}`);
      }

      const payload = await res.json();
      const batch = Array.isArray(payload?.ativos) ? payload.ativos : [];
      ativos.push(...batch);

      if (!payload?.hasNext || batch.length === 0) break;
      page += 1;
    }

    return jsonResponse({ ativos, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha ao consultar o Protheus." },
      502,
    );
  }
});
