# CONTEXT.md

> **ARQUIVO HISTÓRICO — não editar mais.** Em 2026-08-12 este projeto passou
> a usar o mesmo padrão de contexto do projeto `atendimentos_app`: ver
> `CLAUDE.md` (visão geral) e `Contextos/Chat.log`, `Contextos/Decisoes.md`,
> `Contextos/Conhecimento.md`, `Contextos/Ambientes.md`,
> `Contextos/Convencoes.md` e `Notas/TODO.md`. Todo o conteúdo abaixo foi
> migrado para esses arquivos; este documento fica só como referência do
> estado bruto anterior.

## Estado Atual

- Monorepo `3d-budget-saas` inicializado com tres areas principais:
  - `frontend`: aplicacao Next.js com App Router, Tailwind CSS, Lucide React e dashboard em `/dashboard`.
  - `backend`: API Node.js + Express em TypeScript com separacao `app.ts`/`server.ts`.
  - `shared`: pacote TypeScript para contratos comuns entre frontend e backend.
- Backend possui endpoint `GET /api/health` com retorno de status do servidor e latencia de consulta ao PostgreSQL via Prisma.
- Prisma evoluido para o modelo relacional de orcamentos 3D: usuarios, empresas, maquinas, materiais, configuracoes de preco, formulas, orcamentos e itens de impressao.
- Backend possui autenticacao JWT com registro, login e middleware de protecao.
- Frontend possui `MainLayout` com Header e Sidebar persistentes, card de status que consulta o backend, paginas `/login` e `/register`, e protecao de `/dashboard` por cookie de sessao.
- Modulo de Configuracoes de Producao implementado com CRUD protegido de maquinas, materiais e configuracoes de custo em `/dashboard/settings`.
- Motor de Calculo de Orcamentos implementado com endpoint protegido `/api/calculate` e simulador em `/dashboard/calculator`.
- Gestao de Orcamentos implementada com CRUD protegido em `/api/quotes`, listagem em `/dashboard/quotes` e formulario de criacao/edicao.
- Sistema de Mesas de Impressao implementado: um `Quote` agora contem multiplos `PrintItem`, cada um com maquina, material, peso, tempo e snapshot proprio.
- Sistema de Formulas Dinamicas implementado: cada empresa pode listar, criar, editar, excluir e marcar formulas de preco como padrao; orcamentos e previews podem selecionar a formula aplicada.
- Bloco 8.1 implementado: tela de formulas redesenhada com layout profissional, variaveis tipadas, preview em tempo real e conversao automatica de percentuais customizados.
- Bloco 8.3 implementado: formulas agora recebem variaveis operacionais de pintura/acabamento, quantidade de mesas e taxa de erro configuravel por empresa.
- Bloco 9 implementado: dashboard principal com KPIs reais, atividade recente, sidebar colapsavel, filtros avancados de orcamentos, toasts, skeletons e empty states padronizados.
- Bloco 10 implementado: exportacao profissional de orcamentos em PDF com dados da empresa, cliente, mesas de impressao e resumo financeiro.
- Polimento pos-Bloco 10 aplicado: telas de formulas, novo orcamento e calculadora foram ajustadas para evitar sobreposicoes; o editor de formulas agora abre somente em modo criar/editar.
- Bloco 11 implementado: camada de planos, limites de uso, RBAC administrativo, billing do usuario e admin de usuarios.
- Correcao RBAC/Admin aplicada: a tela `/admin/users` agora atualiza a sessao em `/api/auth/me` e deixa a API decidir o acesso, evitando bloqueio por role antiga em `localStorage`.
- Bloco 12 implementado: Analytics, Performance, Observabilidade e Auditoria com graficos, exports CSV/JSON, cache, logs estruturados e painel global Admin.
- Correcao de fluxo em orcamentos aplicada: novas mesas iniciam vazias, selects usam placeholders neutros e o preview acumulado ignora mesas incompletas sem quebrar o total.
- Bloco 13 implementado: blindagem de seguranca com rate limiting, headers Helmet, validacao Zod estrita, parser de formulas endurecido e mutacoes multi-tenant com `companyId` no proprio Prisma.
- Ajuste visual aplicado em `/dashboard/settings`: modais de maquinas e materiais usam largura responsiva, scroll interno e campos com `min-width` seguro para evitar overflow em grades.

## Decisoes de Arquitetura

- A estrutura segue um Modular Monolith em monorepo simples: frontend, backend e contratos compartilhados ficam separados por responsabilidade, mas evoluem juntos.
- O backend usa Service Layer Pattern: controllers lidam com HTTP, services concentram regras de negocio e Prisma fica encapsulado no singleton `src/config/prisma.ts`.
- O Express foi dividido entre `app.ts` e `server.ts` para facilitar testes unitarios futuros sem subir uma porta real.
- O `shared` foi criado para reduzir divergencia de tipos em payloads comuns, com `HealthCheckResponse` ja compartilhado.
- As dependencias internas usam `file:../shared` para compatibilidade com npm puro no ambiente Windows atual.
- O frontend usa Next.js 16+ com App Router e `src/` para manter compatibilidade com padroes atuais e evitar faixas vulneraveis anteriores.
- O Next 16 usa `src/proxy.ts` como guard de rota para substituir a convencao antiga de `middleware.ts`.
- O monorepo usa `overrides` para manter `postcss` em faixa segura quando dependencias transitivas puxarem versoes antigas.
- ESLint foi configurado em flat config para acompanhar Next 16 e manter lint consistente entre frontend e backend.
- A paleta visual foi consolidada para uma interface SaaS operacional: base Slate/Zinc escura, acoes primarias em Indigo/Violet, estados positivos em Emerald e alertas em Amber/Rose.
- O Bloco 4 reutiliza o schema Prisma existente: `Machine`, `Material` e `PricingSettings` ja pertencem a `Company`, evitando migracao adicional nesta fase.
- Custos fixos flexiveis como energia por kWh, taxa de cartao e taxa administrativa ficam em `PricingSettings.extraFees` para permitir evolucao sem alterar colunas a cada nova variavel.
- O Bloco 5 implementa a matematica como funcao pura em `calculateQuoteBreakdown`, deixando a busca de banco separada no `CalculationService`.
- O Bloco 6 persiste snapshots no `PrintItem`; o valor historico do orcamento nao muda quando material, maquina ou settings forem alterados depois.
- O Bloco 7 transforma o orcamento de item unico em container multi-itens; totais agregados ficam no `Quote` e custos granulares ficam em cada `PrintItem`.
- O Bloco 8 troca o preco final rigido por um parser seguro (`expr-eval`) com operadores restritos, mantendo os componentes tecnicos calculados com `Prisma.Decimal`.
- Variaveis customizadas continuam em `PricingSettings.extraFees` para evitar migracao relacional prematura; o formato evoluiu de numero simples para objeto tipado `{ value, type }`, com leitura retrocompativel de valores legados.
- O Bloco 10 usa geracao PDF server-side com `pdfkit`, evitando divergencia entre navegadores e mantendo a validacao de ownership por `companyId` no backend.
- A tela de formulas adotou o padrao biblioteca-primeiro: a lista de formulas fica sempre visivel, enquanto editor, variaveis disponiveis e teste aparecem apenas quando o usuario cria ou edita uma formula, reduzindo ruido visual e eliminando sobreposicoes.
- O Bloco 11 mantém monetizacao dentro do agregado `Company`, porque o plano controla recursos da empresa inteira e nao apenas o login individual.
- Permissoes administrativas sao validadas no backend contra o banco a cada rota `/api/admin`, evitando depender de tokens antigos quando um usuario muda de role.
- O frontend nao usa mais o usuario cacheado como autoridade final para `/admin/users`; ele tenta carregar a rota administrativa e mostra "Acesso restrito" apenas quando o backend retorna `403`.
- O `AuthProvider` passou a revalidar a sessao em `GET /api/auth/me` no bootstrap e expor `refreshUser()`, garantindo que mudancas manuais de `role`, `company` ou status no banco reflitam sem exigir novo login.
- Middlewares de plano consultam a role atual do usuario no banco antes de aplicar bypass ADMIN, evitando que um JWT emitido antes da promocao continue impondo limites do plano Free.
- O gateway de pagamento foi isolado em `PaymentService` mock para receber Stripe futuramente sem espalhar detalhes de SDK pelos controllers.
- O Bloco 12 usa snapshots financeiros de `PrintItem` como fonte de verdade para analytics; relatorios nao recalculam orcamentos antigos e preservam historico mesmo apos mudanca de material, maquina ou formula.
- O formulario de orcamento separa estado parcial de estado persistivel: mesas incompletas podem existir na UI, mas somente mesas completas entram no preview e todas as mesas precisam estar completas para salvar o `Quote`.
- Analytics usa `node-cache` em memoria com TTL de 5 minutos para metricas da empresa e 10 minutos para metricas globais do Admin; mutacoes de orcamento, maquinas, materiais, erros e auditoria invalidam caches relevantes.
- Logs HTTP foram migrados de `morgan` para `pino`/`pino-http`, com redaction de credenciais e niveis configuraveis por `LOG_LEVEL`.
- O middleware global de erro persiste falhas em `SystemError` e tambem emite logs estruturados; rotas 404 nao sao persistidas para evitar ruido operacional.
- A auditoria foi implementada como trilha append-only em `AuditLog`, registrando mudancas sensiveis de usuario/plano, billing e formulas.
- A estrategia anti-IDOR agora usa consultas e mutacoes com `{ id, companyId }` nos agregados de empresa; recursos fora do tenant retornam `403` em vez de serem atualizados por `id` isolado.
- Payloads JSON de mutacao usam schemas Zod `.strict()` e numeros/booleanos reais, sem coercao permissiva de strings em campos monetarios, percentuais ou flags.

## Database Layer

- Prisma esta configurado no backend com PostgreSQL via `DATABASE_URL`.
- O singleton canonico agora fica em `backend/src/config/prisma.ts`; `backend/src/config/database.ts` permanece como re-export para compatibilidade.
- A modelagem usa campos camelCase no Prisma Client e `@map/@@map` para persistir tabelas e colunas em snake_case no PostgreSQL.
- O comando de migracao inicial foi registrado em `backend/package.json`: `npm run prisma:migrate:init --workspace @3d-budget/backend`.
- `prisma generate`, `prisma validate`, `npm run lint` e `npm run build` foram executados com sucesso apos a alteracao do schema.

## Entity Map

