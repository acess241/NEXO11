# Central de XP e recompensas

## Instalação

No SQL Editor do Supabase, execute nesta ordem:

1. `database/20260727_xp_rewards_activities_v8.sql`
2. `database/academy_xp_milestones_only_patch.sql`
3. `database/20260727_activity_share_links_patch.sql`
4. `database/20260727_standalone_link_activities_patch.sql`

O primeiro arquivo é uma migration aditiva: preserva `profiles`, `classrooms`, `xp_ledger`, notificações e dados antigos. O segundo religa o fluxo diário do Nexinho ao novo livro-razão de XP, evitando que o sistema antigo e o novo premiem o mesmo marco simultaneamente.

O terceiro arquivo limita a publicação de atividades aos professores responsáveis pelas próprias turmas e cria um link exclusivo para cada atividade. O professor copia esse link na central e o aluno autenticado da turma faz a entrega em `/academia/atividade/:shareToken`.

O quarto simplifica o fluxo final: remove a obrigação de selecionar turma, mantém a atividade vinculada ao professor e à escola, permite compartilhar o link em qualquer grupo e cria o bucket para arquivos DOC, DOCX e PDF.

## Rotas e perfis

- `/academia`: mantém a academia existente e oferece acesso à nova central.
- `/academia/xp`: painel responsivo de aluno, professor e gestão.
- Aluno: painel, atividades, catálogo, solicitações, linha do tempo e extrato.
- Professor: criação, arquivamento, entregas e correções das próprias turmas.
- Gestão: recompensas, pedidos, entrega, relatórios CSV, ajustes e estornos via RPC.

## Regra financeira

`disponível = total_balance - reserved_balance`

O navegador nunca altera saldo diretamente. Entrega não concede XP. Correção, nova correção, reserva, aprovação, recusa, cancelamento, ajuste, estorno e marcos são executados por funções `security definer`, com bloqueio de linha (`FOR UPDATE`), validação de escola/perfil e chaves idempotentes.

- Nova correção grava outra versão e movimenta apenas a diferença.
- Aprovação debita uma vez; uma segunda tentativa encontra status já processado.
- Recusa/cancelamento libera a reserva sem criar débito.
- Transações não são editadas nem removidas. Erros geram uma transação de estorno.
- XP e Nexocoins usam estruturas diferentes e não existe conversão entre moedas.

## Nexinho

`xp_award_nexinho_milestones` processa todos os marcos ainda pendentes (1, 7, 15, 30, 50, 100 e 365 dias) para os dois participantes. A chave única é:

`nexinho:<dupla>:aluno:<perfil>:marco:<dias>`

Recomeçar uma sequência não concede novamente um marco já registrado.

## Verificação

```powershell
npm test
npm run build
```

Os testes unitários cobrem cálculo proporcional, penalidade, diferença entre correções, menor resultado, limite manual e invariantes da carteira. As invariantes de autorização, concorrência e idempotência são aplicadas e validadas no banco pelas constraints, RLS e RPCs.
