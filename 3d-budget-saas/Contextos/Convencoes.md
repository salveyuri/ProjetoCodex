# Convenções de código e de entrega

Migrado de `CONTEXT.md` em 2026-08-12, formalizando padrões que já vinham
sendo seguidos implicitamente no histórico do projeto.

---

## Banco de dados / Prisma

- Campos **camelCase** no Prisma Client; `@map`/`@@map` traduzem para
  **snake_case** nas tabelas/colunas do PostgreSQL. Não misturar convenção
  dentro do schema.
- Todo valor monetário interno usa `Prisma.Decimal`; nunca `number`/`float`
  bruto para dinheiro. Arredondar só na saída (2 casas, `ROUND_HALF_UP`).
- Campos técnicos (ex.: `costPerGram`, watts) podem manter mais casas
  decimais para rastreabilidade — só o valor monetário final é arredondado.
- Migrações Prisma ficam versionadas em `backend/prisma/migrations/`;
  aplicar com `npx prisma migrate deploy` (nunca editar uma migração já
  aplicada, criar uma nova).

## Multi-tenancy

- **Toda** query/mutação de recurso de empresa usa `{ id, companyId }` —
  nunca `id` isolado. `companyId` vem sempre de `request.auth.companyId`
  (preenchido pelo `authMiddleware`), nunca de payload do cliente.
- IDs recebidos via URL passam por `idParamSchema` (UUID estrito) antes de
  chegar a qualquer service.
- Recurso fora do tenant retorna `403`, nunca `404` silencioso nem execução
  da mutação.

## Validação (Zod)

- Schemas de mutação usam `.strict()` — rejeitam campos extras não previstos
  (ex.: `role`, `planId` fora dos endpoints de admin).
- Campos numéricos em payload **JSON** usam `z.number()`, não
  `z.coerce.number()` — não aceitar string em campo monetário/percentual.
- Coerção de tipo só é aceitável em **query params** (o transporte HTTP já
  exige string ali, ex.: paginação).
- **Exceção deliberada:** `backend/src/validators/webhook.validator.ts`
  (payload do webhook do Asaas) não é `.strict()` — valida um payload
  externo e evolutivo de terceiros, não uma mutação interna nossa. Rejeitar
  campos desconhecidos ali tornaria a integração frágil contra o Asaas
  adicionar campos novos no futuro. Não usar esse validator como precedente
  para relaxar `.strict()` em endpoints internos.

## Motor de fórmulas

- Nunca usar `eval()` ou `new Function()` — só o parser restrito
  (`expr-eval`) com whitelist de caracteres/identificadores em
  `backend/src/services/formula-engine.ts`.
- Toda fórmula nova/editada passa por dry run com valores fictícios antes de
  persistir; fórmula com sintaxe inválida, variável desconhecida ou
  resultado negativo/não finito não é salva.
- Em runtime, falha de fórmula customizada cai automaticamente para a
  fórmula padrão do sistema (nunca falha o cálculo/orçamento inteiro).

## Camadas (Service Layer)

- Controllers só lidam com HTTP (parse de request, chamada ao service,
  resposta). Regra de negócio fica nos services. Prisma só é acessado via o
  singleton `backend/src/config/prisma.ts`.
- Funções de cálculo "puras" (ex.: `calculateQuoteBreakdown`) não acessam
  HTTP nem banco — recebem dados já resolvidos e retornam o resultado.

## Frontend

- Estado parcial (ex.: mesa de orçamento sendo preenchida) vive só na UI;
  só entra em preview/persistência quando completo.
- Inputs numéricos começam vazios (string vazia), nunca com valor
  arbitrário pré-preenchido; `numberFromInput` trata vazio como `0` apenas
  para soma/preview, não para o campo em si.
- Autoridade de acesso a telas admin é sempre o `403` da API — nunca a role
  cacheada no client.

## Processo de entrega

- Antes de considerar uma mudança concluída: lint + build do(s) pacote(s)
  afetado(s) (`npm --workspace @3d-budget/<pacote> run lint|build`),
  `prisma validate` quando o schema mudou, e smoke test manual do endpoint
  ou fluxo de UI afetado (ver `Contextos/Ambientes.md` para o checklist
  completo).
- **Correção (2026-08-12):** o repositório Git existe sim — raiz em
  `D:\ProjetoCodex` (um nível acima de `3d-budget-saas/`), remoto GitHub
  `salveyuri/ProjetoCodex` — ver detalhes e o estado atual (poucos commits,
  muito trabalho não commitado) em `Contextos/Ambientes.md`. **Nunca rode
  `git add`/`commit`/`push` por conta própria** — como no `atendimentos_app`,
  operações de Git exigem confirmação explícita do Yuri antes de executar.
  Ainda não existe uma convenção de mensagem de commit/branch definida por
  ele; perguntar antes de assumir um padrão.
- Ao terminar uma tarefa, resuma para o Yuri: o que mudou, quais comandos de
  validação rodaram e com que resultado, e quais pendências ficaram (via
  `Notas/TODO.md`).