- `User`: credenciais, status ativo e papel do usuario (`ADMIN`, `USER`), com email unico e coluna `password_hash`.
- `Company`: perfil 1:1 da empresa do usuario, incluindo nome, logo, moeda padrao, taxa/impostos, plano, status de assinatura, Stripe customer id futuro e limites de uso.
- `Machine`: impressoras vinculadas a uma empresa, com tipo (`FDM`, `RESIN`), volume util, depreciacao por hora e consumo eletrico.
- `Material`: filamentos, resinas ou outros insumos vinculados a uma empresa, com marca, tipo, cor, peso, custo por grama e densidade.
- `PricingSettings`: configuracao 1:1 da empresa para margem desejada, valor da hora tecnica e taxas extras em JSON.
- `Formula`: expressoes e coeficientes versionaveis por empresa, identificados por `code` unico dentro da empresa, com `isDefault` para selecionar a formula ativa padrao.
- `Quote`: orcamentos da empresa, com cliente, status (`DRAFT`, `SENT`, `APPROVED`, `REJECTED`), formula aplicada, valor total, peso total, horas totais, horas de pintura/acabamento e validade.
- `PrintItem`: mesas/itens de impressao de um orcamento, cada um ligado obrigatoriamente a uma `Machine` e um `Material`, com snapshots de custos calculados.
- `SystemConfig`: configuracoes tecnicas/plataforma mantidas da fase inicial.
- `AuditLog`: trilha de auditoria para acoes sensiveis, com ator, alvo, empresa, entidade, before/after e metadata.
- `SystemError`: erros capturados pelo middleware global, com mensagem, stack, status HTTP, usuario/empresa e metadata.

## Relational Logic

- `User` possui exatamente uma `Company` por meio de `Company.userId @unique`.
- `Company` e o agregado raiz de negocio: maquinas, materiais, formulas, configuracoes e orcamentos ficam sempre vinculados a ela.
- `Quote` pertence a uma `Company` e possui multiplos `PrintItem`.
- `Quote.formulaId` referencia opcionalmente a `Formula` usada no calculo; se a formula for removida, o vinculo fica nulo e os snapshots dos itens preservam o historico financeiro.
- Cada `PrintItem` referencia uma `Machine` e um `Material`; isso permite calcular custo combinando tempo estimado, peso do material, depreciacao da maquina, energia, margem e formulas ativas.
- Exclusao de `Quote` remove seus `PrintItem` em cascata; exclusao de `Machine` ou `Material` usados em itens e restrita para preservar historico de orcamentos.
- `PrintItem` salva snapshots de `materialCost`, `energyCost`, `depreciationCost`, `laborCost`, `baseCost`, `marginAmount`, `feesTotal`, `finalPrice` e taxas aplicadas.
- `Quote.totalAmount`, `Quote.totalPrintHours` e `Quote.totalWeightGrams` sao derivados da soma das mesas vinculadas ao orcamento; `Quote.paintingHours` e `Quote.finishingHours` pertencem ao projeto/orcamento como dados de pos-processamento.
- `Company.planType`, `Company.subscriptionStatus`, `maxMachinesAllowed`, `maxMaterialsAllowed`, `maxQuotesPerMonth` e `currentQuotesCount` compoem o estado de assinatura usado pelos middlewares de plano.
- `AuditLog` e `SystemError` usam `companyId`, `actorUserId` e `targetUserId` como referencias logicas para consultas e filtros, sem bloquear exclusoes futuras por FK nesta fase MVP.
- Indices de relatorio foram adicionados em `Quote.createdAt`, `Quote.companyId/status/createdAt`, `PrintItem.machineId/createdAt` e `PrintItem.materialId/createdAt`.

## Security Flow

- Registro: `POST /api/auth/register` valida payload com Zod, normaliza email, aplica `bcrypt.hash` com 12 salt rounds, cria `User` e `Company` vinculada em uma operacao Prisma e retorna JWT.
- Interface de registro: `/register` coleta nome completo, email, nome da empresa, senha e confirmacao de senha; em sucesso chama `/api/auth/register`, persiste a sessao via `AuthProvider` e redireciona para `/dashboard`.
- O campo `fullName` e validado no fluxo de cadastro, mas ainda nao e persistido porque o schema Prisma atual de `User` nao possui coluna de nome; o schema atual segue `id`, `email`, `password_hash`, `role`, `created_at` e `updated_at`.
- Login: `POST /api/auth/login` valida email/senha com Zod, busca o `User`, compara senha com `bcrypt.compare` e retorna `AuthResponse` com token Bearer e dados basicos do usuario/empresa.
- JWT: token assinado com `JWT_SECRET`, expira conforme `JWT_EXPIRES_IN` e carrega `sub`, `email`, `role` e `companyId` quando existir.
- Middleware backend: `authMiddleware` valida `Authorization: Bearer <token>` e injeta `request.userId`, `request.user_id` e `request.auth` no Express Request.
- Frontend: `AuthProvider` salva token e usuario em `localStorage`, replica o token em cookie `auth_token` com `SameSite=Lax` para o guard do Next e configura o header Authorization no Axios.
- Revalidacao de sessao: no carregamento inicial, o `AuthProvider` restaura o token, mostra o usuario cacheado apenas como estado temporario e atualiza os dados reais por `GET /api/auth/me`.
- Admin UI: `/admin/users` chama `refreshUser()` antes de buscar usuarios e trata `403` da API como fonte final para exibir o aviso de acesso restrito.
- Logout: limpa `localStorage`, remove cookie `auth_token`, remove Authorization do Axios e redireciona para `/login`.
- Contas desativadas por admin sao bloqueadas no login e tambem em rotas protegidas por `accountStatusMiddleware`.

## Security Middlewares

- `helmet` fica ativo em `app.ts` com `app.disable("x-powered-by")`, ativando headers de clickjacking, MIME sniffing, referrer policy, HSTS e CSP padrao para a API.
- `express-rate-limit` foi instalado e configurado em `backend/src/middlewares/rate-limit-middleware.ts`.
- Limites ativos:
  - Global API: `100` requests por minuto por IP em `/api`.
  - Login: `5` tentativas por minuto por IP em `/api/auth/login`.
  - Calculo pesado: `30` requests por minuto por IP em `/api/calculate`, preview de formulas e criacao/edicao de orcamentos.
- Respostas de limite usam `429` com `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_LOGIN` ou `RATE_LIMIT_CALCULATION`.

## Multi-Tenancy Guard

- `MachineService`, `MaterialService`, `QuoteService` e `FormulaService` passaram a usar `updateMany/deleteMany/findFirst` com `where: { id, companyId }` nas mutacoes criticas.
- Acesso a PDF (`QuotePdfService`) tambem busca o orcamento por `{ id, companyId }`.
- `CalculationService` busca maquina/material por `{ id, companyId }` e retorna `403` quando o recurso nao pertence a empresa autenticada.
- IDs de URL em rotas admin, maquinas, materiais, orcamentos e formulas passam por `idParamSchema` com UUID estrito antes de chegar aos services.
- Vetor anulado: IDOR por troca manual de UUID em URL, como acessar `/api/quotes/:id`, `/api/machines/:id`, `/api/materials/:id`, `/api/formulas/:id` ou `/api/quotes/:id/pdf` de outra empresa.

## Input Sanity

- Schemas Zod de auth, billing, admin, maquinas, materiais, settings, calculo, formulas e orcamentos agora usam `.strict()` para rejeitar campos extras como `role`, `planType` ou `subscriptionStatus` fora dos endpoints corretos.
- Campos numericos em payload JSON usam `z.number()` em vez de `z.coerce.number()`, rejeitando strings, scripts e valores nao finitos em floats/percentuais.
- Query params continuam usando coercao controlada apenas onde o transporte HTTP exige string, como paginacao de listagem.
- `formula-engine` normaliza `{variavel}` para `variavel`, mas depois aceita somente numeros, variaveis registradas, espacos, ponto decimal e operadores `+ - * / ( )`.
- Identificadores globais perigosos (`process`, `require`, `constructor`, `eval`, `Function`, etc.) e caracteres como colchetes, aspas, crase, ponto e virgula e setas sao bloqueados antes do parse.
- Vetores anulados: injecao de JS em formulas, tentativa de chamar APIs globais do runtime, payload pollution por campos extras e strings maliciosas em campos numericos.

## Anti-Bypass Strategy

- O frontend continua apenas exibindo estados de plano; limites reais sao aplicados no backend por `requireUsageLimit` e `requirePlanFeature`.
- `role`, `planType` e `subscriptionStatus` nao sao aceitos em payloads de usuario comum por causa de schemas `.strict()` e ausencia de endpoint `PATCH /api/users/me`.
- Alteracao manual de role/plano/status permanece restrita a `/api/admin/users/:id`, protegido por `authMiddleware`, `accountStatusMiddleware`, `adminMiddleware`, UUID estrito e `adminUserUpdateSchema`.
- Upgrade/cancelamento de plano via usuario passa somente por `/api/billing`, com plano pago validado por enum e `PaymentService` mock como fronteira futura para webhook Stripe assinado.

## Subscription Architecture

- A migration `20260512190000_plans_rbac` troca o enum legado `CUSTOMER` por `USER`, adiciona `User.isActive` e inclui os campos de assinatura em `Company`.
- Planos suportados: `FREE`, `PRO` e `ENTERPRISE`.
- Status suportados: `ACTIVE`, `CANCELED` e `PAST_DUE`.
- `BillingService` centraliza os limites de plano e sincroniza `currentQuotesCount` com os orcamentos do mes corrente antes de validar ou exibir uso.
- `requireUsageLimit` valida criacao de maquinas, materiais e orcamentos mensais antes do controller executar.
- `requirePlanFeature` valida recursos pagos como formulas customizadas e exportacao PDF.
- Usuarios `ADMIN` ignoram limites de uso e features para tarefas de suporte, mas a checagem agora usa a role atual persistida no banco, nao apenas o payload do JWT.
- Promocoes manuais para `ADMIN` passam a funcionar com token antigo: `/api/auth/me`, `/api/admin/users` e os middlewares de plano refletem o estado atual do banco.
- Tokens JWT antigos com role `CUSTOMER` sao aceitos temporariamente pelo middleware e normalizados para `USER` durante a migracao.

## Plan Limits

| Plano | Maquinas | Materiais | Orcamentos/mes | Formulas customizadas | PDF |
| --- | ---: | ---: | ---: | --- | --- |
| FREE | 2 | 3 | 10 | Nao | Nao |
| PRO | Ilimitado | Ilimitado | Ilimitado | Sim | Sim |
| ENTERPRISE | Ilimitado | Ilimitado | Ilimitado | Sim | Sim |

## RBAC Matrix

