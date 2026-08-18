# Auditoria Técnica — 3d-budget-saas

**Data:** 2026-08-12
**Escopo:** leitura completa de `backend/src`, `backend/prisma/schema.prisma`,
`frontend/src` (fluxo de auth + estrutura + componentes grandes),
`package.json` (raiz/backend/frontend), `.env.example`, migrações Prisma.
Nenhuma alteração de código foi feita nesta rodada — só leitura e registro.

Este arquivo é o backlog vivo da auditoria: cada item tem um ID único, uma
classificação e um **Status**. Quando o Yuri aprovar/recusar/adiar um item,
atualize o campo Status e o "Log de decisões" no final do arquivo — não crie
um arquivo de decisões separado, para não duplicar informação com
`Contextos/Decisoes.md` (que continua reservado para decisões de arquitetura
já tomadas e implementadas).

---

## Stack e arquitetura identificadas

Confirma o que já está em `CLAUDE.md`: monorepo npm workspaces
(`frontend`/`backend`/`shared`), Next.js 16 App Router + Tailwind,
Express + TypeScript + Prisma + PostgreSQL, JWT stateless (sem sessão em
banco), Zod `.strict()` em toda mutação, `expr-eval` com whitelist para
fórmulas, `pino`/`pino-http` para logs, `node-cache` para cache em memória,
`pdfkit` para PDF server-side. Camadas bem separadas: controller → service →
Prisma singleton, com `getAuthenticatedCompanyId()` centralizando o contexto
multi-tenant.

**Constatação geral:** a base de código é consistente e disciplinada — o
padrão anti-IDOR (`{ id, companyId }` em toda query/mutação, nunca `companyId`
vindo do body) foi verificado diretamente em `quote.controller.ts`,
`machine.controller.ts`, `quote.service.ts`, `machine.service.ts` e
`formula.service.ts`, e se confirma em todos eles. Não há `console.log` fora
de `server.ts` (start/shutdown), não há `any`/`as any` no backend, não há
comentários `TODO`/`FIXME` esquecidos. Zero arquivos de teste no projeto
inteiro (nenhum `*.test.ts`/`*.spec.ts` fora de `node_modules`).

---

## Achados

### 🔴 Segurança

**SEC-001 — JWT sem mecanismo de revogação server-side**
- **Severidade:** Média. **Prioridade:** P2. **Esforço:** Médio.
- **Localização:** `backend/src/config/env.ts` (`jwtExpiresIn = 7d`),
  `backend/src/services/auth.service.ts` (`signAuthToken`),
  `backend/src/middlewares/auth-middleware.ts`.
- **Causa:** autenticação é 100% stateless — nenhuma tabela de sessão/refresh
  token, nenhuma blacklist. "Logout" só limpa o client
  (`AuthContext.clearSession`).
- **Impacto:** um token vazado (dispositivo comprometido, log acidental,
  etc.) continua válido por até 7 dias mesmo após o usuário "sair". A única
  forma de revogar hoje é desativar a conta inteira
  (`accountStatusMiddleware` já cobre esse caso, mas é uma medida drástica).
- **Como corrigir (não implementar ainda):** access token de vida curta
  (ex.: 15-30 min) + refresh token opaco armazenado no banco (revogável), ou
  uma tabela `revoked_tokens`/`sessions` simples verificada no
  `authMiddleware`.
