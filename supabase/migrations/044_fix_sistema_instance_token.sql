-- Atualizar token da instância "Sistema" após recriação no Fly.io
UPDATE whatsapp_instancias
SET instance_token = '63FCB689-3A20-4A4D-9F85-1805AC94ED7C',
    evolution_url  = 'https://finance-digital-evolution.fly.dev',
    status         = 'desconectado',
    updated_at     = now()
WHERE instance_name = 'Sistema';

-- Se não existe, criar
INSERT INTO whatsapp_instancias (instance_name, instance_token, evolution_url, status, is_system)
SELECT 'Sistema', '63FCB689-3A20-4A4D-9F85-1805AC94ED7C', 'https://finance-digital-evolution.fly.dev', 'desconectado', true
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_instancias WHERE instance_name = 'Sistema');