| Acao | USER | ADMIN |
| --- | --- | --- |
| Usar dashboard da propria empresa | Sim | Sim |
| Criar recursos respeitando plano | Sim | Sim, sem limite |
| Criar formulas customizadas | Apenas PRO/ENTERPRISE | Sim |
| Exportar PDF | Apenas PRO/ENTERPRISE | Sim |
| Ver billing da propria empresa | Sim | Sim |
| Listar todos os usuarios | Nao | Sim |
| Alterar role, plano ou status de usuarios | Nao | Sim |

## Payment Readiness

- `PaymentService` simula checkout com status `succeeded`, `provider = mock` e `transactionId` rastreavel.
- `POST /api/billing/upgrade` usa o gateway mock e depois aplica o plano em `BillingService`.
- `POST /api/billing/cancel` rebaixa a empresa para `FREE`, marca assinatura como `CANCELED` e reaplica limites Free.
- `Company.stripeCustomerId` ja existe para vincular clientes quando a SDK do Stripe entrar.

## Analytics Logic

- `AnalyticsService` agrega dados por `companyId`, garantindo isolamento multi-tenant em todos os relatorios do usuario.
- Faturamento usa a soma dos snapshots `PrintItem.finalPrice` no periodo filtrado.
- Lucro estimado usa `max(PrintItem.finalPrice - PrintItem.baseCost, 0)`, preservando a margem efetiva calculada no momento em que o orcamento foi salvo.
- Custo base vem dos snapshots de material, energia, depreciacao e mao de obra; nenhuma mudanca posterior em maquina/material/formula altera relatorios historicos.
- Grafico mensal agrupa faturamento, lucro e custo base por `Quote.createdAt`.
- Mix de materiais agrupa peso e receita por `Material.type` vinculado aos itens salvos.
- Ocupacao de maquinas soma `estimatedPrintTimeHours` por maquina e compara com capacidade operacional padrao de 8 horas/dia por equipamento no intervalo filtrado.
- Exportacao de analytics entrega os itens brutos em CSV ou JSON por `/api/analytics/export`, respeitando o mesmo filtro de datas e `companyId`.

## Monitoring Stack

- Logs estruturados usam `pino` e `pino-http`, com niveis `info`, `warn` e `error`, redaction de `Authorization`, cookies e senhas.
- `LOG_LEVEL` controla a verbosidade no backend.
- `GET /api/health` agora verifica PostgreSQL, query financeira de calculo (`SUM(final_price - base_cost)` dos ultimos 30 dias) e escrita/leitura do filesystem temporario usado como proxy de sanidade para geracao de PDFs.
- `SystemErrorService` registra erros capturados pelo middleware global na tabela `system_errors`, incluindo stack trace, rota, metodo, status, usuario e empresa quando disponiveis.
- O frontend possui Error Boundary em `frontend/src/app/error.tsx` para falhas inesperadas de UI.

## New Schema Fields

- `PricingSettings.paintingHourRate` -> coluna `painting_hour_rate`.
- `PricingSettings.finishingHourRate` -> coluna `finishing_hour_rate`.
- `PricingSettings.errorRate` -> coluna `error_rate`.
- `Quote.paintingHours` -> coluna `painting_hours`.
- `Quote.finishingHours` -> coluna `finishing_hours`.

## Audit System

- `AuditLogService` centraliza a escrita de auditoria e captura o email do ator quando `actorUserId` esta disponivel.
- `ADMIN_USER_UPDATED` registra alteracoes de role, status de conta, plano e status de assinatura feitas em `/admin/users`.
- `BILLING_UPGRADED` e `BILLING_CANCELED` registram mudancas de plano iniciadas pelo usuario.
- `FORMULA_CREATED`, `FORMULA_CREATED_AS_DEFAULT`, `FORMULA_UPDATED`, `FORMULA_DEFAULT_CHANGED` e `FORMULA_DELETED` registram mudancas criticas no motor de precificacao.
- O painel `/admin/analytics` mostra auditoria recente e erros recentes somente para usuarios com role `ADMIN`.

## Final Status

- O MVP funcional esta completo para testes de carga e preparacao de deploy: autenticacao, multi-tenancy, recursos de producao, motor de calculo, orcamentos multi-mesa, formulas, PDF, planos/RBAC, analytics, auditoria e observabilidade estao integrados.

## Auth Flow Complete

- Registro: concluido no backend e frontend.
- Login: concluido no backend e frontend.
- Controle de acesso: concluido para `/dashboard` e subrotas.
- Navegacao publica: `/login` possui link para `/register`; `/register` possui link de retorno para `/login`.

## User-Company Relation

- No cadastro, o backend cria `User` e `Company` na mesma operacao Prisma por nested create.
- `Company.userId` e unico e garante relacao 1:1 com `User`.
- A empresa recebe `companyName` do formulario como `Company.name`, `defaultCurrency = BRL` e `taxRate = 0` por padrao.
- `PricingSettings` tambem e inicializado no cadastro para deixar a empresa pronta para os proximos calculos.

## Resource Management

- CRUD de `Machine` operacional em endpoints protegidos `/api/machines`.
- CRUD de `Material` operacional em endpoints protegidos `/api/materials`.
- Configuracoes globais de producao operacionais em `/api/settings`.
- Frontend possui `/dashboard/settings` protegido com abas funcionais para impressoras, materiais e custos fixos.
- A navegacao lateral aponta para `/dashboard/settings`, mantendo o layout persistente do dashboard.
- A interface usa modais para criacao/edicao e feedback visual em toast para salvamentos, exclusoes e erros.

## Cost Baseline

- `Machine.powerConsumptionKw` armazena consumo em kW no banco; a API recebe watts da interface e converte para kW no service.
- `Machine.depreciationCostPerHour` guarda o custo de depreciacao por hora que sera usado no motor de calculo.
- `Material.costPerGram` e calculado automaticamente a partir de `purchasePrice / totalWeightGrams`.
- A API tambem retorna `purchasePrice` calculado como `totalWeightGrams * costPerGram` para preencher a interface de edicao.
- `PricingSettings.desiredMarginPercent` guarda a margem de lucro padrao.
- `PricingSettings.technicalHourRate` guarda o valor da hora tecnica.
- `PricingSettings.paintingHourRate` guarda o token global `valor_hora_pintura`.
- `PricingSettings.finishingHourRate` guarda o token global `valor_hora_acabamento`.
- `PricingSettings.errorRate` guarda o token global `taxa_erro` como numero bruto configuravel pela empresa.
- `PricingSettings.extraFees` guarda `energyCostPerKwh`, `cardFeePercent`, `administrativeFeePercent` e `customVariables`.
- `customVariables` usa objetos `{ value, type }`, onde `type` pode ser `INTEGER`, `FLOAT` ou `PERCENTAGE`.

## Data Isolation

- Todas as queries de recursos usam `companyId` vindo de `request.auth.companyId`, preenchido pelo `authMiddleware`.
- `getAuthenticatedCompanyId` centraliza a validacao de contexto de empresa e bloqueia operacoes sem empresa vinculada.
- Services de maquinas e materiais filtram listagens por `companyId`.
- Updates e deletes executam verificacao de ownership antes de alterar ou remover registros.
- `PricingSettings` e recuperado/salvo por `companyId`, preservando uma configuracao por empresa.
- O calculo busca `Machine` e `Material` por `id + companyId`, impedindo que um usuario calcule usando recursos de outra empresa.

## Calculation Engine

- `backend/src/services/CalculationService.ts` concentra o motor de calculo.
- `calculateQuoteBreakdown` e uma funcao pura: recebe peso, tempo, contexto de orcamento, maquina, material e settings ja resolvidos e retorna o breakdown sem acessar HTTP ou banco.
- `CalculationService.calculate` e a camada de aplicacao: valida multi-tenancy, busca `Machine`, `Material` e `PricingSettings`, e chama a funcao pura.
- `POST /api/calculate` aceita payload camelCase (`weightGrams`, `printTimeHours`, `paintingHours`, `finishingHours`, `quoteItemsCount`, `machineId`, `materialId`, `formulaId`) e tambem aliases snake_case/portugues (`peso_gramas`, `tempo_horas`, `horas_pintura`, `horas_acabamento`, `quantidade_mesas`, `machine_id`, `material_id`, `formula_id`).
- O preco final agora e produzido por uma formula salva no banco; se nenhuma formula estiver disponivel ou a formula falhar em runtime, o motor usa a formula padrao do sistema.

## The Math

- `materialCost = material.costPerGram * weightGrams`.
- `energyCost = machine.powerConsumptionKw * printTimeHours * settings.energyCostPerKwh`.
- `depreciationCost = machine.depreciationCostPerHour * printTimeHours`.
- `laborCost = settings.technicalHourRate * printTimeHours`.
- Variaveis de pos-processamento nao alteram o `baseCost` padrao automaticamente; elas entram no parser para uso explicito em formulas como `(horas_pintura * valor_hora_pintura)`.
- `baseCost = materialCost + energyCost + depreciationCost + laborCost`.
- `marginAmount = baseCost * (desiredMarginPercent / 100)`.
- `subtotalWithMargin = baseCost + marginAmount`.
- `cardFeeAmount = subtotalWithMargin * (cardFeePercent / 100)`.
- `administrativeFeeAmount = subtotalWithMargin * (administrativeFeePercent / 100)`.
- Formula padrao do sistema: `finalPrice = (custo_base * (1 + margem_lucro)) + (custo_base * (1 + margem_lucro) * (taxa_cartao + taxa_administrativa))`.
- A formula de depreciacao usa `depreciationCostPerHour` porque o Bloco 4 ja normaliza o custo da maquina por hora; se o schema evoluir para custo de compra e vida util, esse campo podera ser derivado por `machineCost / usefulLifeHours`.

## Breakdown Logic

- Material: custo direto do insumo consumido pela peca.
- Energia: consumo em kW da maquina multiplicado por tempo e custo do kWh.
- Depreciacao: custo horario da maquina multiplicado pelo tempo de impressao.
- Mao de obra: valor da hora tecnica multiplicado pelo tempo de impressao.
- Margem: aplicada sobre o custo base.
- Taxas: taxa de cartao e taxa administrativa aplicadas sobre o subtotal com margem.
- Em formulas customizadas, `finalPrice` vem do resultado da expressao; `marginAmount` passa a representar a diferenca positiva entre preco final e custo base para fins de leitura no breakdown.

## Dynamic Calculation

