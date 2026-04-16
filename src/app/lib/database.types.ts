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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'admin' | 'gerencia' | 'cobranca' | 'comercial' | 'cliente';
export type ClienteStatus = 'em_dia' | 'a_vencer' | 'vencido';
export type Sexo = 'masculino' | 'feminino';
export type EmprestimoStatus = 'ativo' | 'quitado' | 'inadimplente';
export type ParcelaStatus = 'pendente' | 'paga' | 'vencida' | 'cancelada';
export type MensagemRemetente = 'cliente' | 'sistema';
export type MensagemTipo = 'texto' | 'arquivo' | 'boleto';
export type TemplateCategoria = 'cobranca' | 'boas_vindas' | 'lembrete' | 'negociacao';
export type FuncionarioStatus = 'online' | 'offline' | 'ausente';
export type AnaliseCreditoStatus = 'pendente' | 'em_analise' | 'aprovado' | 'recusado';
export type TipoJuros = 'mensal' | 'semanal' | 'diario';
export type RedeStatus = 'ativo' | 'bloqueado' | 'inativo';
export type BloqueioMotivo = 'inadimplencia' | 'fraude' | 'manual' | 'auto_bloqueio';
export type TicketStatus = 'aberto' | 'em_atendimento' | 'aguardando_cliente' | 'resolvido' | 'cancelado';
export type TicketCanal = 'whatsapp' | 'chat' | 'telefone' | 'email' | 'presencial';
export type TicketPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';
export type KanbanCobrancaEtapa = 'a_vencer' | 'vencido' | 'contatado' | 'negociacao' | 'acordo' | 'pago' | 'perdido';
export type WhatsappInstanceStatus = 'conectado' | 'desconectado' | 'qr_pendente';
export type FluxoStatus = 'ativo' | 'pausado' | 'rascunho';
export type FluxoEtapaTipo = 'mensagem' | 'condicao' | 'acao' | 'espera' | 'finalizar';
export type WhatsappMsgStatus = 'pendente' | 'enviado' | 'entregue' | 'lido' | 'erro';

// ── Comissões ──────────────────────────────────────────────
export type ComissaoTipo = 'venda' | 'cobranca' | 'gerencia';
export type ComissaoStatus = 'pendente' | 'aprovado' | 'pago';

// ── Woovi (Gateway de Pagamentos) ──────────────────────────
export type WooviChargeStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'ERROR';
export type WooviTransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REFUNDED';
export type WooviTransactionType = 'CHARGE' | 'PAYMENT' | 'SPLIT' | 'WITHDRAWAL';

