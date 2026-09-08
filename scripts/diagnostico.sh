#!/usr/bin/env bash
# Diagnóstico do modo conector remoto: diz em qual etapa a corrente quebrou,
# indo da mais próxima (o servidor local) à mais distante (o túnel público).
#
#   npm run diagnostico
#
# Rode numa aba de terminal LIVRE — uma onde o prompt esteja disponível, e não
# naquelas onde o servidor ou o cloudflared estão rodando.

set -uo pipefail

PORTA="${PORT:-8080}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
falha() { printf '  \033[31m✗\033[0m %s\n' "$1"; }
info()  { printf '    %s\n' "$1"; }

echo
echo "Diagnóstico do pdpj-mcp-server"
echo "==============================="
echo

# 1. O processo do servidor está no ar? -------------------------------------
echo "1. Servidor"
if pgrep -f "dist/src/http.js" > /dev/null 2>&1; then
  ok "processo rodando (PID $(pgrep -f 'dist/src/http.js' | tr '\n' ' '))"
else
  falha "nenhum processo do servidor HTTP encontrado"
  info "Suba com:  cd $DIR && npm run start:http"
fi

# 2. Alguém escutando na porta? ---------------------------------------------
if command -v lsof > /dev/null 2>&1; then
  if lsof -nP -iTCP:"$PORTA" -sTCP:LISTEN > /dev/null 2>&1; then
    ok "porta $PORTA escutando"
  else
    falha "nada escutando na porta $PORTA"
  fi
fi

# 3. O token está configurado? ----------------------------------------------
echo
echo "2. Token"
TOKEN=""
if [ -f "$DIR/.env" ] && grep -q '^PDPJ_AUTH_TOKEN=' "$DIR/.env"; then
  TOKEN="$(grep '^PDPJ_AUTH_TOKEN=' "$DIR/.env" | head -1 | cut -d= -f2-)"
fi
if [ -n "$TOKEN" ]; then
  ok "definido no .env (começa com ${TOKEN:0:6}…, ${#TOKEN} caracteres)"
else
  falha "sem PDPJ_AUTH_TOKEN no .env"
  info "Crie com:  echo \"PDPJ_AUTH_TOKEN=\$(openssl rand -hex 32)\" >> $DIR/.env"
fi

# 4. O servidor responde localmente? ----------------------------------------
echo
echo "3. Resposta local"
LOCAL="$(curl -sS -m 5 "http://localhost:$PORTA/health" 2>&1)"
if printf '%s' "$LOCAL" | grep -q '"ok":true'; then
  ok "http://localhost:$PORTA/health respondeu"
  if printf '%s' "$LOCAL" | grep -q '"protegido":true'; then
    ok "o servidor está exigindo token"
  else
    falha "o servidor está SEM token: qualquer um com a URL o usa"
    info "Pare o servidor, ponha o token no .env e suba de novo."
  fi
else
  falha "sem resposta em http://localhost:$PORTA/health"
  info "${LOCAL:-(nenhuma saída)}"
fi

# 5. O túnel está rodando? ---------------------------------------------------
echo
echo "4. Túnel"
if pgrep -f "cloudflared" > /dev/null 2>&1; then
  ok "cloudflared rodando"
  info "A URL aparece na aba onde ele foi iniciado (linha .trycloudflare.com)."
else
  falha "cloudflared não está rodando"
  info "Abra outra aba e rode:  cloudflared tunnel --url http://localhost:$PORTA"
fi

# 6. Teste ponta a ponta, se a URL for informada ------------------------------
echo
echo "5. Túnel ponta a ponta"
URL="${1:-}"
if [ -z "$URL" ]; then
  info "Passe a URL para testar:  npm run diagnostico -- https://algo.trycloudflare.com"
else
  URL="${URL%/}"
  REMOTO="$(curl -sS -m 15 "$URL/health" 2>&1)"
  if printf '%s' "$REMOTO" | grep -q '"ok":true'; then
    ok "$URL/health respondeu"
    if [ -n "$TOKEN" ]; then
      CODIGO="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' \
        -X POST "$URL/mcp/$TOKEN" \
        -H 'Content-Type: application/json' \
        -H 'Accept: application/json, text/event-stream' \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' 2>&1)"
      if [ "$CODIGO" = "200" ]; then
        ok "o MCP respondeu com o token no caminho (HTTP 200)"
        echo
        echo "  Use esta URL no conector:"
        echo "    $URL/mcp/$TOKEN"
      else
        falha "o MCP devolveu HTTP $CODIGO em $URL/mcp/<token>"
      fi
    fi
  else
    falha "sem resposta em $URL/health"
    info "${REMOTO:-(nenhuma saída)}"
    info "Se o servidor local respondeu no passo 3, o problema é o túnel:"
    info "a URL muda a cada vez que o cloudflared é reiniciado."
  fi
fi

echo