- `backend/src/services/formula-engine.ts` encapsula normalizacao, validacao e execucao das expressoes.
- `FormulaService` garante uma formula padrao por empresa de forma lazy, usando `system_default` quando necessario.
- `CalculationService` busca `Machine`, `Material`, `PricingSettings` e `Formula` pelo mesmo `companyId` autenticado antes de calcular.
- O motor continua calculando `materialCost`, `energyCost`, `depreciationCost`, `laborCost` e `baseCost` de forma explicita; variaveis globais/dinamicas complementares sao injetadas antes do parser e a formula dinamica decide apenas o preco final.
- `QuoteService` passa `formulaId`, `paintingHours`, `finishingHours` e `quoteItemsCount` para cada mesa, salva `Quote.formulaId` e persiste snapshots por `PrintItem`, evitando que alteracoes futuras na formula mudem orcamentos antigos.

## Variable Registry

- Variaveis internas disponiveis para formulas: `peso`, `peso_gramas`, `tempo`, `tempo_horas`, `material_cost`, `energia_total`, `depreciacao_maquina`, `mao_obra`, `custo_base`, `margem_lucro`, `margem_lucro_percentual`, `valor_hora_tecnica`, `custo_kwh`, `taxa_cartao`, `taxa_administrativa`, `taxas_percentuais`, `consumo_kw`, `horas_pintura`, `valor_hora_pintura`, `horas_acabamento`, `valor_hora_acabamento`, `quantidade_mesas` e `taxa_erro`.
- Variaveis customizadas ficam em `PricingSettings.extraFees.customVariables` como mapa JSON `{ nome: { value, type } }`.
- O endpoint `GET /api/formulas/variables` retorna o registro combinado de variaveis internas e customizadas para o editor do frontend, incluindo `type`, `value` e `runtimeValue`.

## Formula Tokens Update

| Token | Origem | Tipo | Observacao |
| --- | --- | --- | --- |
| `horas_pintura` | `Quote.paintingHours` | Float | Horas estimadas para pintura no orcamento. |
| `valor_hora_pintura` | `PricingSettings.paintingHourRate` | Float | Valor por hora de pintura da empresa. |
| `horas_acabamento` | `Quote.finishingHours` | Float | Horas estimadas para acabamento/lixamento no orcamento. |
| `valor_hora_acabamento` | `PricingSettings.finishingHourRate` | Float | Valor por hora de acabamento da empresa. |
| `quantidade_mesas` | `items.length` / `PrintItem[]` | Integer | Contagem dinamica de mesas no orcamento. |
| `taxa_erro` | `PricingSettings.errorRate` | Float | Numero bruto configurado pela empresa para uso livre na formula. |

## UI Registry

- `/dashboard/settings`: a aba `Custos Fixos` exibe os campos `Hora pintura`, `Hora acabamento` e `Taxa de erro`.
- `/dashboard/quotes/new` e `/dashboard/quotes/[id]`: o formulario exibe o card `Pos-processamento` abaixo das mesas para capturar `Horas pintura` e `Horas acabamento`.
- `/dashboard/quotes/new`: novas mesas iniciam com nome, maquina, material, peso e tempo em branco; maquina/material mostram placeholders ate o usuario selecionar recursos.
- `/dashboard/quotes/new` e `/dashboard/quotes/[id]`: o resumo acumulado soma apenas previews validos e trata mesas incompletas como valor zero durante a edicao.
- `/dashboard/settings/formulas`: a lista de variaveis disponiveis passa a listar os seis novos tokens do Bloco 8.3 quando o usuario cria ou edita uma formula.
- `/dashboard/settings`: modais `Nova Maquina`, `Editar Maquina`, `Novo Material` e `Editar Material` agora mantem inputs/selects dentro do container e quebram grades de tres colunas em telas estreitas.

## UI State Fix

- `QuoteForm` nao preenche mais valores arbitrarios como `Modelo 3D`, `120 g`, `4 h` ou a primeira maquina/material disponivel para uma nova mesa.
- Inputs numericos de nova mesa e pos-processamento iniciam como string vazia na UI; `numberFromInput` interpreta vazio como `0` apenas para soma e preview.
- O botao de salvar permanece desabilitado ate todas as mesas terem nome, maquina, material, peso e tempo validos.

## Calculation Fallback

- `CalculationService` normaliza `undefined`, `null`, string vazia e valores nao finitos para `0` antes de criar `Prisma.Decimal` e antes de injetar variaveis no parser.
- `POST /api/calculate` passou a aceitar `weightGrams/peso_gramas` e `printTimeHours/tempo_horas` ausentes ou zero para suportar previews parciais, mantendo `machineId` e `materialId` obrigatorios.
- `horas_pintura`, `horas_acabamento` e `quantidade_mesas` tambem recebem fallback seguro para preservar compatibilidade com as variaveis operacionais do Bloco 8.3.

## Bug Resolution Log

- Erro corrigido: React alertava que um input estava mudando de uncontrolled para controlled em `frontend/src/app/dashboard/settings/page.tsx`.
- Causa raiz: campos novos de `ProductionSettings` podiam chegar `undefined` em respostas antigas/intermediarias, fazendo o `NumberField` receber `value={undefined}` e depois um numero.
- Solucao: `normalizeSettings()` mescla qualquer payload de settings com `defaultSettings`, e o `NumberField` usa `safeValue = 0` quando recebe valor nao finito.

## Type System

- `INTEGER`: valores sem casas decimais; o frontend bloqueia ponto e virgula no campo e o backend rejeita inteiros com decimal.
- `FLOAT`: valores decimais comuns, usados como custo, quantidade ou coeficiente livre.
- `PERCENTAGE`: o usuario informa o percentual em formato humano, como `15`; o backend injeta `0.15` no parser.
- Valores legados salvos como numero puro ainda sao aceitos e normalizados como `FLOAT`.
- `ProductionSettings.customVariables` e `CalculationAppliedRates.customVariables` agora compartilham o tipo `CustomVariableMap`.

## Validation Logic

- O backend normaliza tags como `{peso}` para `peso` antes de validar a expressao.
- O parser usa `expr-eval` com acesso a membros desativado e operadores de atribuicao, comparacao, condicional, logica, `in`, aleatorio e definicao de funcao bloqueados.
- Identificadores perigosos como `console`, `require`, `process`, `window`, `globalThis`, `constructor`, `prototype`, `eval`, `Function` e `__proto__` sao recusados antes do parse.
- Ao salvar uma formula, o backend faz dry run com valores ficticios e variaveis customizadas reais; formulas com sintaxe invalida, variaveis desconhecidas ou resultado negativo/nao-finito nao sao persistidas.
- Em runtime, se uma formula customizada falhar, `CalculationService` cai automaticamente para a formula padrao do sistema e marca `formula.source = SYSTEM_FALLBACK` na resposta.
- `POST /api/formulas/preview` usa o mesmo parser seguro para testar uma expressao ainda nao salva com valores ficticios enviados pela UI.
- Variaveis `PERCENTAGE` sao convertidas em `value / 100` antes da avaliacao, tanto no preview quanto no calculo real.

## UI Overhaul

- `/dashboard/settings/formulas` agora inicia em modo biblioteca, com formulas salvas em cards independentes e acoes explicitas de edicao.
- Editor, variaveis disponiveis e teste de formula aparecem somente quando o usuario clica em "Nova formula" ou "Editar".
- O modo de edicao usa grid isolado: variaveis em um painel scrollavel separado, editor/teste no painel principal e nenhum bloco sobreposto.
- Variaveis de sistema usam destaque azul; variaveis customizadas usam destaque violeta.
- Cada variavel exibe badge de tipo (`Int`, `Float`, `%`) e tooltip com a descricao.
- Clique em uma variavel insere `{nome_da_variavel}` na posicao atual do cursor da formula.
- O editor ganhou foco visual, leitura colorida simples da equacao e alert vermelho abaixo do campo quando o parser encontra erro.
- A secao "Teste de formula" chama `/api/formulas/preview` em tempo real e mostra o resultado com valores ficticios configuraveis.
- O CRUD de variaveis customizadas agora possui coluna de tipo e valida Integer no frontend antes do envio.

## Calculation Precision

- O motor usa `Prisma.Decimal` em todas as operacoes monetarias internas para evitar erro de ponto flutuante.
- Valores monetarios sao arredondados apenas na saida para 2 casas decimais com `ROUND_HALF_UP`.
- Campos tecnicos como `costPerGram` e watts podem ser retornados com mais casas para preservar rastreabilidade.
- Nenhuma etapa usa `eval()` ou `new Function()`; formulas sao avaliadas somente pelo parser matematico restrito.

## Quote Lifecycle

- Fluxo principal: `DRAFT` (Rascunho) -> `SENT` (Enviado) -> `APPROVED` (Aprovado) ou `REJECTED` (Rejeitado).
- `DRAFT`: orcamento em preparacao, ainda editavel.
- `SENT`: proposta enviada ao cliente.
- `APPROVED`: cliente aprovou a proposta e o orcamento pode alimentar analytics e producao.
- `REJECTED`: cliente recusou ou a proposta expirou comercialmente.
- O backend permite mudar status via `PATCH /api/quotes/:id`; validacoes de transicao mais restritas ficam como evolucao futura de regra de negocio.

## Persistence Logic

- `POST /api/quotes` recebe cliente, validade, horas de pos-processamento e itens tecnicos, chama `CalculationService.calculate` no backend para cada mesa e so entao persiste `Quote` e `PrintItem`.
- `PATCH /api/quotes/:id` altera status/dados comerciais; quando item tecnico, formula ou horas de pos-processamento mudam, recalcula e atualiza snapshots.
- `GET /api/quotes` lista por `companyId`, com paginacao e filtro opcional por status.
- `GET /api/quotes/:id` retorna detalhes completos com snapshots e nomes atuais de maquina/material.
- `DELETE /api/quotes/:id` remove fisicamente o orcamento; `PrintItem` e removido em cascata.
- Todas as operacoes de orcamento usam `companyId` do JWT e bloqueiam acesso a dados de outra empresa.

## UI Updates

