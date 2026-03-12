FROM atendai/evolution-api:v1.8.7

# Diretórios de dados serão montados como volumes no Fly.io
# /evolution/instances — sessões WhatsApp (QR codes, credenciais)
# /evolution/store     — store local da Baileys
VOLUME ["/evolution/instances", "/evolution/store"]

EXPOSE 8080