- **Status:** **Implementado (2026-08-12)**, junto com SEC-002 — ver
  `Contextos/Decisoes.md` ("Sessão/autenticação — refresh token com
  rotação") para o desenho completo. Resumo: access token curto (`15m`) +
  refresh token opaco revogável (tabela `RefreshToken`, hash SHA-256),
  rotação a cada uso com detecção de reuso (revoga a família inteira em
  caso de replay), endpoints novos `POST /api/auth/refresh`,
  `POST /api/auth/logout` (revoga 1 sessão) e `POST /api/auth/logout-all`
  (revoga todas as sessões do usuário). Validado com bateria de testes reais
  via curl (rotação, reuso tolerado dentro de 5s de graça, reuso real após
  6s revogando a família inteira incluindo tokens-irmãos, logout, logout-all)
  e no navegador (login, 2x reload mantendo sessão, logout).

**SEC-002 — Token JWT em `localStorage` + cookie não-HttpOnly**
- **Severidade:** Média (defesa em profundidade — nenhum vetor de XSS ativo
  foi encontrado nesta auditoria). **Prioridade:** P2. **Esforço:** Médio.
- **Localização:** `frontend/src/contexts/AuthContext.tsx`.
- **Causa:** o token fica em `window.localStorage` (para uso do Axios) e é
  duplicado em `document.cookie` (`SameSite=Lax`, sem `HttpOnly`) só para o
  guard `frontend/src/proxy.ts` conseguir checar presença de sessão no
  Next.js. Ambos os locais são legíveis por qualquer JavaScript rodando na
  página.
- **Impacto:** se um XSS surgir no futuro (nenhum `dangerouslySetInnerHTML`
  foi encontrado hoje — grep limpo em `frontend/src`), o token seria
  imediatamente exfiltrável. Hoje é um gap de defesa em profundidade, não uma
  vulnerabilidade explorável isoladamente.
- **Como corrigir (não implementar ainda):** mover o token para um cookie
  `HttpOnly` + `Secure` setado pelo backend, e adaptar `proxy.ts`/Axios para
  não depender de JS para ler o token (exigiria adicionar proteção CSRF, já
  que cookie HttpOnly com `SameSite=Lax` reduz mas não elimina CSRF em
  requisições `GET`/navegação). Mudança arquitetural relacionada a **SEC-001**
  — vale decidir as duas juntas.
- **Status:** **Implementado (2026-08-12)**, junto com SEC-001 — ver
  `Contextos/Decisoes.md`. O refresh token vive só num cookie `HttpOnly`
  (nunca em `document.cookie`/`localStorage`); o access token vive só em
  memória no React (`AuthContext`), nunca persistido. `localStorage` mantém
  apenas o perfil do usuário (não-sensível) como cache de UI. CSRF via
  `SameSite=Lax` foi considerado suficiente para essa API (só aceita JSON,
  sem endpoints que aceitem submissão de formulário HTML cross-site) — não
  foi adicionado token CSRF dedicado. Validado no navegador: `document.cookie`
  vazio e `localStorage` sem nenhum token, em qualquer momento da sessão.

**SEC-003 — `POST /api/auth/register` sem rate limit dedicado + enumeração de e-mail**
- **Severidade:** Baixa/Média. **Prioridade:** P2. **Esforço:** Pequeno.
- **Localização:** `backend/src/routes/auth.routes.ts`,
  `backend/src/services/auth.service.ts` (`EMAIL_ALREADY_EXISTS`, 409).
- **Causa:** só `/api/auth/login` usa `loginRateLimiter`; `/register` só tem
  o limite global (100 req/min/IP). A resposta 409 diferenciada para e-mail
  já cadastrado permite a um atacante descobrir quais e-mails têm conta.
- **Impacto:** permite criação de contas em massa (abuso de recursos, spam) e
  enumeração de usuários cadastrados.
- **Como corrigir:** aplicar um rate limiter dedicado (ex.: 5-10/min/IP,
  igual ao padrão do login) em `/register`; considerar resposta genérica no
  registro (aceitar sempre e avisar por e-mail se já existir) — mudança de UX
  que precisa de aprovação, já que hoje o frontend mostra a mensagem
  specifica ao usuário.
- **Status:** **Implementado (2026-08-12)** — só a parte do rate limiter.
  Criado `registerRateLimiter` (5/min/IP, mesmo padrão do login) em
  `backend/src/middlewares/rate-limit-middleware.ts` e aplicado em
  `POST /api/auth/register` (`backend/src/routes/auth.routes.ts`). A
  enumeração de e-mail via 409 **não foi alterada** — continua pendente de
  decisão por ser mudança de UX/comportamento visível ao usuário.

**SEC-004 — `GET /api/health` vaza detalhes internos para chamadas públicas**
- **Severidade:** Baixa. **Prioridade:** P2. **Esforço:** Pequeno.
- **Localização:** `backend/src/services/health.service.ts`.
- **Causa:** a rota é pública (sem `authMiddleware`) e retorna, quando um
  check falha, `error: <mensagem bruta do driver do PostgreSQL>` e, sempre,
  o `path` do diretório temporário do servidor (`tmpdir()`).
- **Impacto:** vazamento de informação de infraestrutura (versão/mensagens do
  driver do banco, layout de filesystem do servidor) para qualquer chamador
  não autenticado — útil para reconhecimento por um atacante.
- **Como corrigir:** manter o `status` (ok/degraded) público, mas só incluir
  `error`/`path` detalhados quando a chamada vier autenticada como ADMIN, ou
  quando `NODE_ENV !== "production"`.
- **Status:** **Implementado (2026-08-12)** — optou-se pela variante mais
  simples das duas sugeridas (gate por `NODE_ENV`, sem exigir autenticação
  admin na rota pública). `backend/src/services/health.service.ts` só inclui
  `error`/`path` quando `env.nodeEnv !== "production"`. `path` virou opcional
  em `HealthCheckResponse["filesystem"]` (`shared/src/index.ts`) — validado
  que o frontend (`SystemStatusCard.tsx`) nunca lê `path`/`error`, só
  `latencyMs`. Testado manualmente: em dev o `path` aparece; com
  `NODE_ENV=production` o campo some da resposta.

**SEC-005 — Sem recuperação de senha nem verificação de e-mail**
- **Severidade:** Média (funcional, mas com efeito de segurança/suporte).
  **Prioridade:** P1. **Esforço:** Médio (depende de decidir um provedor de
  e-mail transacional, que o projeto ainda não tem).
- **Localização:** `backend/src/routes/auth.routes.ts` (endpoints
  inexistentes), `backend/src/services/auth.service.ts`.
- **Causa:** o fluxo de auth só tem registro/login/`me`. Não existe
  `forgot-password`/`reset-password`, nem confirmação de e-mail no cadastro.
- **Impacto:** usuário que esquece a senha fica **permanentemente** sem
  acesso à própria conta (não há admin de suporte para redefinir senha via
  UI, só troca direta no banco). Também não há garantia de que o e-mail
  cadastrado é válido/pertence ao usuário.
- **Como corrigir:** endpoint de solicitação de reset com token de uso único
  e expiração curta, envio por e-mail (Resend/SendGrid/SES — decisão em
  aberto), e tela de redefinição no frontend. **Bloqueado** até escolher o
  provedor de e-mail.
- **Status:** **Implementado (2026-08-15)** — provedor escolhido: Resend.
  Fluxo completo de `forgot-password`/`reset-password` com token opaco de
  uso único (mesmo padrão de segurança do refresh token — só o hash SHA-256
  é gravado, expiração de 30min), telas no frontend
  (`/forgot-password`/`/reset-password`). `RESEND_API_KEY` real e domínio
  `pricify3d.com` verificado no Resend confirmados em produção em
  2026-08-18. Ver `Contextos/Decisoes.md` (2026-08-15) e
  `Notas/TODO.md`. Verificação de e-mail no cadastro (a outra metade
  original do achado) **continua não implementada** — não fazia parte do
  pedido que motivou a implementação de 2026-08-15.

**SEC-006 — `trust proxy` não configurado no Express**
- **Severidade:** Baixa hoje / Média quando for a produção. **Prioridade:**
  P2. **Esforço:** Pequeno.
- **Localização:** `backend/src/app.ts`.
- **Causa:** `express-rate-limit` usa `req.ip` por padrão. Sem
  `app.set("trust proxy", ...)`, ao colocar o backend atrás de um reverse
  proxy (Nginx, já é um item do `Notas/TODO.md`), `req.ip` passa a resolver
  sempre para o IP do proxy — todo o tráfego compartilharia o mesmo balde de
  rate limit (ou, se configurado errado, um `X-Forwarded-For` malicioso
  poderia ser confiado sem validação).
- **Impacto:** rate limiting por IP deixa de funcionar corretamente assim que
  o Nginx planejado entrar em produção, silenciosamente.
- **Como corrigir:** configurar `app.set("trust proxy", 1)` (ou o número de
  hops correto) quando o proxy reverso for definido — depende da decisão de
  deploy ainda pendente (ver `Notas/TODO.md`).
- **Status:** **Implementado (2026-08-13)** — resolvido de forma
  configurável em vez de esperar a decisão de deploy: novo
  `TRUST_PROXY_HOPS` (default `0`) em `backend/src/config/env.ts`;
  `backend/src/app.ts` só chama `app.set("trust proxy", n)` quando `n > 0`,
  preservando o comportamento padrão do Express (`false`, não confia em
  proxy nenhum) quando a variável não é definida — zero mudança de
  comportamento hoje. Quando o Nginx entrar em produção, basta setar
  `TRUST_PROXY_HOPS=1`. Validado com um script isolado que importa `app.ts`
  duas vezes (com e sem a env var) e confirma `app.get("trust proxy")` ===
  `false` por padrão e `=== 1` com `TRUST_PROXY_HOPS=1`. A mesma técnica
  (`X-Forwarded-For` + `TRUST_PROXY_HOPS=1`) também acabou sendo reusada
  nos testes de integração de `TEST-001` para simular múltiplos clientes e
  não esbarrar no rate limit de registro.

**SEC-007 — CORS permite `origin: true` com `credentials: true` se `CORS_ORIGIN=*`**
- **Severidade:** Baixa (não é o comportamento hoje — `CORS_ORIGIN` default é
  `localhost`/`127.0.0.1`). **Prioridade:** P3. **Esforço:** Pequeno.
- **Localização:** `backend/src/app.ts` (linha do `cors({ origin:
  allowedOrigins.includes("*") ? true : allowedOrigins, credentials: true
  })`), `backend/src/config/env.ts`.
- **Causa:** o código permite que, se alguém setar `CORS_ORIGIN=*` em
  produção (configuração plausível por engano), o servidor reflita `true`
  (qualquer origem) com `credentials: true` — a combinação clássica insegura
  de CORS.
- **Impacto:** nenhum hoje; é uma armadilha de configuração futura.
- **Como corrigir:** validar em `env.ts` e recusar subir (ou logar erro
  crítico) se `corsOrigin` contiver `*` e a aplicação depender de
  `credentials: true`.
- **Status:** **Implementado (2026-08-12)** — `env.ts` agora lança erro no
  boot (`resolveCorsOrigin()`) se `CORS_ORIGIN` contiver `*`, já que
  `credentials: true` é incondicional em `app.ts`. `app.ts` foi simplificado
  para usar sempre `origin: allowedOrigins` (removido o ramo morto que
  refletia `true` para qualquer origem). Validado com `tsc --noEmit`, build
  completo do backend, e teste manual real: `CORS_ORIGIN=* npx tsx
  src/server.ts` derruba o processo imediatamente com a mensagem de erro
  esperada.

**SEC-008 — Campos de texto livre sem limite máximo de caracteres**
- **Severidade:** Baixa. **Prioridade:** P3. **Esforço:** Pequeno.
- **Localização:** `backend/src/validators/resources.validator.ts`
  (`machineSchema.name`, `materialSchema.brand`/`color`),
  `backend/src/validators/auth.validator.ts` (`fullName`, `companyName`).
- **Causa:** esses campos têm `.min()` mas não `.max()`; no schema Prisma são
  `String` sem `@db.VarChar(n)`, ou seja, mapeiam para `text` sem limite no
  Postgres. (Por comparação, `quote.validator.ts` já usa `.max()` em
  `customerName`/`modelName`, e `formula-engine.ts` limita a expressão a 600
  caracteres — o padrão existe, só não foi aplicado uniformemente.)
- **Impacto:** permite gravar strings arbitrariamente grandes nesses campos
  (abuso de armazenamento, payloads desnecessariamente grandes).
- **Como corrigir:** adicionar `.max()` razoável (ex.: 120-200 caracteres) a
  esses campos, no mesmo padrão já usado em `quote.validator.ts`.
- **Status:** **Implementado (2026-08-12)** — adicionados limites em
  `backend/src/validators/resources.validator.ts`
  (`machineSchema.name` ≤120, `materialSchema.brand` ≤120,
  `materialSchema.color` ≤60) e `backend/src/validators/auth.validator.ts`
  (`fullName` ≤160, `companyName` ≤160). Testado manualmente: registro com
  `fullName` de 300 caracteres retorna `400 VALIDATION_ERROR` citando o
  limite de 160.

### 🗄️ Banco de dados / ⚡ Performance

**DB-001 — Cache de analytics é invalidado globalmente, não por empresa**
- **Prioridade:** P2. **Esforço:** Médio.
- **Localização:** `backend/src/services/cache.service.ts` (`flush()`
  chama `flushAll()`), usado em `machine.service.ts`, `material.service.ts`,
  `quote.service.ts`, `formula.service.ts`.
- **Causa:** toda mutação de qualquer recurso em qualquer empresa chama
  `cacheService.flush()`, que limpa **todo** o cache do processo — inclusive
  o cache de analytics de outras empresas e o cache global do Admin
  (`admin-analytics:global`).
- **Impacto:** com múltiplas empresas ativas, uma empresa criando
  orçamentos com frequência invalida repetidamente o cache de todas as
  outras, reduzindo o TTL efetivo do cache a quase zero em uso real — o
  cache deixa de cumprir seu propósito (reduzir carga no banco) na maior
  parte do tempo.
- **Como corrigir:** invalidar só as chaves relevantes (`company-analytics:
  <companyId>:*`) em vez de `flushAll()`; manter `flushAll()`/invalidação
  separada só para o cache admin quando fizer sentido (ex.: mudança de
  plano).
- **Dependência:** nenhuma — pode ser feito isoladamente.
- **Status:** **Implementado (2026-08-12)** — `CacheService.delByPrefix()`
  (novo método em `cache.service.ts`) remove só as chaves que começam com
  `company-analytics:<companyId>:` (via `cache.keys().filter().del()` do
  `node-cache`). `machine.service.ts`, `material.service.ts` e
  `quote.service.ts` trocaram `cacheService.flush()` por
  `cacheService.delByPrefix(companyAnalyticsCacheKeyPrefix(companyId))` nos
  3 métodos de mutação de cada um (9 pontos ao todo). `admin-analytics:global`
  não é mais afetado por mutações de empresa — continua só na TTL própria
  (10 min) ou nos `cacheService.del("admin-analytics:global")` já existentes
  em `audit-log.service.ts`/`system-error.service.ts`, que não foram
  tocados. Validado com um smoke test real ponta a ponta: criar um
  orçamento e consultar `/api/analytics/overview` logo em seguida já
  reflete o novo `revenue`/`quotesCount` (sem esperar a TTL de 5 min),
  confirmando que a invalidação por prefixo funciona.

### ⚡ Performance

**PERF-001 — Fan-out de queries repetidas por mesa em orçamentos multi-item**
- **Prioridade:** P2. **Esforço:** Médio.
- **Localização:** `backend/src/services/quote.service.ts`
  (`create`/`update` chamam `calculationService.calculate` uma vez por
  item via `Promise.all`), `backend/src/services/CalculationService.ts`
  (`calculate` busca `machine`, `material`, `settings`, `formula` — e
  `formula.service.ts.getFormulaForCalculation` roda `ensureDefaultFormula`,
  que pode fazer `findFirst`/`create`/`updateMany` adicionais).
- **Causa:** `settings` e `formula` são os mesmos para todas as mesas de um
  mesmo orçamento, mas são buscados (e potencialmente escritos, via
  `ensureDefaultFormula`) uma vez **por mesa**. Um orçamento com 10 mesas
  dispara ~10x mais round-trips ao banco do que o necessário para essas duas
  entidades.
- **Impacto:** não é um bug funcional (o resultado está correto), mas é
  custo desnecessário de banco que cresce linearmente com o número de mesas
  por orçamento — relevante se orçamentos grandes (muitas mesas) se tornarem
  comuns.
- **Como corrigir:** buscar `settings`/`formula` uma vez por chamada de
  `QuoteService.create`/`update` e passar como parâmetro para
  `CalculationService.calculate` (que teria uma variante que recebe esses
  dados já resolvidos), mantendo só `machine`/`material` por item.
- **Status:** **Implementado (2026-08-12)** — `CalculationService` ganhou
  `calculateWithResolvedContext(companyId, input, settings, formula)`, que
  só busca `machine`/`material` (por item); `calculate()` (usado por
  `POST /api/calculate`, item único) continua exatamente como antes,
  buscando as 4 entidades em paralelo — **não foi alterado** para não
  regredir a latência desse endpoint. `QuoteService` ganhou um método
  privado `calculateItems()` que busca `settings`/`formula` **uma vez** por
  chamada de `create`/`update` e reusa para todas as mesas via
  `calculateWithResolvedContext`. Validado com smoke test real: orçamento
  de 2 mesas (mesma máquina/material) retornou os mesmos valores que antes
  da mudança (`finalPrice` de cada item e `totalAmount` batendo com a soma
  esperada), confirmando que o resultado não mudou — só o número de
  queries.

**PERF-002 — `GET /api/quotes/:id/pdf` sem rate limit dedicado**
- **Prioridade:** P3. **Esforço:** Pequeno.
- **Localização:** `backend/src/routes/quote.routes.ts`.
- **Causa:** geração de PDF (via `pdfkit`, síncrono/CPU-bound durante o
  render) só está protegida pelo limite global (100 req/min/IP), diferente
  de `/calculate` e `PATCH /quotes/:id`, que usam `calculationRateLimiter`
  (30/min).
  - **Impacto:** um usuário autenticado (dentro da própria empresa) pode
  gerar PDFs repetidamente em volume mais alto que as demais operações
  pesadas, consumindo CPU do servidor.
- **Como corrigir:** aplicar `calculationRateLimiter` (ou um limiter
  dedicado) também em `GET /:id/pdf`.
- **Status:** **Implementado (2026-08-12)** — `calculationRateLimiter`
  (30/min/IP, já usado em `/calculate` e `PATCH /quotes/:id`) aplicado
  também em `GET /quotes/:id/pdf` (`quote.routes.ts`). Validado com smoke
  test real: a rota continua respondendo normalmente (passou pelo limiter
  sem bloquear tráfego normal; recebeu `403 PLAN_FEATURE_UNAVAILABLE` da
  checagem de plano em seguida, como esperado para uma empresa FREE).

### 🏗️ Arquitetura

**ARCH-001 — Cache em memória não é compartilhável entre instâncias**
- **Prioridade:** P2 (só relevante quando houver escala horizontal — hoje o
  projeto roda em uma única instância local). **Esforço:** Médio.
- **Localização:** `backend/src/services/cache.service.ts` (`node-cache`).
- **Causa:** `node-cache` guarda tudo na memória do processo Node atual.
- **Impacto:** se o deploy futuro escalar o backend para múltiplas réplicas
  (ex.: atrás de um load balancer), cada réplica terá seu próprio cache
  dessincronizado, e uma mutação processada por uma réplica não invalida o
  cache das demais — usuários podem ver dados desatualizados por até o TTL
  (5-10 min) dependendo de qual réplica os atende.
- **Como corrigir:** trocar por um cache compartilhado (Redis é o candidato
  natural) **quando** a decisão de escalar horizontalmente for tomada.
- **Dependência:** relacionado a **DB-001** (mesmo componente) e bloqueado
  pela decisão de estratégia de deploy (`Notas/TODO.md`) — não faz sentido
  implementar antes de saber se/como o backend vai escalar.
- **Status:** Pendente de decisão (baixa urgência).

### 🧹 Qualidade de código

**QUAL-001 — `QuoteForm.tsx` é um componente grande demais (879 linhas)**
- **Prioridade:** P3. **Esforço:** Médio.
- **Localização:** `frontend/src/components/quotes/QuoteForm.tsx`.
- **Causa:** mistura estado do formulário inteiro, chamadas de API
  (preview via `/api/calculate` por mesa), lógica de agregação de totais e
  toda a renderização (mesas, pós-processamento, seletor de fórmula) em um
  único arquivo/componente.
- **Impacto:** dificulta manutenção e leitura; qualquer mudança pequena em
  uma seção do formulário exige entender o arquivo inteiro.
- **Como corrigir:** extrair subcomponentes (ex.: `PrintItemCard`,
  `PostProcessingCard`, `QuoteSummary`) e/ou um hook `useQuoteForm` para o
  estado e as chamadas de API, mantendo `QuoteForm` como orquestrador.
- **Status:** **Implementado (2026-08-13)** — exatamente o desenho acima.
  `QuoteForm.tsx` caiu de ~950 para 213 linhas (só JSX de orquestração).
  Novos arquivos em `frontend/src/components/quotes/`:
  `quote-form-types.ts` (tipos `PrintTableFormState`/`QuoteFormState`),
  `QuoteFormFields.tsx` (`TextField`/`SelectField`/`NumberField`/
  `SummaryLine`, primitivos reaproveitados pelos cards),
  `PrintItemCard.tsx` (card de mesa, antigo `PrintTableCard` inline),
  `PostProcessingCard.tsx` (card de pintura/acabamento),
  `QuoteSummary.tsx` (aside com valor acumulado, resumo e botões
  salvar/PDF), `useQuoteForm.ts` (todo o estado, `loadInitialData`,
  `calculatePreview` debounced, `handleSubmit`, `handleDownloadPdf`).
  Escopo deliberadamente restrito a `QuoteForm.tsx` — `settings/page.tsx` e
  `calculator/page.tsx` têm campos locais com nomes parecidos
  (`TextField`/`SelectField`/`NumberField`) mas **não foram tocados**, para
  não expandir o raio da mudança além do que foi pedido. Validado com
  `npm run lint` + `next build` (type-check completo) e teste real no
  navegador: criar orçamento com 1 mesa (preview calculado, salvo,
  aparece na listagem), abrir em modo edição (dados carregados
  corretamente via `toFormState`), adicionar e remover mesa, botão "Gerar
  PDF" aparecendo só quando há `savedQuote` — tudo idêntico ao
  comportamento anterior ao refactor.

**QUAL-002 — Dependência morta: `morgan`/`@types/morgan`**
- **Prioridade:** P4. **Esforço:** Pequeno.
- **Localização:** `backend/package.json`.
- **Causa:** o logging HTTP migrou para `pino`/`pino-http` (confirmado —
  `morgan` não aparece em nenhum import de `backend/src`), mas as
  dependências não foram removidas do `package.json`.
- **Impacto:** nenhum funcional; peso morto na árvore de dependências e
  confusão para quem ler o `package.json`.
- **Como corrigir:** `npm uninstall morgan @types/morgan --workspace
  @3d-budget/backend`.
- **Status:** **Implementado (2026-08-13)** — dependência removida
  (`npm uninstall morgan @types/morgan --workspace @3d-budget/backend`);
  grep confirmou zero referências restantes. `npm audit` caiu de 9 para 8
  vulnerabilidades (uma delas vinha de `morgan`).

**QUAL-003 — `FormulaService.create` não trata conflito de código concorrente**
- **Prioridade:** P3. **Esforço:** Pequeno.
- **Localização:** `backend/src/services/formula.service.ts`
  (`createCode`/`create`).
- **Causa:** `createCode` verifica unicidade do `code` (slug do nome) com um
  loop de `findFirst` sequenciais antes de criar. Entre o `findFirst` final
  e o `create`, duas requisições concorrentes criando fórmulas que gerem o
  mesmo slug podem colidir na constraint `@@unique([companyId, code])`. Ao
  contrário de `authService.register` (que trata `P2002` explicitamente),
  `formulaService.create` deixaria esse erro subir como 500 genérico.
- **Impacto:** baixo (janela de corrida estreita, e o erro não corrompe
  dados — só retorna uma mensagem ruim ao usuário nesse caso raro).
- **Como corrigir:** capturar `Prisma.PrismaClientKnownRequestError` com
  `code === "P2002"` em `FormulaService.create` e converter para um
  `AppError` de negócio, no mesmo padrão de `auth.service.ts`.
- **Status:** **Implementado (2026-08-12)** — `FormulaService.create`
  (`backend/src/services/formula.service.ts`) agora envolve a transação em
  `try/catch`; em `P2002` retorna `409 FORMULA_CODE_CONFLICT` com mensagem
  pedindo para tentar de novo, em vez de deixar subir como `500`. Validado
  por leitura de código e `tsc --noEmit`/build — não foi montado um teste de
  concorrência real (exigiria duas requisições simultâneas contra um banco
  vivo), então a cobertura aqui é de tipo/compilação, não de execução da
  race condition em si.

### 🧪 Testes

**TEST-001 — Zero testes automatizados no projeto inteiro**
- **Prioridade:** P1. **Esforço:** Grande.
- **Localização:** projeto inteiro (nenhum `*.test.ts`/`*.spec.ts` fora de
  `node_modules`, nenhuma config de Jest/Vitest/Playwright).
- **Causa:** nunca foi configurado um runner de testes.
- **Impacto:** nenhuma rede de segurança para mudanças futuras nas partes
  mais sensíveis do sistema: `CalculationService`/`formula-engine`
  (matemática financeira e parser de expressões), `QuoteService` (snapshots
  e transações), `BillingService` (limites de plano), as políticas
  multi-tenant (`{ id, companyId }`), e o parser de fórmulas (segurança —
  ver `Contextos/Conhecimento.md`, vetores já fechados manualmente, sem
  teste de regressão automatizado).
- **Já registrado** em `Notas/TODO.md` como pendência; entra aqui para
  priorização formal dentro do backlog de auditoria.
- **Como corrigir:** configurar Vitest (mais leve, já compatível com
  TypeScript/ESM do projeto) para o backend, começando por
  `formula-engine.ts` (parser/segurança) e `CalculationService.ts`
  (matemática), depois testes de integração das rotas Express
  (multi-tenancy, planos). Testes de frontend/E2E são uma fase posterior.
- **Status:** **Parcialmente implementado (2026-08-13)** — só a primeira
  fase do "como corrigir" acima (a que foi explicitamente escrita como
  ponto de partida). Vitest configurado no backend
  (`backend/vitest.config.mts`, script `npm run test` → `vitest run`).
  42 testes novos em dois arquivos:
  `backend/src/services/formula-engine.test.ts` (37 testes — normalização
  de `{variavel}`, lista de variáveis disponíveis, todos os identificadores
  perigosos bloqueados, caracteres não suportados, expressão desconhecida,
  sintaxe inválida, avaliação com resultado negativo/não-finito rejeitada,
  dry run, a fórmula padrão do sistema é ela mesma válida) e
  `backend/src/services/CalculationService.test.ts` (5 testes — bate contra
  o cenário histórico conhecido do Bloco 5 com `finalPrice = 78.23`,
  arredondamento de moeda/costPerGram, normalização de peso/tempo ausentes
  para 0, fórmula customizada usada como preço final sem taxa de
  cartão/administrativa, e fallback para a fórmula padrão quando a fórmula
  customizada falha em runtime).
  **Fase 2 implementada em 2026-08-13** — testes de integração via
  `supertest` contra o app Express real e o Postgres local de dev (mesmo
  banco do `npm run dev`; sem banco de teste isolado ainda, ver
  `Contextos/Ambientes.md`). Novo helper
  `backend/src/test-utils/register-test-company.ts` (registra uma empresa
  de teste completa e devolve token/companyId; gera um `X-Forwarded-For`
  único por chamada — necessário porque cada teste registra várias
  empresas rapidamente e esbarrava no `registerRateLimiter`, 5/min por IP;
  requer `TRUST_PROXY_HOPS=1` no ambiente de teste, setado em
  `vitest.config.mts`). 15 testes novos:
  `backend/src/routes/auth.routes.test.ts` (9 — registro, e-mail duplicado,
  validação, login certo/errado, `/me` com/sem token, `/refresh` com
  cookie válido e sem cookie), `backend/src/routes/multi-tenancy.test.ts`
  (3 — empresa B não consegue ler/atualizar/excluir máquina nem orçamento
  da empresa A, nem calcular usando máquina/material de outra empresa),
  `backend/src/routes/plan-limits.test.ts` (3 — limite de 2 máquinas do
  plano FREE bloqueando a 3ª, PDF bloqueado como feature paga, bypass de
  limite para usuário promovido a `ADMIN` direto no banco). Total do
  backend: **57 testes** (42 unitários + 15 de integração), todos
  passando.
  **Fase 3 (E2E de frontend) implementada em 2026-08-18** — Playwright
  configurado em `frontend/` (`@playwright/test`, `npm run test:e2e`,
  Chromium apenas). `playwright.config.ts` fixa `locale: "pt-BR"` (o
  browser do Playwright usa `en-US` por padrão, o que fazia a própria
  detecção de idioma do app — `LanguageContext.tsx` — renderizar tudo em
  inglês e quebrar os locators). `webServer` array sobe/reaproveita
  backend (`:3001`) e frontend (`:3000`) via `reuseExistingServer: true`.
  3 testes em 2 specs, cada um registrando sua própria empresa via UI (sem
  banco de teste isolado ainda, mesma limitação dos testes de integração):
  `e2e/auth.spec.ts` (registro→dashboard→logout→login de novo; senha
  errada mostra erro sem navegar) e `e2e/quote-creation.spec.ts` (cadastra
  máquina+material→cria orçamento→aparece na listagem). Achado real (não
  bug de teste): o rótulo do campo de e-mail é "E-mail" no cadastro mas
  "Email" (sem hífen) no login — inconsistência do dicionário PT do
  próprio app, descoberta pelos testes, sinalizada mas não corrigida (fora
  do escopo pedido). Também descoberto: o `registerRateLimiter` (5/min por
  IP) pode ser atingido rodando a suíte completa várias vezes seguidas em
  menos de um minuto — comportamento esperado do rate limit, não um bug;
  documentado como limitação prática de reexecução rápida. Total do
  projeto: **60 testes automatizados** (57 backend + 3 E2E), todos
  passando. Cobertura E2E deliberadamente não-exaustiva (caminhos felizes
  centrais). Ver `Contextos/Decisoes.md` (2026-08-18).

### 📦 Dependências

**DEP-001 — Dependências não atualizadas / pouco mantidas (registrar apenas)**
- **Prioridade:** P3. **Esforço:** Pequeno (registro) / Médio (upgrade real).
- **Localização:** `backend/package.json`, `frontend/package.json`.
- **Detalhes:**
  - `@prisma/client`/`prisma` em `^5.22.0` — não é a major mais recente
    disponível upstream; upgrade de major do ORM tem risco de migração
    (mudanças de API/engine) e não deve ser feito sem plano dedicado.
  - `node-cache ^5.1.2` — pacote pequeno, de manutenção esparsa; hoje
    funcional para uso single-instance (ver **ARCH-001** para o cenário em
    que isso se torna um problema real).
  - `pdfkit ^0.18.0` com `@types/pdfkit ^0.17.6` — versão dos tipos
    ligeiramente atrás da versão da lib; risco baixo (typings podem estar
    incompletos/desatualizados para APIs novas).
  - Vulnerabilidade conhecida em `expr-eval` (alta, sem fix automático) já
    está documentada e mitigada — ver `Contextos/Conhecimento.md`, não
    repetida aqui.
- **Como corrigir:** não atualizar agora; ao planejar upgrades, priorizar
  `prisma` (maior superfície de risco/benefício) com uma janela dedicada de
  teste de regressão — o que reforça a dependência com **TEST-001** (upgrade
  de ORM sem testes automatizados é bem mais arriscado).
- **Status:** **Parcialmente implementado (2026-08-13).**
  - **Feito:** `npm update` na raiz do monorepo — só atualizações **dentro
    da faixa semver já declarada** em cada `package.json` (patch/minor,
    zero risco de breaking change). Vulnerabilidades caíram de **9 para 1**
    (a única restante é `expr-eval`, já documentada/mitigada — nada novo).
    Validado com `lint` + `tsc --noEmit` + `npm run test` (57/57) +
    `next build` limpos em `shared`/`backend`/`frontend` depois do update.
  - **Não feito, de propósito** — ao rodar `npm outdated` durante essa
    rodada, apareceram vários saltos de **major version** que o achado
    original não citava (só falava de `prisma`). Perguntei ao Yuri e ele
    escolheu **só registrar, não mexer** — mantendo o espírito original
    deste achado ("não atualizar agora"). Lista completa dos majors em
    aberto, com risco estimado:
    | Pacote | De → Para | Risco |
    | --- | --- | --- |
    | `@prisma/client`/`prisma` | 5.22 → 7.9 (2 majors) | **Alto** — motor de query mudou entre majors do Prisma; maior superfície risco/benefício do projeto (já era o único citado no achado original). |
    | `express` | 4.22 → 5.2 | **Alto** — Express 5 mudou tratamento de erros assíncronos, removeu APIs depreciadas e trocou o matcher de rotas (`path-to-regexp`); pode quebrar rotas/middlewares silenciosamente. |
    | `tailwindcss` / `tailwind-merge` | 3.4→4.3 / 2.6→3.6 | **Alto** — Tailwind 4 trocou o formato de configuração inteiro (de `tailwind.config.ts` para CSS-first); é praticamente uma reescrita da config visual. |
    | `react` / `react-dom` / `@types/react*` | 18.3 → 19.2 | **Médio-alto** — mudanças de API em hooks/refs; checar compatibilidade com a versão do Next 16 em uso antes de tentar. |
    | `typescript` | 5.9 → 7.0 (2 majors) | **Médio** — pode introduzir erros de tipo novos em checagem estrita; baixo risco de runtime, mas pode exigir ajustes de código espalhados. |
    | `lucide-react` | 0.468 → 1.31 | **Baixo-médio** — biblioteca de ícones; risco é nome/API de ícone individual mudar. |
    | `helmet` | 7.2 → 8.3 | **Baixo** — possível mudança de defaults de CSP; checar headers depois. |
    | `@types/express` | 4 → 5 | Deve acompanhar o major real do `express` — não atualizar isolado. |
    | `@types/node` | 20 → 26 | **Baixo** (só tipos), mas pode expor erros de tipo se alguma API do Node usada não existir mais na versão alvo. |
    | `dotenv` | 16 → 17 | **Baixo**. |
  - **Recomendação registrada:** se/quando decidir puxar algum desses,
    fazer **um de cada vez**, começando por `prisma` (é o que já tinha
    prioridade), agora com os 57 testes de `TEST-001` como rede de
    segurança — mas ainda vale abrir uma sessão dedicada só para isso, não
    encaixar junto de outra tarefa.

### 🔧 DevOps/infraestrutura

**DEVOPS-001 — Nenhuma infraestrutura de produção definida**
- **Prioridade:** P1. **Esforço:** Grande.
- Já registrado em `Notas/TODO.md` (deploy do frontend/backend/PostgreSQL,
  variáveis de ambiente, seeds/migrações). Repetido aqui só como referência
  cruzada, porque **SEC-006** e **ARCH-001** ficam bloqueados por essa
  decisão. Não duplicar detalhes — ver `Notas/TODO.md` para a lista viva.
- **Status:** **Implementado (2026-08-18)** — VPS contratada, domínio
  `pricify3d.com` no ar, deploy via Docker Compose funcionando em
  produção (inclusive já com um incidente real diagnosticado e corrigido
  em 2026-08-17, ver `Contextos/Conhecimento.md`). CI/CD continua fora de
  escopo (deploy manual).

---

## Plano de melhorias consolidado

| ID | Categoria | Problema/Melhoria | Prioridade | Esforço | Arquivos envolvidos |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | 🔴 Segurança | JWT sem revogação server-side | P2 | Médio | ✅ Implementado (2026-08-12) — refresh token com rotação |
| SEC-002 | 🔴 Segurança | Token em localStorage + cookie não-HttpOnly | P2 | Médio | ✅ Implementado (2026-08-12) — cookie HttpOnly + access token em memória |
| SEC-003 | 🔴 Segurança | Registro sem rate limit + enumeração de e-mail | P2 | Pequeno | ✅ rate limit implementado (2026-08-12); enumeração via 409 não alterada |
| SEC-004 | 🔴 Segurança | `/api/health` vaza erro de banco e path do FS | P2 | Pequeno | ✅ Implementado (2026-08-12) |
| SEC-005 | 🚀 Funcionalidade | Sem recuperação de senha / verificação de e-mail | P1 | Médio | ✅ Recuperação de senha implementada (2026-08-15), Resend em produção confirmado (2026-08-18); verificação de e-mail no cadastro continua pendente |
| SEC-006 | 🔧 DevOps | `trust proxy` não configurado | P2 | Pequeno | ✅ Implementado (2026-08-13) |
| SEC-007 | 🔴 Segurança | CORS aberto se `CORS_ORIGIN=*` | P3 | Pequeno | ✅ Implementado (2026-08-12) |
| SEC-008 | 🔴 Segurança | Campos de texto sem `.max()` | P3 | Pequeno | ✅ Implementado (2026-08-12) |
| DB-001 | 🗄️ Banco de dados | Cache de analytics invalidado globalmente | P2 | Médio | ✅ Implementado (2026-08-12) |
| PERF-001 | ⚡ Performance | Fan-out de queries por mesa em orçamentos | P2 | Médio | ✅ Implementado (2026-08-12) |
| PERF-002 | ⚡ Performance | PDF sem rate limit dedicado | P3 | Pequeno | ✅ Implementado (2026-08-12) |
| ARCH-001 | 🏗️ Arquitetura | Cache local não escala horizontalmente | P2 | Médio | cache.service.ts |
| QUAL-001 | 🧹 Qualidade | `QuoteForm.tsx` grande demais (879 linhas) | P3 | Médio | ✅ Implementado (2026-08-13) |
| QUAL-002 | 📦 Dependências | `morgan` não utilizado | P4 | Pequeno | ✅ Implementado (2026-08-13) |
| QUAL-003 | 🐛 Bug/problema | Conflito de código de fórmula sem tratamento | P3 | Pequeno | ✅ Implementado (2026-08-12) |
| TEST-001 | 🧪 Testes | Zero testes automatizados | P1 | Grande | ✅ Implementado (2026-08-18) — unit + integração (57 testes) + E2E de frontend (3 testes), 60 no total |
| DEP-001 | 📦 Dependências | Dependências desatualizadas/pouco mantidas | P3 | Pequeno/Médio | 🟡 Parcial (2026-08-13) — updates seguros aplicados (9→1 vulnerabilidade); majors registrados, não aplicados por decisão do Yuri |
| DEVOPS-001 | 🔧 DevOps | Sem estratégia de deploy de produção | P1 | Grande | ✅ Implementado (2026-08-18) — VPS + `pricify3d.com` no ar |

## Dependências entre melhorias

*(SEC-001, SEC-002, DB-001, PERF-001, PERF-002 já foram implementados — as
notas de dependência abaixo ficam como registro histórico de por que foram
tratados juntos/separados.)*

- **SEC-001** e **SEC-002** tratavam do mesmo problema raiz (modelo de
  sessão) — foram decididas e implementadas juntas (refresh token com
  rotação). ✅
- **SEC-005** está bloqueada até decidir um provedor de e-mail transacional.
- **SEC-006** só é totalmente testável/relevante depois de **DEVOPS-001**
  (colocar um reverse proxy na frente do backend).
- **ARCH-001** está subordinada a **DEVOPS-001** (só faz sentido trocar o
  cache por Redis se/quando o backend for escalar horizontalmente) e
  compartilha arquivo com **DB-001** (o fix de escopo do cache pode e deve
  ser feito antes, independente da decisão de escala).
- **DEP-001** (upgrade de `prisma`) fica mais seguro depois de **TEST-001**
  existir, ao menos para os services centrais (`CalculationService`,
  `QuoteService`).
- Os demais itens (SEC-003, SEC-004, SEC-007, SEC-008, PERF-002, QUAL-001,
  QUAL-002, QUAL-003) são independentes entre si e podem ser feitos em
  qualquer ordem/combinação.

## Ordem recomendada (se o Yuri quiser seguir a heurística padrão)

1. **Segurança rápida e de baixo risco:** SEC-003, SEC-004, SEC-007, SEC-008
   (todas pequenas, sem dependências, sem mudança de comportamento visível
   para o usuário final).
2. **Bug de baixo risco:** QUAL-003 (tratamento de erro faltante).
3. **Integridade/consistência de dados:** DB-001 (escopo do cache).
4. **Performance:** PERF-001, PERF-002.
5. **Decisão arquitetural maior (sessão/token):** SEC-001 + SEC-002 juntas —
   requer decidir o modelo (refresh token vs. cookie HttpOnly + CSRF) antes
   de implementar.
6. **Qualidade:** QUAL-001, QUAL-002.
7. **Funcionalidade que depende de decisão externa:** SEC-005 (escolher
   provedor de e-mail primeiro).
8. **Estrutural/grande, fora do ciclo normal de features:** TEST-001,
   DEVOPS-001, ARCH-001, DEP-001 — todos grandes ou bloqueados por outra
   decisão; tratar como iniciativas à parte, não "tarefas" pontuais.

---

## Log de decisões

*(Atualizar esta seção conforme o Yuri for aprovando/recusando/adiando itens.
Formato sugerido: data — IDs — decisão — motivo — o que foi feito.)*

- **2026-08-12** — Auditoria inicial registrada. Nenhum item aprovado ainda;
  aguardando decisão do Yuri sobre quais IDs implementar.
- **2026-08-12** — Yuri aprovou **SEC-003, SEC-004, SEC-007, SEC-008,
  QUAL-003**. Todos implementados no mesmo dia. Arquivos alterados:
  `backend/src/config/env.ts`, `backend/src/app.ts`,
  `backend/src/middlewares/rate-limit-middleware.ts`,
  `backend/src/routes/auth.routes.ts`,
  `backend/src/services/health.service.ts`,
  `backend/src/validators/resources.validator.ts`,
  `backend/src/validators/auth.validator.ts`,
  `backend/src/services/formula.service.ts`, `shared/src/index.ts`.
  Validado com `npm run lint`/`tsc --noEmit`/build completo em `shared` e
  `backend`, `npm run lint` no `frontend` (por causa da mudança de tipo
  compartilhado), e testes manuais reais: rate limit de registro (5→400,
  6ª→429), boot recusado com `CORS_ORIGIN=*`, `/api/health` escondendo
  `path`/`error` só em `NODE_ENV=production`, e validação de `.max()`
  rejeitando nome de 300 caracteres. Detalhes de cada mudança nos achados
  correspondentes acima. **SEC-005, SEC-001, SEC-002, SEC-006, DB-001,
  PERF-001, PERF-002, ARCH-001, QUAL-001, QUAL-002, TEST-001, DEP-001,
  DEVOPS-001 continuam pendentes** — não foram tocados nesta rodada.
- **2026-08-12 (mesmo dia, rodada seguinte)** — Yuri aprovou **DB-001,
  PERF-001, PERF-002, SEC-001, SEC-002**. DB-001/PERF-001/PERF-002
  implementados e validados com smoke test real (registro, criação de
  máquina/material, orçamento de 2 mesas, consulta de analytics antes/depois
  para confirmar invalidação de cache correta). Arquivos alterados:
  `backend/src/services/cache.service.ts`,
  `backend/src/services/analytics.service.ts`,
  `backend/src/services/machine.service.ts`,
  `backend/src/services/material.service.ts`,
  `backend/src/services/quote.service.ts`,
  `backend/src/services/CalculationService.ts`,
  `backend/src/routes/quote.routes.ts`. **SEC-001 e SEC-002 ainda não foram
  implementados nesta rodada** — a própria auditoria já apontava que essas
  duas exigem decidir o modelo de sessão antes de mexer no código (mudança
  de schema + reescrita de auth no backend e frontend); o plano foi
  apresentado ao Yuri antes de qualquer alteração, conforme o processo
  descrito no início deste arquivo.
- **2026-08-12 (mesma rodada, continuação)** — Yuri escolheu a abordagem
  completa (refresh token com rotação estilo OAuth, não o modelo leve de
  `tokenVersion`) quando perguntado. Plano detalhado escrito e aprovado
  (`EnterPlanMode`/`ExitPlanMode`) antes de qualquer alteração. **SEC-001 e
  SEC-002 implementados** — ver descrição completa nos achados acima e o
  desenho completo em `Contextos/Decisoes.md`. Nova migração
  `add_refresh_tokens` (aditiva, tabela nova só). Dois bugs reais foram
  encontrados e corrigidos **durante** a própria implementação (cookie com
  `Path` errado quebrando o login na UI; período de graça de reuso vazando
  para tokens mass-revogados por detecção de roubo) — detalhes em
  `Contextos/Conhecimento.md`, para não repetir o mesmo erro no futuro.
  Validado com bateria extensa de testes reais via curl (registro/login
  emitindo cookie `HttpOnly Path=/`, uso do access token, rotação, reuso
  tolerado dentro do período de graça, reuso real revogando a família
  inteira incluindo tokens-irmãos, logout, logout-all com duas sessões) e
  testes reais no navegador (login, dois reloads consecutivos mantendo
  sessão via refresh silencioso, `document.cookie`/`localStorage` sem
  nenhum token, logout, bloqueio de rota após logout). Arquivos alterados:
  `backend/prisma/schema.prisma` (+ migração `add_refresh_tokens`),
  `backend/src/services/auth.service.ts`,
  `backend/src/controllers/auth.controller.ts`,
  `backend/src/routes/auth.routes.ts`,
  `backend/src/middlewares/rate-limit-middleware.ts` (`refreshRateLimiter`),
  `backend/src/config/env.ts`, `backend/src/app.ts` (`cookie-parser`),
  `backend/package.json` (+ `cookie-parser`, `@types/cookie-parser`),
  `backend/.env.example`, `backend/.env`,
  `frontend/src/lib/api.ts`, `frontend/src/contexts/AuthContext.tsx`,
  `frontend/src/proxy.ts`. **Todos os demais itens do backlog (SEC-005,
  SEC-006, ARCH-001, QUAL-001, QUAL-002, TEST-001, DEP-001, DEVOPS-001)
  continuam pendentes** — não foram tocados.
- **2026-08-13** — Yuri aprovou **QUAL-001, QUAL-002, TEST-001**. Os três
  implementados. QUAL-002 (remover `morgan`) e TEST-001 (Vitest +
  formula-engine + CalculationService, 42 testes) sem ambiguidade — feitos
  como descrito no achado. QUAL-001 (dividir `QuoteForm.tsx`) seguiu
  exatamente a sugestão já registrada no achado (extrair
  `PrintItemCard`/`PostProcessingCard`/`QuoteSummary` + hook
  `useQuoteForm`), sem precisar de decisão de design nova. TEST-001 foi
  implementado **parcialmente**, de propósito — o próprio achado já descrevia
  isso como um plano em fases ("começando por... depois... testes de
  frontend/E2E são uma fase posterior"); só a primeira fase foi feita nesta
  rodada. Validação: `npm run lint`/`tsc --noEmit`/`next build` limpos nos
  três pacotes, `npm run test` (Vitest) com 42/42 passando, e teste real no
  navegador do fluxo completo de orçamento (criar com preview calculado,
  editar carregando dados existentes, adicionar/remover mesa, visibilidade
  condicional do botão de PDF) confirmando que o refactor de QUAL-001 não
  mudou nenhum comportamento. Arquivos: ver os achados individuais acima
  para a lista completa por item.
- **2026-08-13 (mesmo dia, rodada seguinte)** — Yuri pediu **SEC-006,
  DEP-001, QUAL-003 e fase 2 de TEST-001**. Antes de começar, conferi o
  backlog e achei que **QUAL-003 já estava implementado** desde
  2026-08-12 (confirmado por grep de `FORMULA_CODE_CONFLICT` no código) —
  não refeito, só reconfirmado, para não desperdiçar trabalho. Os outros
  três:
  - **SEC-006**: implementado como descrito no achado, mas de forma
    configurável (`TRUST_PROXY_HOPS`) em vez de esperar a decisão de
    deploy — zero risco, já que o default preserva o comportamento atual.
  - **TEST-001 fase 2**: implementada como o próprio achado já previa
    ("depois... testes de integração das rotas Express"). 15 testes novos
    de integração (auth, multi-tenancy, limites de plano) via `supertest`
    contra o Postgres local de dev. Precisou de um ajuste não previsto no
    plano original: os testes registram várias empresas rapidamente e
    esbarravam no rate limit de `/api/auth/register` (5/min por IP) — a
    solução reusou o `TRUST_PROXY_HOPS` recém-criado do SEC-006 (simulando
    clientes com `X-Forwarded-For` diferentes). Também apareceu um bug de
    teste (não do produto): worker do Vitest travando intermitentemente no
    Windows com o pool padrão — corrigido trocando para `pool: "threads"`
    em `vitest.config.mts` (detalhes em `Contextos/Conhecimento.md`).
  - **DEP-001**: ao rodar `npm outdated` para registrar direito, apareceram
    vários saltos de major version que o achado original não citava (só
    falava de Prisma) — Express 4→5, React 18→19, TypeScript 5→7,
    Tailwind 3→4, entre outros. Perguntei ao Yuri antes de tocar em
    qualquer major (`AskUserQuestion`), já que cada um individualmente tem
    risco real de quebrar partes da aplicação; ele escolheu manter o
    espírito original do achado — só registrar, não mexer. Apliquei apenas
    `npm update` (atualizações dentro da faixa semver já declarada, zero
    risco de breaking change): vulnerabilidades caíram de 9 para 1 (só
    resta a `expr-eval` já conhecida). Tabela completa dos majors em aberto
    com risco estimado está registrada no achado DEP-001 acima.
  - Validação: `lint` + `tsc --noEmit` + `next build` limpos em
    `shared`/`backend`/`frontend`, `npm run test` com **57/57** passando
    (repetido 5x para confirmar que o fix do pool do Vitest realmente
    resolveu a flakiness), build completo do backend. Arquivos alterados/
    criados: `backend/src/config/env.ts`, `backend/src/app.ts`,
    `backend/.env.example`, `backend/vitest.config.mts`,
    `backend/src/routes/auth.routes.test.ts`,
    `backend/src/routes/multi-tenancy.test.ts`,
    `backend/src/routes/plan-limits.test.ts`,
    `backend/src/test-utils/register-test-company.ts`,
    `package-lock.json` (+ vários `package.json` via `npm update`).
  - **Pendente**: SEC-005 (bloqueado por provedor de e-mail), ARCH-001
    (bloqueado por decisão de escala), DEVOPS-001 (estratégia de deploy),
    TEST-001 fase 3 (E2E de frontend), e os majors de DEP-001 (registrados,
    aguardando decisão futura do Yuri).
