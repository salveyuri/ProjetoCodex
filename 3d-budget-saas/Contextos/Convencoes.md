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
- **Toda tabela nova precisa habilitar RLS na própria migração que a cria**:
  `ALTER TABLE "nome_da_tabela" ENABLE ROW LEVEL SECURITY;`, sem nenhuma
  policy. O Supabase expõe automaticamente qualquer tabela do schema
  `public` via PostgREST, mesmo que a aplicação nunca use PostgREST/o
  client JS do Supabase (não usa — só Prisma, com o role `postgres`, que
  faz bypass de RLS por ser dono das tabelas, então habilitar RLS sem
  policy fecha o PostgREST sem afetar a aplicação). Sem isso, o Supabase
  gera um alerta de segurança por tabela ("Table public.X is public, but
  RLS has not been enabled"). Descoberto em 2026-08-24 já com 21 tabelas
  sem RLS - corrigido numa migração retroativa
  (`20260824220000_enable_rls_all_tables`); a partir de agora é regra
  pra toda migração que cria tabela nova. Ver `Contextos/Decisoes.md`
  (2026-08-24).
- **`docker compose run --rm backend npx prisma migrate deploy` usa a
  imagem já buildada** - `git pull` sozinho atualiza só o código-fonte no
  disco, não a imagem Docker (as migrations são copiadas pra dentro da
  imagem em tempo de build). Sempre `docker compose build backend` antes
  de rodar uma migração nova em qualquer ambiente, ou o comando roda
  contra os arquivos antigos silenciosamente (sem erro, só reporta
  "no pending migrations" porque genuinamente não enxerga a nova).

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
- **O preço do plano Pro na landing page pública (`frontend/src/app/page.tsx`,
  seção `#planos`) é texto fixo, não vem do banco** — ao contrário de
  `/dashboard/billing`, que busca `Plan.price` via `GET /plans` em tempo
  real. Sempre que o preço de um plano mudar em `/admin/plans`, atualizar
  esse texto manualmente também (achado real em 2026-08-27, ver
  `Contextos/Decisoes.md`).

## Processo de entrega

- Antes de considerar uma mudança concluída: lint + build do(s) pacote(s)
  afetado(s) (`npm --workspace @3d-budget/<pacote> run lint|build`),
  `prisma validate` quando o schema mudou, e smoke test manual do endpoint
  ou fluxo de UI afetado (ver `Contextos/Ambientes.md` para o checklist
  completo).
- **Correção (2026-08-12):** o repositório Git existe sim — raiz em
  `D:\ProjetoCodex` (um nível acima de `3d-budget-saas/`), remoto GitHub
  `salveyuri/ProjetoCodex` — ver detalhes e o estado atual em
  `Contextos/Ambientes.md`.
- **Atualizado (2026-08-26):** ao contrário do que a versão anterior desta
  linha dizia, o Yuri confirmou que o fluxo é **auto-commit ao fechar cada
  tarefa** — não pedir confirmação a cada commit. Convenção em uso desde
  então (diferente do `atendimentos_app`, onde é SVN manual e cada
  commit/versão exige aprovação explícita — não confundir os dois
  projetos): `git add` sempre com arquivos explícitos (nunca `-A`/`.`),
  descartar churn rotineiro tipo `frontend/next-env.d.ts`, atualizar
  `Contextos/Decisoes.md`/`Chat.log`/`Notas/TODO.md` antes de commitar
  (no estilo já existente de cada arquivo), commitar, e ao final informar
  os comandos exatos de `git push` + deploy (incluindo passo de migração
  só quando uma migração nova foi adicionada). Operação de banco em si
  (rodar a migração de verdade contra um banco real) continua exigindo
  confirmação explícita antes — é o Yuri quem roda esses comandos na VPS,
  nunca eu diretamente.
- Ao terminar uma tarefa, resuma para o Yuri: o que mudou, quais comandos de
  validação rodaram e com que resultado, e quais pendências ficaram (via
  `Notas/TODO.md`).
