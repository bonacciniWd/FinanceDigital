/**
 * @module database.types
 * @description Tipos TypeScript para o schema Supabase do FintechFlow.
 *
 * Gerado manualmente a partir das interfaces em mockData.ts.
 * Para regenerar automaticamente:
 * `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/app/lib/database.types.ts`
 *
 * Tabelas: profiles, clientes, emprestimos, parcelas, mensagens,
 * templates_whatsapp, funcionarios, sessoes_atividade, indicacoes,
 * logs_atividade
 */

export type UserRole = 'admin' | 'gerencia' | 'cobranca' | 'comercial' | 'cliente';
export type ClienteStatus = 'em_dia' | 'a_vencer' | 'vencido';
export type Sexo = 'masculino' | 'feminino';
export type EmprestimoStatus = 'ativo' | 'quitado' | 'inadimplente';
export type ParcelaStatus = 'pendente' | 'paga' | 'vencida' | 'cancelada';
export type MensagemRemetente = 'cliente' | 'sistema';
export type MensagemTipo = 'texto' | 'arquivo' | 'boleto';
export type TemplateCategoria = 'cobranca' | 'boas_vindas' | 'lembrete' | 'negociacao';
export type FuncionarioStatus = 'online' | 'offline' | 'ausente';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          role?: UserRole;
          avatar_url?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          role?: UserRole;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };

      clientes: {
        Row: {
          id: string;
          nome: string;
          email: string;
          telefone: string;
          cpf: string | null;
          sexo: Sexo;
          data_nascimento: string | null;
          endereco: string | null;
          status: ClienteStatus;
          valor: number;
          vencimento: string;
          dias_atraso: number;
          ultimo_contato: string | null;
          limite_credito: number;
          credito_utilizado: number;
          score_interno: number;
          bonus_acumulado: number;
          grupo: string | null;
          indicado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          email: string;
          telefone: string;
          cpf?: string | null;
          sexo: Sexo;
          data_nascimento?: string | null;
          endereco?: string | null;
          status?: ClienteStatus;
          valor?: number;
          vencimento: string;
          dias_atraso?: number;
          ultimo_contato?: string | null;
          limite_credito?: number;
          credito_utilizado?: number;
          score_interno?: number;
          bonus_acumulado?: number;
          grupo?: string | null;
          indicado_por?: string | null;
        };
        Update: {
          nome?: string;
          email?: string;
          telefone?: string;
          cpf?: string | null;
          sexo?: Sexo;
          data_nascimento?: string | null;
          endereco?: string | null;
          status?: ClienteStatus;
          valor?: number;
          vencimento?: string;
          dias_atraso?: number;
          ultimo_contato?: string | null;
          limite_credito?: number;
          credito_utilizado?: number;
          score_interno?: number;
          bonus_acumulado?: number;
          grupo?: string | null;
          indicado_por?: string | null;
          updated_at?: string;
        };
      };

      emprestimos: {
        Row: {
          id: string;
          cliente_id: string;
          valor: number;
          parcelas: number;
          parcelas_pagas: number;
          valor_parcela: number;
          taxa_juros: number;
          data_contrato: string;
          proximo_vencimento: string;
          status: EmprestimoStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          valor: number;
          parcelas: number;
          parcelas_pagas?: number;
          valor_parcela: number;
          taxa_juros: number;
          data_contrato: string;
          proximo_vencimento: string;
          status?: EmprestimoStatus;
        };
        Update: {
          cliente_id?: string;
          valor?: number;
          parcelas?: number;
          parcelas_pagas?: number;
          valor_parcela?: number;
          taxa_juros?: number;
          data_contrato?: string;
          proximo_vencimento?: string;
          status?: EmprestimoStatus;
          updated_at?: string;
        };
      };

      parcelas: {
        Row: {
          id: string;
          emprestimo_id: string;
          cliente_id: string;
          numero: number;
          valor: number;
          valor_original: number;
          data_vencimento: string;
          data_pagamento: string | null;
          status: ParcelaStatus;
          juros: number;
          multa: number;
          desconto: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          emprestimo_id: string;
          cliente_id: string;
          numero: number;
          valor: number;
          valor_original: number;
          data_vencimento: string;
          data_pagamento?: string | null;
          status?: ParcelaStatus;
          juros?: number;
          multa?: number;
          desconto?: number;
        };
        Update: {
          emprestimo_id?: string;
          cliente_id?: string;
          numero?: number;
          valor?: number;
          valor_original?: number;
          data_vencimento?: string;
          data_pagamento?: string | null;
          status?: ParcelaStatus;
          juros?: number;
          multa?: number;
          desconto?: number;
          updated_at?: string;
        };
      };

      mensagens: {
        Row: {
          id: string;
          cliente_id: string;
          remetente: MensagemRemetente;
          conteudo: string;
          timestamp: string;
          lida: boolean;
          tipo: MensagemTipo;
          created_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          remetente: MensagemRemetente;
          conteudo: string;
          timestamp?: string;
          lida?: boolean;
          tipo?: MensagemTipo;
        };
        Update: {
          cliente_id?: string;
          remetente?: MensagemRemetente;
          conteudo?: string;
          timestamp?: string;
          lida?: boolean;
          tipo?: MensagemTipo;
        };
      };

      templates_whatsapp: {
        Row: {
          id: string;
          nome: string;
          categoria: TemplateCategoria;
          mensagem_masculino: string;
          mensagem_feminino: string;
          variaveis: string[];
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          categoria: TemplateCategoria;
          mensagem_masculino: string;
          mensagem_feminino: string;
          variaveis?: string[];
          ativo?: boolean;
        };
        Update: {
          nome?: string;
          categoria?: TemplateCategoria;
          mensagem_masculino?: string;
          mensagem_feminino?: string;
          variaveis?: string[];
          ativo?: boolean;
          updated_at?: string;
        };
      };

      funcionarios: {
        Row: {
          id: string;
          user_id: string;
          nome: string;
          email: string;
          role: UserRole;
          status: FuncionarioStatus;
          ultimo_login: string | null;
          ultima_atividade: string | null;
          horas_hoje: number;
          horas_semana: number;
          horas_mes: number;
          atividades_hoje: number;
          meta_diaria: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome: string;
          email: string;
          role?: UserRole;
          status?: FuncionarioStatus;
          ultimo_login?: string | null;
          ultima_atividade?: string | null;
          horas_hoje?: number;
          horas_semana?: number;
          horas_mes?: number;
          atividades_hoje?: number;
          meta_diaria?: number;
        };
        Update: {
          user_id?: string;
          nome?: string;
          email?: string;
          role?: UserRole;
          status?: FuncionarioStatus;
          ultimo_login?: string | null;
          ultima_atividade?: string | null;
          horas_hoje?: number;
          horas_semana?: number;
          horas_mes?: number;
          atividades_hoje?: number;
          meta_diaria?: number;
          updated_at?: string;
        };
      };

      sessoes_atividade: {
        Row: {
          id: string;
          funcionario_id: string;
          inicio: string;
          fim: string | null;
          duracao: number;
          acoes: number;
          paginas: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          funcionario_id: string;
          inicio: string;
          fim?: string | null;
          duracao?: number;
          acoes?: number;
          paginas?: string[];
        };
        Update: {
          funcionario_id?: string;
          inicio?: string;
          fim?: string | null;
          duracao?: number;
          acoes?: number;
          paginas?: string[];
        };
      };

      logs_atividade: {
        Row: {
          id: string;
          user_id: string;
          acao: string;
          detalhes: string | null;
          pagina: string | null;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          acao: string;
          detalhes?: string | null;
          pagina?: string | null;
          ip?: string | null;
        };
        Update: {
          user_id?: string;
          acao?: string;
          detalhes?: string | null;
          pagina?: string | null;
          ip?: string | null;
        };
      };
    };

    Views: Record<string, never>;

    Functions: {
      get_dashboard_stats: {
        Args: Record<string, never>;
        Returns: {
          total_clientes: number;
          clientes_em_dia: number;
          clientes_vencidos: number;
          clientes_a_vencer: number;
          total_carteira: number;
          total_inadimplencia: number;
          taxa_inadimplencia: number;
          total_emprestimos_ativos: number;
        };
      };
      get_financial_summary: {
        Args: { periodo_meses?: number };
        Returns: {
          mes: string;
          receita: number;
          inadimplencia: number;
        }[];
      };
    };

    Enums: {
      user_role: UserRole;
      cliente_status: ClienteStatus;
      sexo: Sexo;
      emprestimo_status: EmprestimoStatus;
      parcela_status: ParcelaStatus;
      mensagem_remetente: MensagemRemetente;
      mensagem_tipo: MensagemTipo;
      template_categoria: TemplateCategoria;
      funcionario_status: FuncionarioStatus;
    };
  };
}