// ── Verificação de Identidade ──────────────────────────────
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'retry_needed';

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

      chat_interno: {
        Row: {
          id: string;
          de_user_id: string;
          para_user_id: string;
          conteudo: string;
          lida: boolean;
          tipo: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          de_user_id: string;
          para_user_id: string;
          conteudo: string;
          lida?: boolean;
          tipo?: string;
          metadata?: Record<string, unknown>;
        };
        Update: {
          lida?: boolean;
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
          profissao: string | null;
          data_nascimento: string | null;
          endereco: string | null;
          rua: string | null;
          numero: string | null;
          bairro: string | null;
          estado: string | null;
          cidade: string | null;
          cep: string | null;
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
          pix_key: string | null;
          pix_key_type: string | null;
          documento_frente_url: string | null;
          documento_verso_url: string | null;
          comprovante_endereco_url: string | null;
          contatos_referencia: unknown;
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
          profissao?: string | null;
          data_nascimento?: string | null;
          endereco?: string | null;
          rua?: string | null;
          numero?: string | null;
          bairro?: string | null;
          estado?: string | null;
          cidade?: string | null;
          cep?: string | null;
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
          pix_key?: string | null;
          pix_key_type?: string | null;
          documento_frente_url?: string | null;
          documento_verso_url?: string | null;
          comprovante_endereco_url?: string | null;
          contatos_referencia?: unknown;
        };
        Update: {
          nome?: string;
          email?: string;
          telefone?: string;
          cpf?: string | null;
          sexo?: Sexo;
          profissao?: string | null;
          data_nascimento?: string | null;
          endereco?: string | null;
          rua?: string | null;
          numero?: string | null;
          bairro?: string | null;
          estado?: string | null;
          cidade?: string | null;
          cep?: string | null;
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
          pix_key?: string | null;
          pix_key_type?: string | null;
          documento_frente_url?: string | null;
          documento_verso_url?: string | null;
          comprovante_endereco_url?: string | null;
          contatos_referencia?: unknown;
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
          tipo_juros: TipoJuros;
          data_contrato: string;
          proximo_vencimento: string;
          status: EmprestimoStatus;
          vendedor_id: string | null;
          cobrador_id: string | null;
          aprovado_por: string | null;
          aprovado_em: string | null;
          analise_id: string | null;
          gateway: string | null;
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
          tipo_juros?: TipoJuros;
          data_contrato: string;
          proximo_vencimento: string;
          status?: EmprestimoStatus;
          vendedor_id?: string | null;
          cobrador_id?: string | null;
          aprovado_por?: string | null;
          aprovado_em?: string | null;
          analise_id?: string | null;
          gateway?: string | null;
        };
        Update: {
          cliente_id?: string;
          valor?: number;
          parcelas?: number;
          parcelas_pagas?: number;
          valor_parcela?: number;
          taxa_juros?: number;
          tipo_juros?: TipoJuros;
          data_contrato?: string;
          proximo_vencimento?: string;
          status?: EmprestimoStatus;
          vendedor_id?: string | null;
          cobrador_id?: string | null;
          aprovado_por?: string | null;
          aprovado_em?: string | null;
          analise_id?: string | null;
          gateway?: string | null;
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
          observacao: string | null;
          conta_bancaria: string | null;
          comprovante_url: string | null;
          pagamento_tipo: 'pix' | 'manual' | 'automatico' | null;
          confirmado_por: string | null;
          confirmado_em: string | null;
          woovi_charge_id: string | null;
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
          observacao?: string | null;
          conta_bancaria?: string | null;
          comprovante_url?: string | null;
          pagamento_tipo?: 'pix' | 'manual' | 'automatico' | null;
          confirmado_por?: string | null;
          confirmado_em?: string | null;
          woovi_charge_id?: string | null;
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
          observacao?: string | null;
          conta_bancaria?: string | null;
          comprovante_url?: string | null;
          pagamento_tipo?: 'pix' | 'manual' | 'automatico' | null;
          confirmado_por?: string | null;
          confirmado_em?: string | null;
          woovi_charge_id?: string | null;
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
          tipo_notificacao: string | null;
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
          tipo_notificacao?: string | null;
        };
        Update: {
          nome?: string;
          categoria?: TemplateCategoria;
          mensagem_masculino?: string;
          mensagem_feminino?: string;
          variaveis?: string[];
          ativo?: boolean;
          tipo_notificacao?: string | null;
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

      rede_indicacoes: {
        Row: {
          id: string;
          cliente_id: string;
          indicado_por: string | null;
          nivel: number;
          rede_id: string;
          status: RedeStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          indicado_por?: string | null;
          nivel?: number;
          rede_id: string;
          status?: RedeStatus;
        };
        Update: {
          cliente_id?: string;
          indicado_por?: string | null;
          nivel?: number;
          rede_id?: string;
          status?: RedeStatus;
          updated_at?: string;
        };
      };

      bloqueios_rede: {
        Row: {
          id: string;
          rede_id: string;
          causado_por: string | null;
          motivo: BloqueioMotivo;
          descricao: string | null;
          bloqueado_em: string;
          desbloqueado_em: string | null;
          ativo: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          rede_id: string;
          causado_por?: string | null;
          motivo: BloqueioMotivo;
          descricao?: string | null;
          bloqueado_em?: string;
          desbloqueado_em?: string | null;
          ativo?: boolean;
        };
        Update: {
          rede_id?: string;
          causado_por?: string | null;
          motivo?: BloqueioMotivo;
          descricao?: string | null;
          bloqueado_em?: string;
          desbloqueado_em?: string | null;
          ativo?: boolean;
        };
      };

      tickets_atendimento: {
        Row: {
          id: string;
          cliente_id: string;
          atendente_id: string | null;
          assunto: string;
          descricao: string | null;
          status: TicketStatus;
          canal: TicketCanal;
          prioridade: TicketPrioridade;
          created_at: string;
          updated_at: string;
          resolvido_em: string | null;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          atendente_id?: string | null;
          assunto: string;
          descricao?: string | null;
          status?: TicketStatus;
          canal?: TicketCanal;
          prioridade?: TicketPrioridade;
          resolvido_em?: string | null;
        };
        Update: {
          cliente_id?: string;
          atendente_id?: string | null;
          assunto?: string;
          descricao?: string | null;
          status?: TicketStatus;
          canal?: TicketCanal;
          prioridade?: TicketPrioridade;
          resolvido_em?: string | null;
          updated_at?: string;
        };
      };

      kanban_cobranca: {
        Row: {
          id: string;
          cliente_id: string;
          parcela_id: string | null;
          responsavel_id: string | null;
          etapa: KanbanCobrancaEtapa;
          valor_divida: number;
          dias_atraso: number;
          tentativas_contato: number;
          ultimo_contato: string | null;
          observacao: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          parcela_id?: string | null;
          responsavel_id?: string | null;
          etapa?: KanbanCobrancaEtapa;
          valor_divida?: number;
          dias_atraso?: number;
          tentativas_contato?: number;
          ultimo_contato?: string | null;
          observacao?: string | null;
        };
        Update: {
          cliente_id?: string;
          parcela_id?: string | null;
          responsavel_id?: string | null;
          etapa?: KanbanCobrancaEtapa;
          valor_divida?: number;
          dias_atraso?: number;
          tentativas_contato?: number;
          ultimo_contato?: string | null;
          observacao?: string | null;
          updated_at?: string;
        };
      };

      analises_credito: {
        Row: {
          id: string;
          cliente_id: string | null;
          cliente_nome: string;
          cpf: string;
          valor_solicitado: number;
          renda_mensal: number;
          score_serasa: number;
          score_interno: number;
          status: AnaliseCreditoStatus;
          data_solicitacao: string;
          motivo: string | null;
          analista_id: string | null;
          verification_required: boolean;
          verification_id: string | null;
          numero_parcelas: number | null;
          periodicidade: string | null;
          dia_pagamento: number | null;
          intervalo_dias: number | null;
          dia_util: boolean;
          datas_personalizadas: string | null;
          data_resultado: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id?: string | null;
          cliente_nome: string;
          cpf: string;
          valor_solicitado: number;
          renda_mensal: number;
          score_serasa: number;
          score_interno?: number;
          status?: AnaliseCreditoStatus;
          data_solicitacao?: string;
          motivo?: string | null;
          analista_id?: string | null;
          verification_required?: boolean;
          verification_id?: string | null;
          numero_parcelas?: number | null;
          periodicidade?: string | null;
          dia_pagamento?: number | null;
          intervalo_dias?: number | null;
          dia_util?: boolean;
          datas_personalizadas?: string | null;
          data_resultado?: string | null;
        };
        Update: {
          cliente_id?: string | null;
          cliente_nome?: string;
          cpf?: string;
          valor_solicitado?: number;
          renda_mensal?: number;
          score_serasa?: number;
          score_interno?: number;
          status?: AnaliseCreditoStatus;
          data_solicitacao?: string;
          motivo?: string | null;
          analista_id?: string | null;
          verification_required?: boolean;
          verification_id?: string | null;
          numero_parcelas?: number | null;
          periodicidade?: string | null;
          dia_pagamento?: number | null;
          intervalo_dias?: number | null;
          dia_util?: boolean;
          datas_personalizadas?: string | null;
          data_resultado?: string | null;
          updated_at?: string;
        };
      };

      whatsapp_instancias: {
        Row: {
          id: string;
          departamento: string;
          instance_name: string;
          instance_token: string | null;
          phone_number: string | null;
          status: WhatsappInstanceStatus;
          evolution_url: string | null;
          qr_code: string | null;
          webhook_url: string | null;
          is_system: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          departamento?: string;
          instance_name: string;
          instance_token?: string | null;
          phone_number?: string | null;
          status?: WhatsappInstanceStatus;
          evolution_url?: string | null;
          qr_code?: string | null;
          webhook_url?: string | null;
          is_system?: boolean;
          created_by?: string | null;
        };
        Update: {
          departamento?: string;
          instance_name?: string;
          instance_token?: string | null;
          phone_number?: string | null;
          status?: WhatsappInstanceStatus;
          evolution_url?: string | null;
          qr_code?: string | null;
          webhook_url?: string | null;
          is_system?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      fluxos_chatbot: {
        Row: {
          id: string;
          nome: string;
          descricao: string | null;
          departamento: string;
          status: FluxoStatus;
          gatilho: string;
          palavra_chave: string | null;
          cron_expression: string | null;
          evento_trigger: string | null;
          template_id: string | null;
          disparos: number;
          respostas: number;
          conversoes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          descricao?: string | null;
          departamento?: string;
          status?: FluxoStatus;
          gatilho?: string;
          palavra_chave?: string | null;
          cron_expression?: string | null;
          evento_trigger?: string | null;
          template_id?: string | null;
          disparos?: number;
          respostas?: number;
          conversoes?: number;
        };
        Update: {
          nome?: string;
          descricao?: string | null;
          departamento?: string;
          status?: FluxoStatus;
          gatilho?: string;
          palavra_chave?: string | null;
          cron_expression?: string | null;
          evento_trigger?: string | null;
          template_id?: string | null;
          disparos?: number;
          respostas?: number;
          conversoes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };

      fluxos_chatbot_etapas: {
        Row: {
          id: string;
          fluxo_id: string;
          ordem: number;
          tipo: FluxoEtapaTipo;
          conteudo: string;
          config: Json;
          proximo_sim: string | null;
          proximo_nao: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          fluxo_id: string;
          ordem?: number;
          tipo?: FluxoEtapaTipo;
          conteudo: string;
          config?: Json;
          proximo_sim?: string | null;
          proximo_nao?: string | null;
        };
        Update: {
          fluxo_id?: string;
          ordem?: number;
          tipo?: FluxoEtapaTipo;
          conteudo?: string;
          config?: Json;
          proximo_sim?: string | null;
          proximo_nao?: string | null;
        };
        Relationships: [];
      };

      whatsapp_mensagens_log: {
        Row: {
          id: string;
          instancia_id: string | null;
          cliente_id: string | null;
          fluxo_id: string | null;
          direcao: string;
          telefone: string;
          conteudo: string | null;
          tipo: string;
          status: WhatsappMsgStatus;
          message_id_wpp: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          instancia_id?: string | null;
          cliente_id?: string | null;
          fluxo_id?: string | null;
          direcao?: string;
          telefone: string;
          conteudo?: string | null;
          tipo?: string;
          status?: WhatsappMsgStatus;
          message_id_wpp?: string | null;
          metadata?: Json;
        };
        Update: {
          instancia_id?: string | null;
          cliente_id?: string | null;
          fluxo_id?: string | null;
          direcao?: string;
          telefone?: string;
          conteudo?: string | null;
          tipo?: string;
          status?: WhatsappMsgStatus;
          message_id_wpp?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };

      // ── Woovi Tables ─────────────────────────────────────

      woovi_charges: {
        Row: {
          id: string;
          parcela_id: string | null;
          emprestimo_id: string | null;
          cliente_id: string | null;
          woovi_charge_id: string;
          woovi_txid: string | null;
          valor: number;
          status: WooviChargeStatus;
          br_code: string | null;
          qr_code_image: string | null;
          payment_link: string | null;
          expiration_date: string | null;
          split_indicador_id: string | null;
          split_valor: number | null;
          paid_at: string | null;
          criado_por: string | null;
          gateway: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parcela_id?: string | null;
          emprestimo_id?: string | null;
          cliente_id?: string | null;
          woovi_charge_id: string;
          woovi_txid?: string | null;
          valor: number;
          status?: WooviChargeStatus;
          br_code?: string | null;
          qr_code_image?: string | null;
          payment_link?: string | null;
          expiration_date?: string | null;
          split_indicador_id?: string | null;
          split_valor?: number | null;
          paid_at?: string | null;
          criado_por?: string | null;
          gateway?: string | null;
        };
        Update: {
          parcela_id?: string | null;
          emprestimo_id?: string | null;
          cliente_id?: string | null;
          woovi_charge_id?: string;
          woovi_txid?: string | null;
          valor?: number;
          status?: WooviChargeStatus;
          br_code?: string | null;
          qr_code_image?: string | null;
          payment_link?: string | null;
          expiration_date?: string | null;
          split_indicador_id?: string | null;
          split_valor?: number | null;
          paid_at?: string | null;
          criado_por?: string | null;
          gateway?: string | null;
          updated_at?: string;
        };
      };

      woovi_transactions: {
        Row: {
          id: string;
          emprestimo_id: string | null;
          cliente_id: string | null;
          charge_id: string | null;
          woovi_transaction_id: string | null;
          tipo: WooviTransactionType;
          valor: number;
          status: WooviTransactionStatus;
          pix_key: string | null;
          pix_key_type: string | null;
          destinatario_nome: string | null;
          end_to_end_id: string | null;
          descricao: string | null;
          metadata: Json;
          autorizado_por: string | null;
          autorizado_em: string | null;
          gateway: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          emprestimo_id?: string | null;
          cliente_id?: string | null;
          charge_id?: string | null;
          woovi_transaction_id?: string | null;
          tipo: WooviTransactionType;
          valor: number;
          status?: WooviTransactionStatus;
          pix_key?: string | null;
          pix_key_type?: string | null;
          destinatario_nome?: string | null;
          end_to_end_id?: string | null;
          descricao?: string | null;
          metadata?: Json;
          autorizado_por?: string | null;
          autorizado_em?: string | null;
          gateway?: string | null;
          confirmed_at?: string | null;
        };
        Update: {
          emprestimo_id?: string | null;
          cliente_id?: string | null;
          charge_id?: string | null;
          woovi_transaction_id?: string | null;
          tipo?: WooviTransactionType;
          valor?: number;
          status?: WooviTransactionStatus;
          pix_key?: string | null;
          pix_key_type?: string | null;
          destinatario_nome?: string | null;
          end_to_end_id?: string | null;
          descricao?: string | null;
          metadata?: Json;
          autorizado_por?: string | null;
          autorizado_em?: string | null;
          gateway?: string | null;
          confirmed_at?: string | null;
          updated_at?: string;
        };
      };

      woovi_subaccounts: {
        Row: {
          id: string;
          cliente_id: string;
          user_id: string | null;
          woovi_account_id: string;
          woovi_pix_key: string | null;
          nome: string;
          documento: string | null;
          banco: string | null;
          agencia: string | null;
          conta: string | null;
          tipo_conta: string | null;
          saldo: number;
          total_recebido: number;
          total_sacado: number;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          user_id?: string | null;
          woovi_account_id: string;
          woovi_pix_key?: string | null;
          nome: string;
          documento?: string | null;
          banco?: string | null;
          agencia?: string | null;
          conta?: string | null;
          tipo_conta?: string | null;
          saldo?: number;
          total_recebido?: number;
          total_sacado?: number;
          ativo?: boolean;
        };
        Update: {
          cliente_id?: string;
          user_id?: string | null;
          woovi_account_id?: string;
          woovi_pix_key?: string | null;
          nome?: string;
          documento?: string | null;
          banco?: string | null;
          agencia?: string | null;
          conta?: string | null;
          tipo_conta?: string | null;
          saldo?: number;
          total_recebido?: number;
          total_sacado?: number;
          ativo?: boolean;
          updated_at?: string;
        };
      };

      woovi_webhooks_log: {
        Row: {
          id: string;
          event_type: string;
          payload: Json;
          processed: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          payload?: Json;
          processed?: boolean;
          error_message?: string | null;
        };
        Update: {
          event_type?: string;
          payload?: Json;
          processed?: boolean;
          error_message?: string | null;
        };
      };

      identity_verifications: {
        Row: {
          id: string;
          analise_id: string;
          user_id: string | null;
          video_url: string | null;
          document_front_url: string | null;
          document_back_url: string | null;
          profissao_informada: string | null;
          verification_phrase: string;
          status: 'pending' | 'approved' | 'rejected' | 'retry_needed';
          analyzed_by: string | null;
          analyzed_at: string | null;
          rejection_reason: string | null;
          requires_retry: boolean;
          retry_count: number;
          retry_phrase: string | null;
          magic_link_sent_at: string | null;
          magic_link_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          analise_id: string;
          user_id?: string | null;
          video_url?: string | null;
          document_front_url?: string | null;
          document_back_url?: string | null;
          profissao_informada?: string | null;
          verification_phrase: string;
          status?: 'pending' | 'approved' | 'rejected' | 'retry_needed';
          analyzed_by?: string | null;
          analyzed_at?: string | null;
          rejection_reason?: string | null;
          requires_retry?: boolean;
          retry_count?: number;
          retry_phrase?: string | null;
          magic_link_sent_at?: string | null;
          magic_link_expires_at?: string | null;
        };
        Update: {
          video_url?: string | null;
          document_front_url?: string | null;
          document_back_url?: string | null;
          profissao_informada?: string | null;
          status?: 'pending' | 'approved' | 'rejected' | 'retry_needed';
          analyzed_by?: string | null;
          analyzed_at?: string | null;
          rejection_reason?: string | null;
          requires_retry?: boolean;
          retry_count?: number;
          retry_phrase?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      verification_logs: {
        Row: {
          id: string;
          verification_id: string;
          analise_id: string;
          action: string;
          performed_by: string | null;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          verification_id: string;
          analise_id: string;
          action: string;
          performed_by?: string | null;
          details?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };

      // ── Comissões & Gateways ─────────────────────────────

      agentes_comissoes: {
        Row: {
          id: string;
          agente_id: string;
          percentual_venda: number;
          percentual_cobranca: number;
          percentual_gerencia: number;
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agente_id: string;
          percentual_venda?: number;
          percentual_cobranca?: number;
          percentual_gerencia?: number;
          ativo?: boolean;
        };
        Update: {
          agente_id?: string;
          percentual_venda?: number;
          percentual_cobranca?: number;
          percentual_gerencia?: number;
          ativo?: boolean;
          updated_at?: string;
        };
      };

      comissoes_liquidacoes: {
        Row: {
          id: string;
          parcela_id: string;
          emprestimo_id: string;
          agente_id: string;
          tipo: ComissaoTipo;
          valor_base: number;
          percentual: number;
          valor_comissao: number;
          mes_referencia: string;
          status: ComissaoStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          parcela_id: string;
          emprestimo_id: string;
          agente_id: string;
          tipo: ComissaoTipo;
          valor_base: number;
          percentual: number;
          valor_comissao: number;
          mes_referencia: string;
          status?: ComissaoStatus;
        };
        Update: {
          status?: ComissaoStatus;
        };
      };

      gateways_pagamento: {
        Row: {
          id: string;
          nome: string;
          label: string;
          ativo: boolean;
          config: Json;
          prioridade: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          label: string;
          ativo?: boolean;
          config?: Json;
          prioridade?: number;
        };
        Update: {
          nome?: string;
          label?: string;
          ativo?: boolean;
          config?: Json;
          prioridade?: number;
          updated_at?: string;
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
      get_kanban_stats: {
        Args: Record<string, never>;
        Returns: {
          total_analises: number;
          analises_pendentes: number;
          analises_em_analise: number;
          analises_aprovadas: number;
          analises_recusadas: number;
          total_tickets: number;
          tickets_abertos: number;
          tickets_em_atendimento: number;
          tickets_resolvidos: number;
          total_cobranca: number;
          cobranca_em_negociacao: number;
          cobranca_acordos: number;
          cobranca_pagos: number;
          valor_em_cobranca: number;
          valor_recuperado: number;
          taxa_aprovacao_credito: number;
        };
      };
      get_woovi_dashboard_stats: {
        Args: Record<string, never>;
        Returns: {
          total_charges: number;
          charges_active: number;
          charges_completed: number;
          charges_expired: number;
          total_recebido: number;
          total_transferido: number;
          total_split: number;
          total_subcontas: number;
          total_webhooks: number;
          webhooks_com_erro: number;
        };
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
      analise_credito_status: AnaliseCreditoStatus;
      rede_status: RedeStatus;
      bloqueio_motivo: BloqueioMotivo;
      ticket_status: TicketStatus;
      ticket_canal: TicketCanal;
      ticket_prioridade: TicketPrioridade;
      kanban_cobranca_etapa: KanbanCobrancaEtapa;
      whatsapp_instance_status: WhatsappInstanceStatus;
      fluxo_status: FluxoStatus;
      fluxo_etapa_tipo: FluxoEtapaTipo;
      whatsapp_msg_status: WhatsappMsgStatus;
      woovi_charge_status: WooviChargeStatus;
      woovi_transaction_status: WooviTransactionStatus;
      woovi_transaction_type: WooviTransactionType;
      verification_status: VerificationStatus;
      comissao_tipo: ComissaoTipo;
      comissao_status: ComissaoStatus;
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
/** Linha da tabela analises_credito */
export type AnaliseCredito = Database['public']['Tables']['analises_credito']['Row'];
/** Linha da tabela rede_indicacoes */
export type RedeIndicacao = Database['public']['Tables']['rede_indicacoes']['Row'];
/** Linha da tabela bloqueios_rede */
export type BloqueioRede = Database['public']['Tables']['bloqueios_rede']['Row'];

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
export type AnaliseCreditoInsert = Database['public']['Tables']['analises_credito']['Insert'];
export type AnaliseCreditoUpdate = Database['public']['Tables']['analises_credito']['Update'];
export type RedeIndicacaoInsert = Database['public']['Tables']['rede_indicacoes']['Insert'];
export type RedeIndicacaoUpdate = Database['public']['Tables']['rede_indicacoes']['Update'];
export type BloqueioRedeInsert = Database['public']['Tables']['bloqueios_rede']['Insert'];
export type BloqueioRedeUpdate = Database['public']['Tables']['bloqueios_rede']['Update'];

/** Linha da tabela whatsapp_instancias */
export type WhatsappInstancia = Database['public']['Tables']['whatsapp_instancias']['Row'];
export type WhatsappInstanciaInsert = Database['public']['Tables']['whatsapp_instancias']['Insert'];
export type WhatsappInstanciaUpdate = Database['public']['Tables']['whatsapp_instancias']['Update'];

/** Linha da tabela fluxos_chatbot */
export type FluxoChatbot = Database['public']['Tables']['fluxos_chatbot']['Row'];
export type FluxoChatbotInsert = Database['public']['Tables']['fluxos_chatbot']['Insert'];
export type FluxoChatbotUpdate = Database['public']['Tables']['fluxos_chatbot']['Update'];

/** Linha da tabela fluxos_chatbot_etapas */
export type FluxoChatbotEtapa = Database['public']['Tables']['fluxos_chatbot_etapas']['Row'];
export type FluxoChatbotEtapaInsert = Database['public']['Tables']['fluxos_chatbot_etapas']['Insert'];
export type FluxoChatbotEtapaUpdate = Database['public']['Tables']['fluxos_chatbot_etapas']['Update'];

/** Linha da tabela whatsapp_mensagens_log */
export type WhatsappMensagemLog = Database['public']['Tables']['whatsapp_mensagens_log']['Row'];
export type WhatsappMensagemLogInsert = Database['public']['Tables']['whatsapp_mensagens_log']['Insert'];

/** Linha da tabela tickets_atendimento */
export type TicketAtendimento = Database['public']['Tables']['tickets_atendimento']['Row'];
export type TicketAtendimentoInsert = Database['public']['Tables']['tickets_atendimento']['Insert'];
export type TicketAtendimentoUpdate = Database['public']['Tables']['tickets_atendimento']['Update'];

/** Linha da tabela kanban_cobranca */
export type KanbanCobranca = Database['public']['Tables']['kanban_cobranca']['Row'];
export type KanbanCobrancaInsert = Database['public']['Tables']['kanban_cobranca']['Insert'];
export type KanbanCobrancaUpdate = Database['public']['Tables']['kanban_cobranca']['Update'];

/** Linha da tabela chat_interno */
export type ChatInterno = Database['public']['Tables']['chat_interno']['Row'];
export type ChatInternoInsert = Database['public']['Tables']['chat_interno']['Insert'];
export type ChatInternoUpdate = Database['public']['Tables']['chat_interno']['Update'];

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

/** Cliente com empréstimos embutidos (usado na listagem de clientes) */
export type ClienteComEmprestimos = Cliente & {
  emprestimos: Pick<Emprestimo, 'id' | 'valor' | 'parcelas' | 'parcelas_pagas' | 'proximo_vencimento' | 'status'>[];
};

/** Membro da rede de indicações com dados do cliente (JOIN) */
export type RedeIndicacaoComCliente = RedeIndicacao & {
  clientes: { id: string; nome: string; email: string; telefone: string; status: ClienteStatus; valor: number; bonus_acumulado: number; score_interno: number } | null;
};

/** Bloqueio de rede com dados do causador (JOIN) */
export type BloqueioRedeComCausador = BloqueioRede & {
  clientes: { nome: string } | null;
};

/** Ticket de atendimento com dados do cliente e atendente (JOINs) */
export type TicketComCliente = TicketAtendimento & {
  clientes: { nome: string; telefone: string; email: string } | null;
  funcionarios: { nome: string } | null;
};

/** Card do kanban de cobrança com dados do cliente e responsável (JOINs) */
export type KanbanCobrancaComCliente = KanbanCobranca & {
  clientes: { nome: string; telefone: string; email: string; status: ClienteStatus } | null;
  funcionarios: { nome: string } | null;
};

/** Fluxo de chatbot com etapas (JOIN) */
export type FluxoChatbotComEtapas = FluxoChatbot & {
  fluxos_chatbot_etapas: FluxoChatbotEtapa[];
};

// ── Woovi (Gateway de Pagamentos) ─────────────────────────────────

/** Linha da tabela woovi_charges */
export type WooviCharge = Database['public']['Tables']['woovi_charges']['Row'];
export type WooviChargeInsert = Database['public']['Tables']['woovi_charges']['Insert'];
export type WooviChargeUpdate = Database['public']['Tables']['woovi_charges']['Update'];

/** Linha da tabela woovi_transactions */
export type WooviTransaction = Database['public']['Tables']['woovi_transactions']['Row'];
export type WooviTransactionInsert = Database['public']['Tables']['woovi_transactions']['Insert'];
export type WooviTransactionUpdate = Database['public']['Tables']['woovi_transactions']['Update'];

/** Linha da tabela woovi_subaccounts */
export type WooviSubaccount = Database['public']['Tables']['woovi_subaccounts']['Row'];
export type WooviSubaccountInsert = Database['public']['Tables']['woovi_subaccounts']['Insert'];
export type WooviSubaccountUpdate = Database['public']['Tables']['woovi_subaccounts']['Update'];

/** Linha da tabela woovi_webhooks_log */
export type WooviWebhookLog = Database['public']['Tables']['woovi_webhooks_log']['Row'];

/** Cobrança com dados do cliente (JOIN) */
export type WooviChargeComCliente = WooviCharge & {
  clientes: { nome: string; telefone: string } | null;
};

/** Subconta com dados do cliente (JOIN) */
export type WooviSubaccountComCliente = WooviSubaccount & {
  clientes: { nome: string; telefone: string; email: string } | null;
};

// ── Comissões & Gateways ──────────────────────────────────────────

/** Linha da tabela agentes_comissoes */
export type AgenteComissao = Database['public']['Tables']['agentes_comissoes']['Row'];
export type AgenteComissaoInsert = Database['public']['Tables']['agentes_comissoes']['Insert'];
export type AgenteComissaoUpdate = Database['public']['Tables']['agentes_comissoes']['Update'];

/** Linha da tabela comissoes_liquidacoes */
export type ComissaoLiquidacao = Database['public']['Tables']['comissoes_liquidacoes']['Row'];
export type ComissaoLiquidacaoInsert = Database['public']['Tables']['comissoes_liquidacoes']['Insert'];
export type ComissaoLiquidacaoUpdate = Database['public']['Tables']['comissoes_liquidacoes']['Update'];

/** Linha da tabela gateways_pagamento */
export type GatewayPagamento = Database['public']['Tables']['gateways_pagamento']['Row'];
export type GatewayPagamentoInsert = Database['public']['Tables']['gateways_pagamento']['Insert'];
export type GatewayPagamentoUpdate = Database['public']['Tables']['gateways_pagamento']['Update'];

/** Comissão com dados do agente (JOIN) */
export type ComissaoComAgente = ComissaoLiquidacao & {
  profiles: { name: string; email: string; role: UserRole } | null;
};

// ── Identity Verification (Verificação de Identidade) ─────────────

export interface ReferenceContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface IdentityVerificationRow {
  id: string;
  analise_id: string;
  user_id: string | null;
  video_url: string | null;
  document_front_url: string | null;
  document_back_url: string | null;
  profissao_informada: string | null;
  proof_of_address_url: string | null;
  residence_video_url: string | null;
  client_address: string | null;
  reference_contacts: ReferenceContact[];
  verification_phrase: string;
  status: VerificationStatus;
  analyzed_by: string | null;
  analyzed_at: string | null;
  rejection_reason: string | null;
  requires_retry: boolean;
  retry_count: number;
  retry_phrase: string | null;
  magic_link_sent_at: string | null;
  magic_link_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdentityVerificationInsert {
  id?: string;
  analise_id: string;
  user_id?: string | null;
  video_url?: string | null;
  document_front_url?: string | null;
  document_back_url?: string | null;
  profissao_informada?: string | null;
  proof_of_address_url?: string | null;
  residence_video_url?: string | null;
  client_address?: string | null;
  reference_contacts?: ReferenceContact[];
  verification_phrase: string;
  status?: VerificationStatus;
  analyzed_by?: string | null;
  analyzed_at?: string | null;
  rejection_reason?: string | null;
  requires_retry?: boolean;
  retry_count?: number;
  retry_phrase?: string | null;
  magic_link_sent_at?: string | null;
  magic_link_expires_at?: string | null;
}

export interface IdentityVerificationUpdate {
  video_url?: string | null;
  document_front_url?: string | null;
  document_back_url?: string | null;
  profissao_informada?: string | null;
  proof_of_address_url?: string | null;
  residence_video_url?: string | null;
  client_address?: string | null;
  reference_contacts?: ReferenceContact[];
  status?: VerificationStatus;
  analyzed_by?: string | null;
  analyzed_at?: string | null;
  rejection_reason?: string | null;
  requires_retry?: boolean;
  retry_count?: number;
  retry_phrase?: string | null;
  updated_at?: string;
}

export interface VerificationLogRow {
  id: string;
  verification_id: string;
  analise_id: string;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface VerificationLogInsert {
  verification_id: string;
  analise_id: string;
  action: string;
  performed_by?: string | null;
  details?: Record<string, unknown>;
}

/** Verificação com dados da análise (JOIN) */
export type IdentityVerificationComAnalise = IdentityVerificationRow & {
  analises_credito: {
    cliente_nome: string;
    cpf: string;
    valor_solicitado: number;
    renda_mensal: number;
    score_serasa: number;
    status: AnaliseCreditoStatus;
  } | null;
};
