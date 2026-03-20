-- Migration 018: Fix storage INSERT RLS conflict for upsert
-- Problema: migration 012 criou policy "identity_verif_upload" exigindo
-- auth.role()='authenticated', mas o cliente faz upload como anon.
-- O upsert:true do Supabase Storage faz DELETE+INSERT interno, e o INSERT
-- cai nessa policy restritiva. Solução: dropar a policy autenticada
-- (a policy anon da migration 014 já cobre INSERT para o bucket).

-- Dropar a policy autenticada que conflita com anon upload
DROP POLICY IF EXISTS "identity_verif_upload" ON storage.objects;

-- Recriar como permissiva para QUALQUER role (anon + authenticated)
CREATE POLICY "identity_verif_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'identity-verification');
