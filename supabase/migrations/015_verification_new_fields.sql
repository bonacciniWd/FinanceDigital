-- Migration 015: Novos campos de verificação de identidade
-- Comprovante de endereço, vídeo da residência, contatos de referência, endereço

-- Adicionar novas colunas à tabela identity_verifications
ALTER TABLE identity_verifications
  ADD COLUMN IF NOT EXISTS proof_of_address_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS residence_video_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reference_contacts JSONB DEFAULT '[]'::jsonb;

-- Comentários para documentação
COMMENT ON COLUMN identity_verifications.proof_of_address_url IS 'URL do comprovante de endereço no storage';
COMMENT ON COLUMN identity_verifications.residence_video_url IS 'URL do vídeo da fachada da residência no storage';
COMMENT ON COLUMN identity_verifications.client_address IS 'Endereço informado pelo cliente';
COMMENT ON COLUMN identity_verifications.reference_contacts IS 'Array de contatos de referência [{name, phone, relationship}]';

-- Atualizar política anon de UPDATE para incluir novos campos
-- (a política existente permite anon atualizar colunas específicas)
DROP POLICY IF EXISTS verif_anon_update ON identity_verifications;
CREATE POLICY verif_anon_update ON identity_verifications
  FOR UPDATE TO anon
  USING (status IN ('pending', 'retry_needed'))
  WITH CHECK (status IN ('pending', 'retry_needed'));