// ── Tipos auxiliares para uso direto nas páginas ──────────────────

/** Linha da tabela profiles */
export type Profile = Database['public']['Tables']['profiles']['Row'];
/** Linha da tabela clientes */
export type Cliente = Database['public']['Tables']['clientes']['Row'];
/** Linha da tabela emprestimos */
export type Emprestimo = Database['public']['Tables']['emprestimos']['Row'];
/** Linha da tabela parcelas */
export type Parcela = Database['public']['Tables']['parcelas']['Row'];
/** Linha da tabela mensagens */
export type Mensagem = Database['public']['Tables']['mensagens']['Row'];
/** Linha da tabela templates_whatsapp */
export type TemplateWhatsApp = Database['public']['Tables']['templates_whatsapp']['Row'];
/** Linha da tabela funcionarios */
export type Funcionario = Database['public']['Tables']['funcionarios']['Row'];
/** Linha da tabela sessoes_atividade */
export type SessaoAtividade = Database['public']['Tables']['sessoes_atividade']['Row'];

// ── Tipos de insert/update para forms ────────────────────────────

export type ClienteInsert = Database['public']['Tables']['clientes']['Insert'];
export type ClienteUpdate = Database['public']['Tables']['clientes']['Update'];
export type EmprestimoInsert = Database['public']['Tables']['emprestimos']['Insert'];
export type EmprestimoUpdate = Database['public']['Tables']['emprestimos']['Update'];
export type ParcelaInsert = Database['public']['Tables']['parcelas']['Insert'];
export type ParcelaUpdate = Database['public']['Tables']['parcelas']['Update'];
export type MensagemInsert = Database['public']['Tables']['mensagens']['Insert'];
export type TemplateWhatsAppInsert = Database['public']['Tables']['templates_whatsapp']['Insert'];
export type TemplateWhatsAppUpdate = Database['public']['Tables']['templates_whatsapp']['Update'];

// ── Tipos com JOINs (views compostas) ────────────────────────────

/** Empréstimo com nome do cliente (usado em listagens) */
export type EmprestimoComCliente = Emprestimo & {
  clientes: { nome: string } | null;
};

/** Parcela com nome do cliente (usado em Gestão de Parcelas) */
export type ParcelaComCliente = Parcela & {
  clientes: { nome: string } | null;
};

/** Cliente com lista de indicados (usado em Rede de Indicações) */
export type ClienteComIndicados = Cliente & {
  indicados: { id: string; nome: string; status: ClienteStatus }[];
};
