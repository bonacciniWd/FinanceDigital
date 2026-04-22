#!/usr/bin/env python3
"""
Migração PlataPlumo → FinanceDigital (Supabase)
Gera SQL a partir do CSV exportado do sistema antigo.

Uso: python3 scripts/migrate-plataplumo.py
Saída: supabase/migrations/042_migrate_plataplumo.sql
"""

import csv
import uuid
import sys
from datetime import datetime, timedelta
from collections import defaultdict

INPUT_CSV  = 'plataPlumo_loansSummaryView.csv'
OUTPUT_SQL = 'supabase/migrations/042_migrate_plataplumo.sql'

# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

def normalize_cpf(cpf):
    """Remove formatação, retorna 11 dígitos ou None."""
    if not cpf:
        return None
    digits = ''.join(c for c in cpf if c.isdigit())
    return digits if len(digits) == 11 else None

def normalize_phone(phone):
    """Extrai dígitos do telefone."""
    if not phone:
        return ''
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) >= 10 and not digits.startswith('55'):
        digits = '55' + digits
    return digits

def parse_date(s):
    if not s or not s.strip():
        return None
    s = s.strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def sql_esc(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''").strip() + "'"

def sql_date(d):
    return f"'{d.strftime('%Y-%m-%d')}'" if d else 'NULL'

def sql_ts(d):
    return f"'{d.strftime('%Y-%m-%d %H:%M:%S')}'" if d else 'now()'

def safe_float(v, default=0.0):
    try:
        return float(v) if v else default
    except (ValueError, TypeError):
        return default

def safe_int(v, default=0):
    try:
        return int(float(v)) if v else default
    except (ValueError, TypeError):
        return default

def map_tipo_juros(cap, pm):
    m = {'Semanal': 'semanal', 'Mensal': 'mensal', 'Quinzenal': 'quinzenal', 'Diária': 'diario'}
    if cap in m:
        return m[cap]
    days = safe_int(pm, 30)
    if days <= 7: return 'semanal'
    if days <= 15: return 'quinzenal'
    return 'mensal'

def map_emp_status(s):
    return {'Pago': 'quitado', 'Em dia': 'ativo', 'Atrasado': 'ativo',
            'Congelado': 'inadimplente'}.get(s, 'ativo')

def map_cli_status(loans):
    statuses = {l['status'].strip() for l in loans}
    if 'Atrasado' in statuses:
        return 'vencido'
    if 'Congelado' in statuses and 'Em dia' not in statuses:
        return 'vencido'
    return 'em_dia'

def calc_score(loans):
    """Score baseado no histórico: 500 base, +paid, -delays."""
    paid = sum(1 for l in loans if l['status'].strip() == 'Pago')
    total = len(loans)
    max_delay = 0
    for l in loans:
        max_delay = max(max_delay, safe_int(l.get('delayedDays', 0)))
    if total == 0:
        return 500
    ratio = paid / total
    score = int(500 + ratio * 300 - min(max_delay, 600) * 0.5)
    return max(0, min(1000, score))

# ═══════════════════════════════════════════════════════════════
# Parse CSV
# ═══════════════════════════════════════════════════════════════

print(f"Lendo {INPUT_CSV}...")
with open(INPUT_CSV, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"  Total de linhas: {len(rows)}")

# Agrupar por clientId
by_client = defaultdict(list)
for row in rows:
    cid = row.get('clientId', '').strip()
    if cid:
        by_client[cid].append(row)

print(f"  Clientes únicos: {len(by_client)}")

# Filtrar empréstimos válidos (excluir "Sem parcelas", linhas com status vazio/numérico)
VALID_STATUSES = {'Pago', 'Em dia', 'Atrasado', 'Congelado'}
valid_rows = [r for r in rows if r.get('status', '').strip() in VALID_STATUSES]
print(f"  Empréstimos válidos: {len(valid_rows)}")

# Pre-gerar UUIDs
client_uuid = {cid: str(uuid.uuid4()) for cid in by_client}
loan_uuid   = {}
for r in valid_rows:
    lid = r['loanId'].strip()
    if lid and lid not in loan_uuid:
        loan_uuid[lid] = str(uuid.uuid4())

# ═══════════════════════════════════════════════════════════════
# Gerar SQL
# ═══════════════════════════════════════════════════════════════

sql = []

sql.append(f"""-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Migration 042 — Migração PlataPlumo → FinanceDigital                  ║
-- ║  Fonte: {INPUT_CSV:<50s}       ║
-- ║  Gerado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S'):<48s}       ║
-- ║  Clientes: {len(by_client):<47d}       ║
-- ║  Empréstimos: {len(valid_rows):<44d}       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Guard: evita execução duplicada
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM clientes WHERE grupo = 'plataplumo_migrado' LIMIT 1) THEN
    RAISE EXCEPTION 'Migração 042 já foi executada. Abortando.';
  END IF;
END $$;

-- Desabilitar triggers temporariamente para performance
SET session_replication_role = 'replica';

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. CLIENTES  ({len(by_client)} registros)
-- ══════════════════════════════════════════════════════════════
""")

seen_cpfs = set()
skipped_clients = 0

for cid, loans in sorted(by_client.items()):
    # Usar dados do empréstimo mais recente
    latest = max(loans, key=lambda l: l.get('createdAt', '') or '')

    nome = latest['name'].strip()
    if not nome:
        skipped_clients += 1
        continue

    cpf = normalize_cpf(latest['cpf'])
    if cpf and cpf in seen_cpfs:
        cpf = None  # duplicado, anular pra evitar constraint
    if cpf:
        seen_cpfs.add(cpf)

    telefone = normalize_phone(latest.get('phone', ''))
    birth    = parse_date(latest.get('birthDate', ''))
    prof     = latest.get('profession', '').strip() or None
    cidade   = latest.get('city', '').strip() or None
    estado   = latest.get('state', '').strip() or None
    created  = parse_date(latest.get('createdAt', ''))

    # Status agregado
    cli_status = map_cli_status(loans)

    # Dias atraso (máximo entre empréstimos ativos)
    max_delay = 0
    for l in loans:
        if l['status'].strip() in ('Atrasado', 'Em dia'):
            max_delay = max(max_delay, safe_int(l.get('delayedDays', 0)))

    # Valor em aberto
    valor_aberto = 0
    for l in loans:
        if l['status'].strip() in ('Atrasado', 'Em dia', 'Congelado'):
            total = safe_float(l.get('totalToPay', 0))
            paid  = safe_float(l.get('paidValue', 0))
            valor_aberto += max(0, total - paid)

    # Próximo vencimento (do empréstimo ativo mais próximo)
    prox_venc = None
    for l in loans:
        if l['status'].strip() in ('Atrasado', 'Em dia'):
            first = parse_date(l.get('firstInstallmentDate', ''))
            pm = safe_int(l.get('paymentMethod', 30), 30)
            pp = safe_int(l.get('totalInstallmentsPaid', 0))
            if first:
                v = first + timedelta(days=pm * pp)
                if prox_venc is None or v < prox_venc:
                    prox_venc = v

    if prox_venc is None:
        prox_venc = datetime.now()

    score = calc_score(loans)

    # Email placeholder (campo NOT NULL)
    email_placeholder = f"migrado.{cid}@plataplumo.local"

    uid = client_uuid[cid]

    # Sanitizar estado para max 2 chars
    if estado and len(estado) > 2:
        estado = estado[:2]

    sql.append(f"""INSERT INTO clientes (id, nome, email, telefone, cpf, sexo, data_nascimento, profissao, cidade, estado, status, valor, vencimento, dias_atraso, score_interno, grupo, created_at)
VALUES (
  '{uid}', {sql_esc(nome)}, {sql_esc(email_placeholder)}, {sql_esc(telefone or 'sem-telefone')},
  {sql_esc(cpf)}, 'masculino', {sql_date(birth)},
  {sql_esc(prof)}, {sql_esc(cidade)}, {sql_esc(estado)},
  '{cli_status}', {round(valor_aberto, 2)}, {sql_date(prox_venc)}, {max_delay}, {score},
  'plataplumo_migrado', {sql_ts(created)}
) ON CONFLICT (cpf) DO UPDATE SET
  nome = EXCLUDED.nome,
  telefone = COALESCE(NULLIF(EXCLUDED.telefone, 'sem-telefone'), clientes.telefone),
  data_nascimento = COALESCE(EXCLUDED.data_nascimento, clientes.data_nascimento),
  profissao = COALESCE(EXCLUDED.profissao, clientes.profissao),
  cidade = COALESCE(EXCLUDED.cidade, clientes.cidade),
  estado = COALESCE(EXCLUDED.estado, clientes.estado),
  grupo = 'plataplumo_migrado';
""")

print(f"  Clientes gerados: {len(by_client) - skipped_clients}")
print(f"  Clientes ignorados (sem nome): {skipped_clients}")

# ══════════════════════════════════════════════════════════════
# 2. EMPRÉSTIMOS
# ══════════════════════════════════════════════════════════════

sql.append(f"""
-- ══════════════════════════════════════════════════════════════
-- 2. EMPRÉSTIMOS  ({len(valid_rows)} registros)
-- ══════════════════════════════════════════════════════════════
""")

loan_details = {}  # loan_uuid -> row data (for parcelas)
emp_count = 0

for row in valid_rows:
    lid = row['loanId'].strip()
    cid = row['clientId'].strip()

    if not lid or not cid or cid not in client_uuid:
        continue

    uid = loan_uuid[lid]
    cli_uid = client_uuid[cid]

    valor       = safe_float(row.get('loanValue', 0))
    parcelas    = safe_int(row.get('totalInstallments', 0))
    parc_pagas  = safe_int(row.get('totalInstallmentsPaid', 0))
    val_parcela = safe_float(row.get('averageInstallmentValue', 0))

    tipo = map_tipo_juros(row.get('capitalization', '').strip(), row.get('paymentMethod', '30'))

    # Taxa de juros por período
    if valor > 1 and parcelas > 0:
        total_pay = safe_float(row.get('totalToPay', 0))
        taxa = ((total_pay / valor) - 1) / parcelas * 100 if valor > 0 else 0
        taxa = max(0, min(99.99, taxa))
    else:
        taxa = 0

    data_contrato = parse_date(row.get('startDate', ''))
    status_str    = row['status'].strip()
    emp_status    = map_emp_status(status_str)
    created       = parse_date(row.get('createdAt', ''))

    # Próximo vencimento
    if emp_status == 'quitado':
        pv = parse_date(row.get('lastInstallmentDate', '')) or data_contrato
    else:
        first = parse_date(row.get('firstInstallmentDate', ''))
        pm = safe_int(row.get('paymentMethod', 30), 30)
        if first and parc_pagas < parcelas:
            pv = first + timedelta(days=pm * parc_pagas)
        else:
            pv = first or data_contrato

    if parcelas <= 0:
        continue

    loan_details[uid] = row

    sql.append(f"""INSERT INTO emprestimos (id, cliente_id, valor, parcelas, parcelas_pagas, valor_parcela, taxa_juros, tipo_juros, data_contrato, proximo_vencimento, status, desembolsado, desembolsado_em, created_at)
VALUES ('{uid}', '{cli_uid}', {round(valor, 2)}, {parcelas}, {parc_pagas}, {round(val_parcela, 2)}, {round(taxa, 2)}, '{tipo}', {sql_date(data_contrato)}, {sql_date(pv)}, '{emp_status}', true, {sql_ts(data_contrato)}, {sql_ts(created)});
""")
    emp_count += 1

print(f"  Empréstimos gerados: {emp_count}")

# ══════════════════════════════════════════════════════════════
# 3. PARCELAS (reconstruídas a partir do resumo)
# ══════════════════════════════════════════════════════════════

sql.append(f"""
-- ══════════════════════════════════════════════════════════════
-- 3. PARCELAS  (reconstruídas a partir do resumo)
-- ══════════════════════════════════════════════════════════════
""")

parcela_count = 0

for emp_uid, row in loan_details.items():
    cid = row['clientId'].strip()
    cli_uid = client_uuid[cid]

    n_total   = safe_int(row.get('totalInstallments', 0))
    n_pagas   = safe_int(row.get('totalInstallmentsPaid', 0))
    n_delayed = safe_int(row.get('delayedInstallments', 0))

    val_parcela = safe_float(row.get('averageInstallmentValue', 0))
    paid_total  = safe_float(row.get('paidValue', 0))
    discount    = safe_float(row.get('totalDiscount', 0))
    daily_fine  = safe_float(row.get('dailyFine', 0))

    pm = safe_int(row.get('paymentMethod', 30), 30)

    first_date = parse_date(row.get('firstInstallmentDate', ''))
    if not first_date:
        start = parse_date(row.get('startDate', ''))
        first_date = (start + timedelta(days=pm)) if start else datetime.now()

    # Valor pago por parcela (distribuir uniformemente)
    paid_per = paid_total / n_pagas if n_pagas > 0 else 0

    if n_total <= 0:
        continue

    batch = []
    for i in range(n_total):
        p_uid = str(uuid.uuid4())
        numero = i + 1
        venc = first_date + timedelta(days=pm * i)

        if i < n_pagas:
            st = 'paga'
            val = round(paid_per, 2)
            dt_pag = sql_date(venc)  # data aproximada
        elif i < n_pagas + n_delayed:
            st = 'vencida'
            val = round(val_parcela, 2)
            dt_pag = 'NULL'
        else:
            st = 'pendente'
            val = round(val_parcela, 2)
            dt_pag = 'NULL'

        multa_val = round(daily_fine * safe_int(row.get('delayedDays', 0)) / max(n_delayed, 1), 2) if st == 'vencida' and n_delayed > 0 else 0
        desc_val  = round(discount / n_pagas, 2) if st == 'paga' and n_pagas > 0 else 0

        batch.append(f"('{p_uid}', '{emp_uid}', '{cli_uid}', {numero}, {val}, {round(val_parcela, 2)}, {sql_date(venc)}, {dt_pag}, '{st}', 0, {multa_val}, {desc_val})")

    # Batch insert parcelas para este empréstimo
    if batch:
        # Inserir em blocos de 100
        for chunk_start in range(0, len(batch), 100):
            chunk = batch[chunk_start:chunk_start + 100]
            sql.append(f"INSERT INTO parcelas (id, emprestimo_id, cliente_id, numero, valor, valor_original, data_vencimento, data_pagamento, status, juros, multa, desconto) VALUES")
            sql.append(',\n'.join(chunk) + ';\n')

    parcela_count += len(batch)

print(f"  Parcelas geradas: {parcela_count}")

# ══════════════════════════════════════════════════════════════
# 4. Atualizar Kanban de cobrança para clientes atrasados
# ══════════════════════════════════════════════════════════════

sql.append("""
-- ══════════════════════════════════════════════════════════════
-- 4. Atualizar clientes atrasados no Kanban de cobrança
-- ══════════════════════════════════════════════════════════════

INSERT INTO kanban_cobranca (cliente_id, etapa, created_at)
SELECT c.id, 'vencido'::kanban_cobranca_etapa, now()
FROM clientes c
WHERE c.grupo = 'plataplumo_migrado'
  AND c.status = 'vencido'
  AND NOT EXISTS (SELECT 1 FROM kanban_cobranca k WHERE k.cliente_id = c.id)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- 5. Estatísticas finais
-- ══════════════════════════════════════════════════════════════

DO $$ 
DECLARE
  v_clientes  INTEGER;
  v_emprest   INTEGER;
  v_parcelas  INTEGER;
BEGIN
  SELECT count(*) INTO v_clientes FROM clientes WHERE grupo = 'plataplumo_migrado';
  SELECT count(*) INTO v_emprest  FROM emprestimos e
    JOIN clientes c ON c.id = e.cliente_id WHERE c.grupo = 'plataplumo_migrado';
  SELECT count(*) INTO v_parcelas FROM parcelas p
    JOIN clientes c ON c.id = p.cliente_id WHERE c.grupo = 'plataplumo_migrado';
  
  RAISE NOTICE '════════════════════════════════════════════';
  RAISE NOTICE '  Migração PlataPlumo concluída!';
  RAISE NOTICE '  Clientes:    %', v_clientes;
  RAISE NOTICE '  Empréstimos: %', v_emprest;
  RAISE NOTICE '  Parcelas:    %', v_parcelas;
  RAISE NOTICE '════════════════════════════════════════════';
END $$;
""")

# Finalizar
sql.append("""
COMMIT;

-- Restaurar triggers
SET session_replication_role = 'origin';
""")

# ═══════════════════════════════════════════════════════════════
# Gravar arquivo SQL
# ═══════════════════════════════════════════════════════════════

output = '\n'.join(sql)
with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
    f.write(output)

size_mb = len(output.encode('utf-8')) / 1024 / 1024
print(f"\n✅ SQL gerado: {OUTPUT_SQL}")
print(f"   Tamanho: {size_mb:.1f} MB")
print(f"\nPróximo passo:")
print(f"  supabase db push")
print(f"  # ou: psql < {OUTPUT_SQL}")
