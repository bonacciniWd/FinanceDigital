#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# deploy.sh — Deploy da Evolution API no Fly.io
# URL estática final: https://finance-digital-evolution.fly.dev
#
# Uso:
#   chmod +x deploy.sh
#   ./deploy.sh
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_NAME="finance-digital-evolution"
REGION="gru"
VOLUME_NAME="evolution_data"
VOLUME_SIZE=1   # GB — upgrade com: fly volumes extend <id> --size 3

# Chave de API da Evolution (mesma usada localmente)
EVOLUTION_API_KEY="FinanceDigital_EvoKey_2025"

# ── Cores ────────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
NC="\033[0m"

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $*"; }
error()   { echo -e "${RED}[ERRO]${NC}  $*"; exit 1; }

# ── 1. Instalar flyctl ────────────────────────────────────────────────────────
if ! command -v flyctl &>/dev/null; then
  info "flyctl não encontrado. Instalando via Homebrew..."
  if command -v brew &>/dev/null; then
    brew install flyctl
  else
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
  fi
  success "flyctl instalado: $(flyctl version)"
else
  success "flyctl já instalado: $(flyctl version)"
fi

# ── 2. Login no Fly.io ────────────────────────────────────────────────────────
info "Verificando autenticação no Fly.io..."
if ! flyctl auth whoami &>/dev/null; then
  warn "Não autenticado. Abrindo browser para login..."
  flyctl auth login
fi
success "Autenticado como: $(flyctl auth whoami)"

# ── 3. Criar app (se ainda não existir) ───────────────────────────────────────
info "Verificando app '$APP_NAME'..."
if flyctl apps list | grep -q "^$APP_NAME"; then
  success "App '$APP_NAME' já existe."
else
  info "Criando app '$APP_NAME' na região $REGION..."
  flyctl apps create "$APP_NAME" --org personal
  success "App criado."
fi

# ── 4. Criar volume persistente (se ainda não existir) ────────────────────────
info "Verificando volume '$VOLUME_NAME'..."
if flyctl volumes list --app "$APP_NAME" 2>/dev/null | grep -q "$VOLUME_NAME"; then
  success "Volume '$VOLUME_NAME' já existe."
else
  info "Criando volume '$VOLUME_NAME' (${VOLUME_SIZE}GB) na região $REGION..."
  flyctl volumes create "$VOLUME_NAME" \
    --app "$APP_NAME" \
    --region "$REGION" \
    --size "$VOLUME_SIZE" \
    --yes
  success "Volume criado."
fi

# ── 5. Configurar secrets (variáveis sensíveis) ───────────────────────────────
info "Configurando secrets no Fly.io..."
flyctl secrets set \
  --app "$APP_NAME" \
  AUTHENTICATION_API_KEY="$EVOLUTION_API_KEY" \
  --detach   # --detach para não aguardar o redeploy aqui (fazemos abaixo)

success "Secrets configurados."

# ── 6. Deploy ─────────────────────────────────────────────────────────────────
info "Iniciando deploy da Evolution API..."
flyctl deploy \
  --app "$APP_NAME" \
  --region "$REGION" \
  --wait-timeout 300

success "Deploy concluído!"

# ── 7. Verificar saúde ────────────────────────────────────────────────────────
APP_URL="https://${APP_NAME}.fly.dev"
info "Verificando saúde da API em $APP_URL ..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL" || echo "000")

if [[ "$HTTP_STATUS" == "200" || "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "403" ]]; then
  success "Evolution API respondendo (HTTP $HTTP_STATUS)"
else
  warn "API retornou HTTP $HTTP_STATUS — pode ainda estar iniciando. Aguarde ~30s."
fi

# ── 8. Instruções pós-deploy ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Evolution API no ar com URL ESTÁTICA!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}URL:${NC}     $APP_URL"
echo -e "  ${CYAN}API Key:${NC} $EVOLUTION_API_KEY"
echo ""
echo -e "${YELLOW}Próximos passos — Supabase Edge Functions:${NC}"
echo ""
echo "  1. Adicionar secrets no Supabase (Dashboard → Edge Functions → Secrets):"
echo "     ou via CLI:"
echo ""
echo "     supabase secrets set \\"
echo "       EVOLUTION_API_URL=$APP_URL \\"
echo "       EVOLUTION_API_KEY=$EVOLUTION_API_KEY"
echo ""
echo "  2. Fazer redeploy das Edge Functions que usam a Evolution:"
echo ""
echo "     supabase functions deploy send-whatsapp"
echo "     supabase functions deploy manage-instance"
echo "     supabase functions deploy webhook-whatsapp --no-verify-jwt"
echo ""
echo "  3. Configurar webhook em cada instância criada (via WhatsApp page):"
echo "     Webhook URL: https://ctvihcpojodsntoelfck.supabase.co/functions/v1/webhook-whatsapp"
echo ""
echo -e "${YELLOW}Comandos úteis Fly.io:${NC}"
echo "  fly logs --app $APP_NAME          # logs em tempo real"
echo "  fly status --app $APP_NAME        # status da máquina"
echo "  fly ssh console --app $APP_NAME   # acesso ao container"
echo "  fly scale memory 1024 --app $APP_NAME  # aumentar RAM se necessário"
echo ""