- `/dashboard`: visao geral protegida com KPIs de orcamentos do mes, taxa de conversao, lucro estimado por snapshots e impressora mais usada.
- `/dashboard/quotes`: listagem protegida com cliente, item, data, valor total, status e acoes.
- `/dashboard/quotes/new`: formulario protegido de criacao com live preview via `/api/calculate` e card de pos-processamento para pintura/acabamento.
- `/dashboard/quotes/[id]`: formulario protegido de edicao reutilizando os mesmos campos da criacao.
- `/dashboard/settings`: aba de custos fixos possui `valor_hora_pintura`, `valor_hora_acabamento` e `taxa_erro`.
- `/dashboard/settings/formulas`: biblioteca protegida de formulas; editor, tags de variaveis clicaveis e preview aparecem sob demanda em modo criar/editar.
- `/dashboard/settings/formulas`: mantem CRUD de variaveis customizadas tipadas em card separado de custos fixos.
- `/dashboard/analytics`: BI financeiro protegido com faturamento vs lucro, mix de materiais, ocupacao de maquinas e export CSV/JSON.
- `/dashboard/billing`: plano atual, barras de uso, upgrade mock para Pro, cancelamento e placeholder de faturas.
- `/admin/analytics`: painel ADMIN com usuarios ativos, MRR estimado, planos, erros recentes e auditoria recente.
- `/admin/users`: tabela administrativa para alterar role, plano, status da assinatura e ativacao da conta.
- `QuoteForm` agora possui seletor de formula e pos-processamento; o live preview envia `formulaId`, `horas_pintura`, `horas_acabamento` e `quantidade_mesas` para `/api/calculate` em cada mesa.
- Sidebar agora aponta para `/dashboard`, `/dashboard/quotes`, `/dashboard/quotes/new`, `/dashboard/calculator`, `/dashboard/analytics`, `/dashboard/settings/formulas`, `/dashboard/billing`, `/dashboard/settings`, `/admin/analytics` e `/admin/users` quando o usuario e `ADMIN`.

## UI Components Library

- `Card`: superficie padrao para secoes, KPIs e blocos de configuracao.
- `StatusBadge`: badges semanticos para `DRAFT`, `SENT`, `APPROVED` e `REJECTED`.
- `EmptyState`: estado vazio reutilizavel com icone Lucide, texto curto e CTA opcional.
- `Skeleton` e `SkeletonText`: placeholders de carregamento para tabelas, cards e listas.
- `ToastViewport`: notificacoes flutuantes para sucesso, erro e informacao, usadas em salvamento/exclusao de orcamentos.
- `Recharts`: componentes de barras e rosca usados em `/dashboard/analytics` e `/admin/analytics`.
- `Error Boundary`: `frontend/src/app/error.tsx` exibe recuperacao amigavel para falhas inesperadas de UI.
- `Sidebar`: navegacao colapsavel no desktop e drawer no mobile, com icones Lucide e destaque por rota ativa.
- `MainLayout`: coordena Header, Sidebar e offset responsivo quando a navegacao esta expandida ou colapsada.

## Navigation Map

- `/dashboard`: home operacional com KPIs, atividade recente e health status da API.
- `/dashboard/quotes`: central de orcamentos com busca por cliente, filtro por status, metricas filtradas e tabela responsiva.
- `/dashboard/quotes/new`: criacao de orcamento multi-mesa com preview agregado e CTA para configurar recursos ausentes.
- `/dashboard/quotes/[id]`: edicao de orcamento existente reutilizando o fluxo multi-mesa e acao de download PDF.
- `/dashboard/calculator`: simulador tecnico do motor de calculo.
- `/dashboard/analytics`: BI financeiro da empresa autenticada com graficos e exports.
- `/dashboard/settings`: configuracoes de producao, maquinas, materiais e custos fixos.
- `/dashboard/settings/formulas`: biblioteca de formulas, editor sob demanda, variaveis do sistema no modo de edicao e variaveis customizadas tipadas.
- `/dashboard/billing`: painel de assinatura e consumo da empresa autenticada.
- `/admin/analytics`: observabilidade, MRR mock, erros e auditoria para `ADMIN`.
- `/admin/users`: administracao global de usuarios, roles e planos.
- `/login`: entrada publica.
- `/register`: cadastro publico com criacao automatica de empresa.

## UX Improvements

- Dashboard principal agora deriva indicadores de `/api/quotes` e dos snapshots de `PrintItem`, evitando numeros estaticos.
- Listagem de orcamentos ganhou busca por cliente, filtro por status, cards de resumo filtrado e empty state com CTA.
- Formulario de orcamento ganhou feedback visual para recursos ausentes e resumo acumulado com transicao suave durante recalculos.
- Toasts substituem alertas persistentes para acoes de sucesso/erro, reduzindo ruido visual apos salvar ou excluir.
- Skeletons evitam telas vazias durante carregamento de dados do backend.
- Sidebar colapsavel reduz friccao em telas densas e preserva acesso rapido a cada modulo central.
- A paleta Slate/Zinc + Indigo/Violet unifica contraste, foco e hierarquia visual em todo o dashboard.
- Sidebar corrigida para layout em coluna (`flex-col`), mantendo logo, botao de recolher, navegacao e card MVP dentro da area lateral.
- Erros de download PDF agora extraem mensagens reais de respostas `blob`, inclusive quando a API antiga retorna HTML/JSON em vez de PDF.
- Campos de novo orcamento e calculadora receberam grids com `min-w-0`, `overflow-hidden` e colunas menos agressivas para impedir que selects/inputs invadam cards vizinhos.
- A tela de formulas removeu o editor do estado inicial, deixando variaveis disponiveis escondidas ate o modo de edicao para reduzir esforco cognitivo.
- A sidebar agora mostra o modulo Admin somente para `ADMIN`, reduzindo descoberta indevida de areas restritas.
- Billing usa barras de progresso por limite para deixar claro quando o plano Free esta proximo de bloquear novas criacoes.

## Export Engine

- PDFs sao gerados no backend por `backend/src/services/quote-pdf.service.ts` usando `pdfkit`.
- O endpoint protegido `GET /api/quotes/:id/pdf` busca o `Quote` por `id + companyId`, incluindo `Company`, `User`, `Formula`, `Machine`, `Material` e `PrintItem`.
- A resposta e enviada como `application/pdf` com `Content-Disposition: attachment`.
- A geracao e deterministica no servidor, entao o arquivo fica consistente em desktop, tablet ou qualquer navegador.

## PDF Template

- Fonte padrao: Helvetica, com estilo minimalista e hierarquia clara.
- Branding: destaque Indigo no cabecalho, linha principal e tabela; quando `Company.logoUrl` contem data URI de imagem, o logo e renderizado; caso contrario, o documento usa um monograma da empresa.
- Cabecalho: nome da empresa, contato pelo email do usuario, CNPJ/CPF como "nao informado" ate o schema ganhar esses campos, status e numero curto do orcamento.
- Dados do cliente: nome do cliente, data de emissao e validade.
- Tabela de mesas: peca, quantidade, material, maquina, peso/tempo e valor unitario/final de cada `PrintItem`.
- Resumo financeiro: subtotal, descontos em zero no MVP e valor total em destaque, sempre formatado em BRL.
- Rodape: termos de garantia, prazo estimado sujeito a confirmacao e observacoes comerciais basicas.

## File Management

- PDFs nao sao persistidos em disco nem em storage nesta fase.
- O backend cria o documento em memoria (`Buffer`) e descarta apos enviar a resposta HTTP.
- O frontend baixa o blob recebido e nomeia o arquivo como `Orcamento_#ID_NomeDoCliente.pdf`.
- Uma evolucao futura pode salvar versoes assinadas ou publicas em storage quando houver portal do cliente.

## Architecture Change

- O modelo saiu de "Orcamento Simples" para "Orcamento Multi-Itens".
- `Quote` passou a atuar como container comercial e financeiro.
- Cada mesa de impressao e um `PrintItem` independente, com seu proprio `machineId`, `materialId`, peso, tempo e breakdown de custos.
- O endpoint `POST /api/quotes` agora aceita `items[]`; aliases legados `item`, `printItems` e `tables` tambem sao normalizados pelo validator para preservar compatibilidade durante a transicao.
- `PATCH /api/quotes/:id` substitui o conjunto de mesas quando recebe `items[]`, recalculando todos os snapshots.

## Aggregation Logic

- Para cada mesa, o backend chama `CalculationService.calculate(companyId, item)`.
- O valor final do orcamento e `SUM(item.finalPrice)` de todas as mesas.
- `totalPrintHours` e `SUM(item.printTimeHours)`.
- `totalWeightGrams` e `SUM(item.weightGrams)`.
- Cada mesa pode usar maquina e material diferentes; a agregacao soma resultados ja normalizados pelo motor de calculo.
- A listagem de orcamentos retorna `itemsCount`, `totalPrintHours`, `totalWeightGrams` e `totalAmount` para dar visao consolidada sem recalcular no frontend.

## Print Table UX

- O `QuoteForm` agora possui um gerenciador dinamico de mesas.
- Usuario pode adicionar/remover mesas antes de salvar.
- Cada card de mesa possui nome da peca, maquina, material, peso e tempo.
- O frontend recalcula previews por mesa via `/api/calculate` e mostra um rodape com peso total, horas totais e preco final acumulado.
- O seletor de formula no formulario aplica a mesma equacao a todas as mesas do orcamento, mantendo o calculo granular por mesa antes da soma.
- A edicao reutiliza o mesmo componente e carrega as mesas existentes do orcamento.

## Environment Variables

- `DATABASE_URL`: conexao PostgreSQL usada pelo Prisma.
- `JWT_SECRET`: segredo longo e aleatorio para assinar tokens; obrigatorio em producao.
- `JWT_EXPIRES_IN`: tempo de expiracao do token, atualmente `7d`.
- `CORS_ORIGIN`: origens permitidas para o frontend (`localhost` e `127.0.0.1` em desenvolvimento).
- `PORT`: porta da API, padrao `3001`.

## Protected Routes

