-- ============================================================
-- Migration 085: Mídias / Links / Observações por empréstimo
-- ============================================================
-- Cria tabela compartilhada de mídias (imagens, vídeos, links,
-- observações) anexáveis a múltiplos empréstimos / clientes,
-- bucket de storage dedicado e habilita Realtime.
--
-- Estratégia: tabela única com array de empréstimo_ids para
-- evitar Egress de joins; Realtime push para invalidações
-- ao invés de refetch.
-- ============================================================

-- ── Bucket de storage ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'emprestimo-midias',
  'emprestimo-midias',
  true,
  104857600, -- 100 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (autenticados podem ler/escrever; somente
-- admin/gerencia/cobranca podem deletar). Espelham padrão usado
-- em buckets existentes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emprestimo_midias_select' AND tablename = 'objects') THEN
    CREATE POLICY emprestimo_midias_select ON storage.objects
      FOR SELECT USING (bucket_id = 'emprestimo-midias');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emprestimo_midias_insert' AND tablename = 'objects') THEN
    CREATE POLICY emprestimo_midias_insert ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'emprestimo-midias' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emprestimo_midias_update' AND tablename = 'objects') THEN
    CREATE POLICY emprestimo_midias_update ON storage.objects
      FOR UPDATE USING (bucket_id = 'emprestimo-midias' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emprestimo_midias_delete' AND tablename = 'objects') THEN
    CREATE POLICY emprestimo_midias_delete ON storage.objects
      FOR DELETE USING (
        bucket_id = 'emprestimo-midias'
        AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia','cobranca'))
      );
  END IF;
END $$;

-- ── Enum de tipo ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE emprestimo_midia_tipo AS ENUM ('imagem','video','documento','link','observacao');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabela: emprestimo_midias ───────────────────────────────
CREATE TABLE IF NOT EXISTS emprestimo_midias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo            emprestimo_midia_tipo NOT NULL,
  titulo          TEXT NOT NULL,
  descricao       TEXT,

  -- Para imagem/video/documento: path no bucket
  -- Para link: URL externa
  -- Para observacao: NULL (texto fica em descricao)
  storage_path    TEXT,
  url_externa     TEXT,
  mime_type       TEXT,
  tamanho_bytes   BIGINT,

  -- Vínculos (múltiplos empréstimos / clientes — array para evitar joins)
  emprestimo_ids  UUID[] NOT NULL DEFAULT '{}',
  cliente_ids     UUID[] NOT NULL DEFAULT '{}',

  tags            TEXT[] NOT NULL DEFAULT '{}',

  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_tipo       ON emprestimo_midias(tipo);
CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_created_by ON emprestimo_midias(created_by);
CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_created_at ON emprestimo_midias(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_emp_gin   ON emprestimo_midias USING GIN (emprestimo_ids);
CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_cli_gin   ON emprestimo_midias USING GIN (cliente_ids);
CREATE INDEX IF NOT EXISTS idx_emprestimo_midias_tags_gin  ON emprestimo_midias USING GIN (tags);

CREATE TRIGGER emprestimo_midias_updated_at
  BEFORE UPDATE ON emprestimo_midias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE emprestimo_midias ENABLE ROW LEVEL SECURITY;

CREATE POLICY emprestimo_midias_select ON emprestimo_midias
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY emprestimo_midias_insert ON emprestimo_midias
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia','cobranca','comercial'))
  );

CREATE POLICY emprestimo_midias_update ON emprestimo_midias
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

CREATE POLICY emprestimo_midias_delete ON emprestimo_midias
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','gerencia'))
  );

-- ── Realtime ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'emprestimo_midias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emprestimo_midias;
  END IF;
END $$;
