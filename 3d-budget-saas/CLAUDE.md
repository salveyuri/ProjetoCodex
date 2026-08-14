# 3D Budget SaaS — Orçamentos de Impressão 3D

Monorepo (npm workspaces) para um SaaS de cálculo e gestão de orçamentos de
impressão 3D, multi-tenant por empresa.

---

## ⚠️ ANTES DE QUALQUER TAREFA — leia o contexto

Este projeto mantém sua própria memória versionada, no mesmo padrão usado no
projeto `atendimentos_app`. No início de cada sessão, **leia estes arquivos
antes de agir**:

- `Contextos/Chat.log` — histórico cronológico append-only de blocos/sessões e
  decisões (é grande; leia o final para o estado mais recente e busque no
  restante quando precisar de detalhes de algo específico).
- `Contextos/Decisoes.md` — decisões de arquitetura e negócio.
- `Contextos/Conhecimento.md` — bugs já resolvidos, vetores de ataque anulados
  e aprendizados operacionais.
- `Contextos/Ambientes.md` — detalhes de dev e produção (pronto pra deploy
  via Docker desde 2026-08-13, mas **onde hospedar** continua indefinido —
  ver pendências).
- `Contextos/Convencoes.md` — convenções de código e de entrega.
- `Contextos/Auditoria.md` — backlog de auditoria técnica (achados de
  segurança/arquitetura/performance/qualidade, com ID, prioridade, esforço e
  status de aprovação). Antes de implementar qualquer item de lá, releia o
  achado inteiro e confirme que ele ainda reflete o código atual.
- `Notas/TODO.md` — pendências.

**Mantenha esses arquivos atualizados a cada mudança.** Ao fechar uma tarefa,
registre no `Chat.log` (o que foi pedido, o que foi feito, como foi validado)
e atualize `TODO.md`/`Decisoes.md`/`Conhecimento.md` quando aplicável.

`CONTEXT.md`, na raiz, é o documento monolítico anterior — preservado como
histórico/arquivo morto. Não adicione mais conteúdo nele; use os arquivos de
`Contextos/` a partir de agora.

---

## Idioma

Projeto e comunicação em **português do Brasil**. Código, comentários,
mensagens de UI, logs e documentação em português (identificadores de código
em inglês, como já é o padrão do repositório).

---

## Stack

- **Frontend:** Next.js 16 (App Router), `src/`, Tailwind CSS, Lucide React,
  Recharts. Guard de rota via `frontend/src/proxy.ts` (substitui o antigo
  `middleware.ts` no Next 16), baseado no cookie `auth_token`.
- **Backend:** Node.js + Express em TypeScript, dividido em `app.ts`/`server.ts`
  para permitir testes sem subir porta real. Camadas: controllers (HTTP) →
  services (regra de negócio) → Prisma (singleton em `backend/src/config/prisma.ts`).
- **Banco:** PostgreSQL via Prisma. Campos camelCase no Prisma Client,
  `@map`/`@@map` para snake_case nas tabelas/colunas.
- **Shared:** pacote TypeScript (`shared/`) com contratos comuns (ex.:
  `HealthCheckResponse`, `Quote`, `FormulaResource`) — não depende de
  frontend/backend/banco.
- **Segurança:** JWT (`jsonwebtoken`), `bcryptjs`, `zod` para validação,
  `helmet`, `express-rate-limit`, parser de fórmulas restrito (`expr-eval` +
  whitelist).
- **Observabilidade:** `pino`/`pino-http` (logs estruturados, redaction de
  credenciais), `node-cache` (cache de analytics), tabelas `AuditLog` e
  `SystemError`.
- **PDF:** `pdfkit`, geração server-side em memória (sem persistência em disco).

---

## Estrutura do projeto

```
frontend/            # Next.js App Router
  src/app/            # rotas (login, register, dashboard/*, admin/*)
  src/proxy.ts         # guard de autenticacao (substitui middleware.ts)
  src/contexts/        # AuthProvider
  src/lib/              # helpers (ex.: download-quote-pdf.ts)
  src/components/ui/    # Card, StatusBadge, EmptyState, Skeleton, ToastViewport
backend/
  src/app.ts / server.ts
  src/config/           # prisma.ts (singleton), logger.ts
  src/controllers/      # HTTP por recurso
  src/routes/           # roteamento por recurso
  src/services/         # regra de negocio (Calculation, Formula, Quote,
                         #  Billing, Payment, Admin, Analytics, Audit,
                         #  SystemError, Cache, quote-pdf)
  src/middlewares/      # auth, accountStatus, admin, plan, rate-limit
  src/validators/       # schemas Zod por recurso (.strict())
  prisma/                # schema.prisma + migrations/
shared/
  src/index.ts          # contratos TypeScript compartilhados
CONTEXT.md            # documento historico anterior (nao editar mais)
Contextos/             # memoria versionada do projeto (ver acima)
Notas/TODO.md          # pendencias
```

---

## Modelo de dados (entidades-chave)

- **User**: credenciais, `role` (`USER`/`ADMIN`), `isActive`, email único,
  `password_hash`. 1:1 com `Company` (`Company.userId @unique`).
- **Company** (agregado raiz de negócio): nome, logo, moeda, taxa, e estado de
  assinatura — `planType` (`FREE`/`PRO`/`ENTERPRISE`), `subscriptionStatus`
  (`ACTIVE`/`CANCELED`/`PAST_DUE`), limites de uso, `stripeCustomerId` (futuro).
- **Machine**: impressoras da empresa — tipo (`FDM`/`RESIN`), volume útil,
  depreciação por hora, consumo elétrico (kW).
- **Material**: insumos da empresa — marca, tipo, cor, peso, custo por grama
  (derivado de `purchasePrice / totalWeightGrams`), densidade.
- **PricingSettings** (1:1 com `Company`): margem desejada, valor hora
  técnica, `paintingHourRate`, `finishingHourRate`, `errorRate`, `extraFees`
  (JSON: energia/kWh, taxa cartão, taxa administrativa, `customVariables`
  tipadas `{ value, type }` com `type` em `INTEGER`/`FLOAT`/`PERCENTAGE`).
- **Formula**: expressões versionáveis por empresa, `code` único por empresa,
  `isDefault` para a fórmula padrão.
- **Quote**: orçamento — cliente, status (`DRAFT`→`SENT`→`APPROVED`/`REJECTED`),
  `formulaId` opcional, totais agregados (`totalAmount`, `totalPrintHours`,
  `totalWeightGrams`), `paintingHours`/`finishingHours`.
- **PrintItem**: mesa de impressão de um `Quote`, ligada a `Machine` +
  `Material`, com snapshot dos custos calculados (`materialCost`,
  `energyCost`, `depreciationCost`, `laborCost`, `baseCost`, `marginAmount`,
  `feesTotal`, `finalPrice`) — snapshots preservam o histórico financeiro
  mesmo que máquina/material/fórmula mudem depois.
- **AuditLog** / **SystemError**: trilhas append-only de ações sensíveis e
  erros capturados pelo middleware global.

Todas as queries e mutações de recurso usam `{ id, companyId }` — nunca `id`
isolado (ver `Contextos/Conhecimento.md` para os vetores IDOR já fechados).

---

## Convenções e pendências

Ver `Contextos/Convencoes.md` para padrões de código/entrega e
`Notas/TODO.md` para a lista viva de pendências (deploy, testes automatizados,
evoluções de PDF/analytics/RBAC).