- Backend publicas: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/health`.
- Backend protegidas: `GET /api/auth/me`, `/api/machines`, `/api/materials`, `/api/settings`, `/api/formulas`, `POST /api/calculate`, `/api/quotes`, `/api/billing`, `/api/analytics` e `GET /api/quotes/:id/pdf` via `authMiddleware`.
- Backend admin: `/api/admin/users` e `/api/admin/analytics` exigem `authMiddleware`, conta ativa e `adminMiddleware`.
- Frontend publicas: `/login`, `/register`.
- Frontend protegidas: `/dashboard`, `/dashboard/settings`, `/dashboard/settings/formulas`, `/dashboard/analytics`, `/dashboard/billing`, `/dashboard/calculator`, `/dashboard/quotes`, `/admin/analytics`, `/admin/users` e subrotas por `src/proxy.ts`, baseado no cookie `auth_token`.

## Route Map

- `POST /api/auth/register`: cria usuario, empresa e configuracao inicial de preco.
- `POST /api/auth/login`: autentica credenciais e retorna JWT.
- `GET /api/auth/me`: retorna usuario autenticado quando o Bearer token e valido.
- `GET /api/billing`: retorna plano, status, limites, uso e features da empresa autenticada.
- `POST /api/billing/upgrade`: simula pagamento e aplica `PRO` ou `ENTERPRISE`.
- `POST /api/billing/cancel`: cancela a assinatura e rebaixa limites para `FREE`.
- `GET /api/analytics/overview`: retorna resumo financeiro, grafico mensal, mix de materiais e ocupacao de maquinas da empresa autenticada.
- `GET /api/analytics/export`: exporta itens brutos de orcamentos da empresa autenticada em CSV ou JSON por periodo.
- `GET /api/admin/analytics`: retorna metricas globais, MRR mock, erros e auditoria; exige `ADMIN`.
- `GET /api/admin/users`: lista usuarios, empresas, planos e uso; exige `ADMIN`.
- `PATCH /api/admin/users/:id`: altera role, ativacao, plano e status de assinatura; exige `ADMIN`.
- `GET /api/machines`: lista impressoras da empresa autenticada.
- `POST /api/machines`: cria impressora para a empresa autenticada.
- `PUT /api/machines/:id`: edita impressora somente quando pertence a empresa autenticada.
- `DELETE /api/machines/:id`: remove impressora somente quando pertence a empresa autenticada e nao esta em uso por orcamentos.
- `GET /api/materials`: lista materiais da empresa autenticada.
- `POST /api/materials`: cria material para a empresa autenticada calculando custo por grama.
- `PUT /api/materials/:id`: edita material somente quando pertence a empresa autenticada.
- `DELETE /api/materials/:id`: remove material somente quando pertence a empresa autenticada e nao esta em uso por orcamentos.
- `GET /api/settings`: recupera configuracoes de custo da empresa autenticada.
- `PUT /api/settings`: salva margem, hora tecnica, energia, taxas e variaveis customizadas tipadas da empresa autenticada.
- `GET /api/formulas`: lista formulas da empresa autenticada e garante a formula padrao do sistema.
- `GET /api/formulas/variables`: lista variaveis internas e customizadas disponiveis para o editor.
- `POST /api/formulas/preview`: executa uma expressao em tempo real com valores ficticios e conversao de percentuais.
- `POST /api/formulas`: valida, executa dry run e cria formula para a empresa autenticada.
- `PUT /api/formulas/:id`: valida, executa dry run e atualiza formula da empresa autenticada.
- `DELETE /api/formulas/:id`: remove formula customizada da empresa autenticada; a formula padrao do sistema nao pode ser excluida.
- `POST /api/calculate`: calcula breakdown de custo e preco sugerido usando maquina, material, settings e formula da empresa autenticada.
- `GET /api/quotes`: lista orcamentos da empresa autenticada com paginacao e filtro por status.
- `POST /api/quotes`: calcula e salva um orcamento com uma ou mais mesas e snapshots de custos.
- `GET /api/quotes/:id`: retorna detalhes completos de um orcamento da empresa autenticada.
- `GET /api/quotes/:id/pdf`: gera e baixa o PDF profissional do orcamento da empresa autenticada.
- `PATCH /api/quotes/:id`: atualiza dados comerciais, status ou lista de mesas recalculadas.
- `DELETE /api/quotes/:id`: remove um orcamento da empresa autenticada.
- `/register`: pagina publica de cadastro.
- `/login`: pagina publica de entrada.
- `/dashboard`: pagina protegida por cookie `auth_token`, com KPIs, atividade recente e status da API.
- `/dashboard/settings`: pagina protegida para gestao de maquinas, materiais e custos fixos.
- `/dashboard/settings/formulas`: pagina protegida para gestao de formulas e variaveis customizadas.
- `/dashboard/analytics`: pagina protegida de analytics financeiro com graficos e export.
- `/dashboard/billing`: pagina protegida para plano e faturamento da empresa.
- `/admin/analytics`: pagina protegida para observabilidade e metricas globais de ADMIN.
- `/admin/users`: pagina protegida por token e restringida a `ADMIN` pela API.
- `/dashboard/calculator`: pagina protegida de simulacao em tempo real do motor de calculo.
- `/dashboard/quotes`: pagina protegida de listagem de orcamentos com acao de download PDF por linha.
- `/dashboard/quotes/new`: pagina protegida para criar orcamento multi-mesa.
- `/dashboard/quotes/[id]`: pagina protegida para editar orcamento multi-mesa e baixar PDF.

## Pendencias (Tech Debt/Next Steps)

- MVP pronto para testes de carga e preparacao de deploy.
- Proxima prioridade pos-MVP: hardening de deploy, seeds, testes automatizados e observabilidade externa.
- Preparacao para deploy segue pendente:
  - revisar variaveis de ambiente;
  - padronizar seed/migracoes;
  - definir estrategia de deploy do frontend, backend e PostgreSQL.
- Evoluir proposta PDF:
  - adicionar CNPJ/CPF, telefone e endereco no schema de `Company`;
  - permitir termos comerciais customizados por empresa;
  - criar preview in-app antes do download.
- Evoluir analytics para graficos historicos mais profundos:
  - comparativo ano contra ano;
  - margem por material/maquina;
  - funil temporal detalhado de enviados, aprovados e rejeitados.
- Expandir validacao com Zod para os proximos CRUDs e calculos.
- Criar testes unitarios para services e testes de integracao para rotas Express.
- Criar testes automatizados para o parser de formulas, incluindo variaveis desconhecidas, fallback e dry run.
- Evoluir RBAC granular por permissao quando houver multiplos usuarios por empresa.
- Monitorar o aviso moderado do `npm audit --omit=dev` em `next -> postcss`: o projeto usa Next `16.2.6`, que e a versao mais recente consultada, mas ainda empacota `postcss@8.4.31`; o fix automatico sugerido pelo npm faria downgrade inadequado para Next 9.

## Validacao

- `npm install` executado com sucesso e `package-lock.json` gerado.
- `npm run lint` executado com sucesso para `shared`, `backend` e `frontend`.
- `npm run build` executado com sucesso para `shared`, `backend` e `frontend`.
- `prisma generate` e `prisma validate` executados com sucesso para o schema relacional do bloco 2.
- `npx prisma migrate deploy` executado com sucesso e aplicou `20260512161000_dynamic_formulas`.
- `npm --workspace @3d-budget/shared run build`, `npm --workspace @3d-budget/backend run build` e `npm --workspace @3d-budget/frontend run build` executados com sucesso apos o Bloco 8.
- `npm run lint` executado com sucesso para `shared`, `backend` e `frontend` apos o Bloco 8.
- Apos o ajuste final em `FormulaService`, `npm --workspace @3d-budget/backend run lint` e `npx tsc -p tsconfig.json --noEmit` foram executados com sucesso; o build completo do backend nao foi repetido porque a API ativa em `3001` mantinha o DLL do Prisma bloqueado para `prisma generate`.
- Build Next validado com `/dashboard/settings/formulas` listado no mapa de rotas.
- Smoke test da API de formulas validado em porta temporaria `3011`: register, create machine/material/settings, create formula, calculate com `formulaId` e create quote retornaram status `200/201`.
- Bloco 8.1 validado com `npm --workspace @3d-budget/shared run build`, `npx tsc -p tsconfig.json --noEmit`, `npm --workspace @3d-budget/frontend run build` e `npm run lint`.
- Smoke test tipado validado em porta temporaria `3012`: `PERCENTAGE` customizado `15` foi injetado como `0.15` no preview e no calculo real; formula customizada retornou `finalPrice = 64.68`.
- Bloco 9 validado com `npm --workspace @3d-budget/frontend run lint` e `npm --workspace @3d-budget/frontend run build`.
- Navegador local validou `/dashboard` autenticado com KPIs, atividade recente e status da API.
- Navegador local validou `/dashboard/quotes` com busca por cliente, filtro por status e empty state.
- Navegador local validou `/dashboard/quotes/new` com alerta de recursos ausentes e resumo acumulado multi-mesa.
- Bloco 10 validado com `npm --workspace @3d-budget/backend run lint`, `npx tsc -p backend/tsconfig.json --noEmit`, `npm --workspace @3d-budget/frontend run lint` e `npm --workspace @3d-budget/frontend run build`.
- Smoke test do PDF validado em API temporaria na porta `3014`: register, machine, material, settings, quote multi-mesa e `GET /api/quotes/:id/pdf` retornaram `200 application/pdf` com assinatura `%PDF`.
- `npm audit --workspace @3d-budget/backend --omit=dev` indica 1 vulnerabilidade alta herdada de `expr-eval`, ja existente no motor de formulas e sem fix automatico disponivel; `pdfkit` nao adicionou novo alerta de producao.
- Correcao pos-Bloco 10 validada com `npm --workspace @3d-budget/frontend run lint` e `npm --workspace @3d-budget/frontend run build`.
- Backend local em `3001` foi reiniciado com `npm --workspace @3d-budget/backend run dev` porque estava executando `dist/server.js` antigo sem a rota de PDF.
- Smoke test em `3001` confirmou `GET /api/quotes/:id/pdf` com `200 application/pdf`, assinatura `%PDF` e arquivo `Orcamento_...pdf`.
- Navegador local abriu `/dashboard/settings/formulas` e confirmou redirecionamento protegido para `/login` quando nao ha sessao.
- Endpoints de auth validados sem dependencia de banco: `POST /api/auth/register` com payload invalido retorna `400`; `GET /api/auth/me` sem token retorna `401`.
- Guard frontend validado em desenvolvimento: `GET /dashboard` sem cookie `auth_token` retorna `307` para `/login?next=%2Fdashboard`.
- Build Next validado com `/register` prerenderizado e listado no mapa de rotas.
- Build Next validado com `/dashboard/settings` prerenderizado e listado no mapa de rotas.
- Build Next validado com `/dashboard/calculator` prerenderizado e listado no mapa de rotas.
- Build Next validado com `/dashboard/quotes`, `/dashboard/quotes/new` e `/dashboard/quotes/[id]` listados no mapa de rotas.
- Endpoints protegidos de recursos validados: chamadas sem token para `/api/machines`, `/api/materials` e `/api/settings` retornam `401`.
- Fluxo API de recursos validado com usuario autenticado: register, create/list/update/delete de maquina, create/list/update/delete de material e update de settings.
- Fluxo API de calculo validado com usuario autenticado: maquina 120 W, depreciacao 3/h, material 100 BRL por 1000 g, peso 100 g, tempo 2 h, kWh 1, hora tecnica 20, margem 30%, taxa cartao 5% e taxa administrativa 2% retornou `finalPrice = 78.23`.
- Fluxo API de orcamentos validado com usuario autenticado: create/list/show/patch status/delete, status `DRAFT -> SENT`, `totalAmount = 78.23`, snapshot `materialCost = 10` e `laborCost = 40`.
- Fluxo API de mesas validado com usuario autenticado: dois `PrintItem` no mesmo `Quote` retornaram `items = 2`, `totalAmount = 117.34`, `totalPrintHours = 3` e `totalWeightGrams = 150`.
- `GET /api/health` validado: retorna `200` quando `DATABASE_URL` aponta para PostgreSQL valido; retorna `503 degraded` quando o banco local recusa credenciais.
- `/dashboard` validado no navegador local: layout renderiza e o card de API mostra `degradado` com PostgreSQL `sem sinal`.
- Ajuste de layout pos-polimento validado com `npm --workspace @3d-budget/frontend run lint` e `npm --workspace @3d-budget/frontend run build`.
- Navegador local autenticado validou `/dashboard/settings/formulas`: sem editor/variaveis no estado inicial e com editor, variaveis disponiveis e teste apos acionar "Nova formula".
- Navegador local autenticado validou `/dashboard/quotes/new` e `/dashboard/calculator` carregando os controles principais sem redirecionamento para login.
- Bloco 11 validado com `npm --workspace @3d-budget/shared run build`, `npm --workspace @3d-budget/backend run lint`, `npm --workspace @3d-budget/backend run build`, `npm --workspace @3d-budget/frontend run lint` e `npm --workspace @3d-budget/frontend run build`.
- Apos compatibilidade de tokens legados `CUSTOMER -> USER`, `npm --workspace @3d-budget/backend run lint`, `npx tsc -p backend/tsconfig.json --noEmit` e `npm --workspace @3d-budget/backend run build` passaram.
- `npx prisma validate` executado com sucesso no backend e `npx prisma migrate deploy` aplicou `20260512190000_plans_rbac` no PostgreSQL local.
- Smoke test RBAC/planos validou: empresa nova inicia em `FREE`, limite de maquinas `2`, terceira maquina retorna `PLAN_LIMIT_REACHED`, `/api/admin/users` retorna `ADMIN_REQUIRED` para usuario comum, upgrade mock retorna `succeeded` e plano `PRO` libera novo cadastro.
- Navegador local validou `/dashboard/billing` renderizando o painel de plano e `/admin/users` renderizando a tela administrativa com aviso de acesso restrito para usuario comum.
- Correcao Admin/RBAC validada com `npm --workspace @3d-budget/frontend run lint`, `npm --workspace @3d-budget/backend run lint`, `npx tsc -p backend/tsconfig.json --noEmit` e `npm --workspace @3d-budget/frontend run build`.
- Backend local reiniciado em `3001` apos a correcao; `GET /api/health` retornou `200` com PostgreSQL conectado.
- Smoke test Admin/RBAC validou usuario registrado como `USER`, promovido manualmente para `ADMIN` no banco e usando o token antigo: `GET /api/auth/me` retornou `ADMIN`, `GET /api/admin/users` liberou a listagem e o terceiro cadastro de maquina passou pelo bypass ADMIN.
- Navegador local validou `/admin/users` apos reload: o aviso de acesso restrito deixou de aparecer e a tabela "Base de usuarios" carregou 16 contas para o usuario promovido.
- Bloco 12 instalou `pino`, `pino-http`, `node-cache` e `recharts`.
- `npx prisma migrate deploy` aplicou `20260512212000_analytics_observability` com `audit_logs`, `system_errors` e indices de relatorio.
- `npm --workspace @3d-budget/shared run build`, `npm --workspace @3d-budget/backend run lint`, `npm --workspace @3d-budget/backend run build`, `npm --workspace @3d-budget/frontend run lint`, `npm --workspace @3d-budget/frontend run build` e `npm --workspace @3d-budget/backend exec prisma validate` executados com sucesso apos o Bloco 12.
- Health avancado validado em `3001`: PostgreSQL conectado, query financeira `ok` e filesystem `writable`.
- Smoke test Analytics validou register, `GET /api/analytics/overview`, `GET /api/analytics/export?format=json` e `GET /api/admin/analytics` com usuario promovido para `ADMIN`; todos retornaram `200`.
- Navegador local validou `/dashboard/analytics` renderizando estado vazio com filtros e export desabilitado quando nao ha dados no periodo.
- Navegador local validou `/admin/analytics` renderizando KPIs globais, MRR estimado e sem aviso de acesso restrito para usuario ADMIN.
- `npm audit --omit=dev` apos o Bloco 12 ainda aponta alertas ja conhecidos: `expr-eval` sem fix automatico e `next -> postcss` com sugestao de downgrade quebrante para Next 9.
- Bloco 8.3 validado com `npm --workspace @3d-budget/shared run build`, `npm --workspace @3d-budget/backend run lint`, `npm --workspace @3d-budget/backend run build`, `npm --workspace @3d-budget/frontend run lint`, `npm --workspace @3d-budget/backend exec -- prisma validate` e `npm --workspace @3d-budget/frontend run build`.
- `npx prisma migrate deploy` aplicou `20260515153000_operational_formula_variables` no PostgreSQL local.
- Smoke test direto do `CalculationService` confirmou injecao de `horas_pintura`, `valor_hora_pintura`, `horas_acabamento`, `valor_hora_acabamento`, `quantidade_mesas` e `taxa_erro` no parser.
- Correcao de estado inicial/preview validada com `npm --workspace @3d-budget/frontend run lint`, `npm --workspace @3d-budget/backend run lint`, `npm --workspace @3d-budget/shared run build`, `npm --workspace @3d-budget/frontend run build` e `npm --workspace @3d-budget/backend exec -- tsc -p tsconfig.json --noEmit`.
- Smoke test do validador de calculo confirmou que `POST /api/calculate` normaliza `weightGrams` e `printTimeHours` omitidos para `0` quando maquina/material validos sao informados.
- Bloco 13 validado com `npm --workspace @3d-budget/backend run lint`, `npm --workspace @3d-budget/backend exec -- tsc -p tsconfig.json --noEmit`, `npm --workspace @3d-budget/backend run build`, `npm --workspace @3d-budget/frontend run build` e `npm --workspace @3d-budget/shared run build`.
- Smoke tests de seguranca confirmaram rejeicao de numero como string em calculo, bloqueio de `role` injetado no registro, bloqueio de `process` em formula e bloqueio de colchetes na expressao.
- Smoke test real de rate limit em servidor Express temporario confirmou `/api/auth/login`: cinco tentativas invalidas retornaram `400` e a sexta retornou `429`; a resposta incluiu headers Helmet como `x-frame-options`, `x-content-type-options` e CSP.
- `npm audit --workspace @3d-budget/backend --omit=dev` continua apontando vulnerabilidade alta conhecida em `expr-eval` sem fix automatico; o Bloco 13 adicionou whitelist de caracteres, tokens permitidos e operadores restritos como mitigacao em runtime.

## Mapa de Dependencias

- `frontend` depende de:
  - `backend` via HTTP em `NEXT_PUBLIC_API_URL` ou no host atual do navegador na porta `3001`.
  - `shared` para tipos TypeScript compartilhados.
  - `recharts` para graficos de analytics e painel Admin.
- `backend` depende de:
  - PostgreSQL via Prisma usando `DATABASE_URL`.
  - `shared` para contratos de resposta comuns.
  - Prisma schema como fonte de verdade para entidades de negocio, precificacao e orcamentos.
  - `bcryptjs`, `jsonwebtoken` e `zod` para autenticacao e validacao.
  - `authMiddleware` para injetar `companyId` antes dos controllers protegidos.
  - `accountStatusMiddleware` para bloquear contas desativadas.
  - `adminMiddleware` para rotas globais de administracao.
  - `BillingService` para limites de plano, features pagas e uso mensal.
  - `PaymentService` mock como adaptador futuro para Stripe.
  - `AnalyticsService` para agregacoes financeiras, export CSV/JSON e metricas globais.
  - `AuditLogService` para rastrear acoes sensiveis de admin, billing e formulas.
  - `SystemErrorService` para persistir erros capturados pelo middleware global.
  - `node-cache` para cache em memoria de analytics com TTL curto.
  - `pino` e `pino-http` para logs estruturados e redaction de credenciais.
  - `helmet` e `express-rate-limit` para headers defensivos e protecao contra brute-force/DoS.
  - `Prisma.Decimal` para precisao monetaria no motor de calculo.
  - `expr-eval` para interpretar formulas matematicas com parser restrito.
  - `pdfkit` para gerar PDFs server-side em memoria.
  - `CalculationService` como fonte obrigatoria de valores antes de salvar `Quote`.
  - `FormulaService` para validar, versionar e selecionar formulas por empresa.
  - `SettingsService.customVariablesToRuntimeValues` para converter variaveis customizadas tipadas antes do parser.
  - `PrintItem[]` como fonte granular para agregacao de totais em `Quote`.
- `Quote.paintingHours` e `Quote.finishingHours` alimentam variaveis de pos-processamento; `PricingSettings.paintingHourRate`, `finishingHourRate` e `errorRate` alimentam variaveis globais de formula.
- `shared` nao depende de frontend, backend ou banco; ele deve permanecer livre de runtime especifico.
- `Machine`, `Material` e `PricingSettings` pertencem a `Company`; `CalculationService` consome esses dados pelo mesmo `companyId` autenticado.
- `Company` tambem e a fonte de verdade de assinatura: `planType`, `subscriptionStatus`, limites e `currentQuotesCount` alimentam backend e frontend de Billing.

## Log de Criacao

- CRIADO: `package.json` raiz com workspaces e scripts agregadores.
- CRIADO: `.gitignore` raiz do monorepo.
- CRIADO: `frontend/package.json`, `backend/package.json` e `shared/package.json`.
- CRIADO: configuracoes TypeScript, Tailwind, PostCSS, ESLint e Next.js.
- CRIADO: estrutura base Express, middlewares, rotas, controllers e services.
- CRIADO: schema Prisma inicial.
- CRIADO: dashboard Next.js em `/dashboard` com layout persistente.
- ATUALIZADO: fallback de API e CORS para aceitar `localhost` e `127.0.0.1` em desenvolvimento.
- ATUALIZADO: `allowedDevOrigins` no Next para permitir validacao local por `127.0.0.1`.
- ATUALIZADO: schema Prisma para o modelo relacional completo de orcamentos 3D.
- CRIADO: `backend/src/config/prisma.ts` como singleton canonico do Prisma Client.
- CRIADO: endpoints `POST /api/auth/register`, `POST /api/auth/login` e `GET /api/auth/me`.
- CRIADO: `backend/src/middlewares/auth-middleware.ts` para validacao de JWT.
- CRIADO: validadores Zod para registro e login.
- CRIADO: `frontend/src/contexts/AuthContext.tsx`, pagina `/login` e guard `frontend/src/proxy.ts`.
- CRIADO: pagina `/register` e componente `RegisterForm` com validacao client-side e vinculo com `/api/auth/register`.
- ATUALIZADO: tela de login com link para cadastro.
- ATUALIZADO: `.env.example` e `.env` local com `JWT_SECRET` e `JWT_EXPIRES_IN`.
- CRIADO: controllers, routes, validators e services para maquinas, materiais e configuracoes de producao.
- CRIADO: `backend/src/utils/request-auth.ts` para centralizar recuperacao segura do `companyId`.
- CRIADO: pagina `/dashboard/settings` com abas de impressoras, materiais e custos fixos.
- ATUALIZADO: `shared/src/index.ts` com contratos de `Machine`, `Material` e `ProductionSettings`.
- ATUALIZADO: sidebar do dashboard com link direto para configuracoes de producao.
- CRIADO: `backend/src/services/CalculationService.ts` com funcao pura de calculo e service de busca multi-tenant.
- CRIADO: endpoint protegido `POST /api/calculate` com validacao Zod.
- CRIADO: pagina `/dashboard/calculator` para simulacao em tempo real com breakdown de custos.
- ATUALIZADO: `shared/src/index.ts` com contratos de `CalculationRequest` e `CalculationResponse`.
- ATUALIZADO: sidebar do dashboard com link direto para calculadora.
- CRIADO: migration `20260512122000_quote_lifecycle_snapshots` para status de orcamento e snapshots em `print_items`.
- CRIADO: controllers, routes, validators e services para `/api/quotes`.
- CRIADO: paginas `/dashboard/quotes`, `/dashboard/quotes/new` e `/dashboard/quotes/[id]`.
- CRIADO: componente `QuoteForm` reutilizado para criacao e edicao.
- ATUALIZADO: `shared/src/index.ts` com contratos de `Quote`, `QuoteItemSnapshot`, `QuotePayload` e status workflow.
- ATUALIZADO: sidebar do dashboard com link direto para gestao de orcamentos.
- CRIADO: migration `20260512140000_quote_multi_items_totals` para `total_print_hours` e `total_weight_grams` em `quotes`.
- ATUALIZADO: `/api/quotes` para aceitar multiplas mesas em `items[]` e recalcular cada uma separadamente.
- ATUALIZADO: `QuoteForm` com gerenciador dinamico de mesas, add/remove e resumo agregado.
- ATUALIZADO: listagem de orcamentos para exibir quantidade de mesas, peso total e horas totais.
- CRIADO: migration `20260512161000_dynamic_formulas` para `Formula.isDefault` e `Quote.formulaId`.
- CRIADO: `backend/src/services/formula-engine.ts` com parser seguro, validacao, dry run e fallback.
- CRIADO: `backend/src/services/formula.service.ts`, `formula.controller.ts`, `formula.routes.ts` e `formula.validator.ts`.
- ATUALIZADO: `CalculationService` para executar formulas salvas no banco sem `eval()` ou `new Function()`.
- ATUALIZADO: `QuoteService` para salvar `formulaId` e recalcular mesas com a formula selecionada.
- CRIADO: pagina `/dashboard/settings/formulas` com editor, tags de variaveis e variaveis customizadas.
- ATUALIZADO: `QuoteForm` com seletor de formula aplicado ao preview e ao salvamento do orcamento.
- ATUALIZADO: `shared/src/index.ts` com contratos de `FormulaResource`, `FormulaPayload`, `FormulaVariable` e campos de formula em calculos/orcamentos.
- ATUALIZADO: este `CONTEXT.md` com o motor de formulas dinamicas, registry de variaveis e validacao segura.
- ATUALIZADO: `/dashboard/settings/formulas` com layout em duas colunas, badges de tipo, tooltips, leitura colorida da equacao e teste de formula em tempo real.
- ATUALIZADO: `ProductionSettings.customVariables` para suportar `INTEGER`, `FLOAT` e `PERCENTAGE`.
- CRIADO: endpoint `POST /api/formulas/preview` para validar expressoes sem persistir.
- ATUALIZADO: `CalculationService` para injetar percentuais customizados como taxa decimal.
- ATUALIZADO: `tailwind.config.ts` e `globals.css` com paleta Slate/Zinc + Indigo/Violet para o polimento visual final.
- CRIADO: `EmptyState`, `Skeleton`, `SkeletonText` e `ToastViewport` como componentes globais de UX.
- ATUALIZADO: `Sidebar` e `MainLayout` com navegacao desktop colapsavel e drawer mobile.
- ATUALIZADO: `/dashboard` com KPIs reais, atividade recente e dados agregados por snapshots.
- ATUALIZADO: `/dashboard/quotes` com busca por cliente, filtro por status, skeletons, empty state e toasts.
- ATUALIZADO: `QuoteForm` com transicao suave no valor acumulado, aviso de recursos ausentes e feedback via toast.
- INSTALADO: `pdfkit` e `@types/pdfkit` no backend para exportacao server-side de PDF.
- CRIADO: `backend/src/services/quote-pdf.service.ts` com template minimalista de proposta.
- CRIADO: endpoint protegido `GET /api/quotes/:id/pdf`.
- CRIADO: `frontend/src/lib/download-quote-pdf.ts` para baixar o blob do PDF com nome padronizado.
- ATUALIZADO: `/dashboard/quotes` e `QuoteForm` com botoes "Gerar PDF".
- CORRIGIDO: `Sidebar` com `flex-col` para impedir que o botao de recolher e os itens de navegacao saiam da area lateral.
- ATUALIZADO: tratamento de erro do download PDF para ler payloads `blob` e informar quando o backend precisa ser reiniciado.
- ATUALIZADO: `/dashboard/settings/formulas` para exibir apenas a biblioteca no estado inicial e abrir editor/variaveis/teste somente em criacao ou edicao.
- CORRIGIDO: grids e campos de `/dashboard/quotes/new` e `/dashboard/calculator` para evitar sobreposicao de selects e inputs numericos entre cards.
- CRIADO: migration `20260512190000_plans_rbac` com `UserRole.USER`, `User.isActive`, `SubscriptionPlan`, `SubscriptionStatus` e limites em `Company`.
- CRIADO: `BillingService`, `PaymentService`, `AdminService`, `accountStatusMiddleware`, `adminMiddleware` e `plan-middleware`.
- CRIADO: endpoints `/api/billing`, `/api/billing/upgrade`, `/api/billing/cancel`, `/api/admin/users` e `PATCH /api/admin/users/:id`.
- ATUALIZADO: rotas de maquinas, materiais, orcamentos, PDF e formulas para respeitar limites/features do plano.
- CRIADO: pagina `/dashboard/billing` com plano atual, uso, upgrade mock e cancelamento.
- CRIADO: pagina `/admin/users` para administracao de usuarios, roles, planos e status.
- ATUALIZADO: `Sidebar` e `proxy.ts` para incluir Billing e Admin Users com protecao apropriada.
- CORRIGIDO: `AuthProvider` para revalidar usuario em `/api/auth/me` e atualizar role/empresa/status persistidos no navegador.
- CORRIGIDO: `/admin/users` para remover bloqueio client-side por role cacheada e confiar no `403` da API como autoridade de acesso.
- CORRIGIDO: `plan-middleware` para consultar a role atual do banco antes de liberar bypass ADMIN em limites/features de plano.
- INSTALADO: `pino`, `pino-http`, `node-cache` e `recharts` para observabilidade, cache e graficos.
- CRIADO: migration `20260512212000_analytics_observability` com `AuditLog`, `SystemError` e indices de relatorio.
- CRIADO: `backend/src/config/logger.ts` com logger estruturado e request logger Pino.
- CRIADO: `backend/src/services/analytics.service.ts`, `cache.service.ts`, `audit-log.service.ts` e `system-error.service.ts`.
- CRIADO: endpoints `GET /api/analytics/overview`, `GET /api/analytics/export` e `GET /api/admin/analytics`.
- ATUALIZADO: `GET /api/health` para verificar PostgreSQL, query financeira e filesystem.
- ATUALIZADO: middleware global de erros para persistir `SystemError` e emitir logs estruturados.
- ATUALIZADO: Admin, Billing e Formula services/controllers para registrar `AuditLog`.
- CRIADO: paginas `/dashboard/analytics` e `/admin/analytics` com graficos, skeletons e empty states.
- CRIADO: `frontend/src/app/error.tsx` como Error Boundary global.
- ATUALIZADO: `Sidebar` e `SystemStatusCard` com rotas e checks do Bloco 12.
- CRIADO: migration `20260515153000_operational_formula_variables` com campos globais em `PricingSettings` e horas de pos-processamento em `Quote`.
- ATUALIZADO: `CalculationService`, `formula-engine` e `FormulaService` para expor tokens `horas_pintura`, `valor_hora_pintura`, `horas_acabamento`, `valor_hora_acabamento`, `quantidade_mesas` e `taxa_erro`.
- ATUALIZADO: validadores de calculo/orcamento/settings para aceitar os novos campos e aliases em portugues.
- ATUALIZADO: `/dashboard/settings` com inputs globais de pintura, acabamento e taxa de erro.
- ATUALIZADO: `QuoteForm` com card de pos-processamento e envio dos novos valores para previews e persistencia.
- CORRIGIDO: `QuoteForm` para iniciar novas mesas sem valores arbitrarios, manter placeholders em selects e somar previews validos mesmo com mesas incompletas.
- CORRIGIDO: `CalculationService` e `calculation.validator` para tratar peso, tempo e horas operacionais ausentes/vazios como `0` em previews parciais.
- CORRIGIDO: `frontend/src/app/dashboard/settings/page.tsx` para normalizar `ProductionSettings` e evitar warning uncontrolled/controlled nos inputs numericos.
- INSTALADO: `express-rate-limit` no backend.
- CRIADO: `backend/src/middlewares/rate-limit-middleware.ts` com limitadores global, login e calculo.
- CRIADO: `backend/src/validators/common.validator.ts` com `idParamSchema` UUID para params de rota.
- ATUALIZADO: `app.ts`, rotas de auth/calculo/formulas/orcamentos e services multi-tenant com as travas do Bloco 13.
- ATUALIZADO: validadores Zod para schemas estritos e numeros/booleanos nao coercivos em payloads JSON.
- ATUALIZADO: `formula-engine` com whitelist de caracteres/identificadores antes do parser `expr-eval`.
- ATUALIZADO: este `CONTEXT.md` com estado, decisoes, pendencias e mapa de dependencias.
- CORRIGIDO: `frontend/src/app/dashboard/settings/page.tsx` para remover overflow lateral no modal `Nova Maquina` e padronizar campos responsivos nos modais de recursos.

## Proximo Passo

- Pos-MVP: preparar deploy, seeds, testes automatizados, monitoramento externo e testes de carga.
