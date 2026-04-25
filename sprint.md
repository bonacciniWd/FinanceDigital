AnáliseCredito Page
- colocar opção de colocar data de cada parcela manualmente 
- Poder sempre escolher manual a data da primeira parcela, e depois configurar o restante (assim como está, apenas melhorar o UX)
✅⁠verificação para cliente antigo(colocar como opicional)⁠ com aprovação automática de empréstimo 


Função de acordo (Já temos regras que o bot usa)
(ao confirmar um acordo, atualizar as parcelas e emprestimo automaticamente)*vale ressaltar que o que foi pago antes do acordo fica como valor recebido e conta no fluxo de caixa normal e conta como (pagamento limpo), já o recebido depois do acordo conta como Recuperacao via acordos (DashboardCobrançaPage.tsx tem mais informacoes sobre o que eu quero) .
- acordo: entrada trocar percentual por valor configuravel
- ⁠acordo: deve abrir novamente as mesmas funções de criação de empréstimos, porque são as mesmas condições com opção de datas e valores. 



Empréstimos ativos
- liberar opção de editar empréstimos e liberar a funcionalidade de refinanciamento (acordo)

Kanban de cobrança 
- kanban de: A vencer = trazer somente cliente que tem vencimento na data de hoje 
✅ajustar a barra de scroll do kanban está passando por cima 
- Ordenador de dias de vencimento por coluna 
- ⁠comprovante para pagamento de parcela, achar uma solução porque hoje eles estão baixando no pc é importante (aí fica o registro do comprovante) devemos ter 90% como conciliação automática 

Gestão de parcelas 
- liberar ou editar direto no empréstimos ativos não seria necessário a gestão de parcelas
-
Permissões de usuário
✅deixar as permissões editáveis


ClienteDetalhesModal.tsx
Adicao de botao de edicao de parcelas, adicao de juros, multas, e se vencido botao de acordo acessando a funcao de acordo que criamos logo a cima.

*** REPORTS KANBAN COBRANÇA PAGE ***
ao clicar no botão de sincronizar, o servidor devolve: 400/
https://ctvihcpojodsntoelfck.supabase.co/rest/v1/parcelas?select=id%2Cemprestimo_id%2Ccliente_id%2Cvalor%2Cvalor_original%2Cjuros%2Cmulta%2Cdesconto%2Cdata_vencimento%2Cstatus%2Ccongelada&emprestimo_id=in.%2810ec52ba-8b21-43e6-a671-a55adab7429a%2Cfffaec8b-e3c6-45c6-971f-6284f8a40e78%2Ca845e359-f110-4ad9-bf28-51d469695c9f%29&status=in.%28pendente%2Cvencida%29&congelada=eq.false&order=data_vencimento.asc
