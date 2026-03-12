-- Fix whatsapp_msg_status enum: add missing values used by edge functions
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'enviada';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'recebida';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'lida';
ALTER TYPE whatsapp_msg_status ADD VALUE IF NOT EXISTS 'falha';

-- Fix direcao CHECK constraint: code uses 'entrada'/'saida' but constraint only allowed 'enviada'/'recebida'
ALTER TABLE whatsapp_mensagens_log DROP CONSTRAINT IF EXISTS whatsapp_mensagens_log_direcao_check;
ALTER TABLE whatsapp_mensagens_log ADD CONSTRAINT whatsapp_mensagens_log_direcao_check
  CHECK (direcao IN ('entrada', 'saida', 'enviada', 'recebida'));

-- Realtime is already enabled on these tables (done previously via Dashboard)
