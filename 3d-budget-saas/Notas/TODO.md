# TODO — 3d-budget-saas

Migrado de `CONTEXT.md` ("Pendências (Tech Debt/Next Steps)" e "Próximo
Passo") em 2026-08-12.

> Em 2026-08-12 também foi feita uma auditoria técnica completa do projeto —
> ver `Contextos/Auditoria.md` para o backlog detalhado (18 achados com ID,
> severidade, prioridade P0-P4 e esforço). Os itens abaixo continuam sendo a
> lista "oficial" de pendências já conhecidas antes da auditoria; os achados
> novos da auditoria ficam só em `Contextos/Auditoria.md` até serem
> aprovados, para não duplicar a mesma informação em dois lugares.

## Deploy (`DEVOPS-001`)

- [x] Revisar variáveis de ambiente para produção — feito em 2026-08-13:
      `.env.example` na raiz documenta tudo que o `docker-compose.yml`
      precisa, com comentários do que **precisa** virar valor real (nunca
      usar os defaults de `localhost` em produção). Ver
      `Contextos/Ambientes.md`.
- [x] Padronizar seeds e migrações — feito em 2026-08-13:
      `backend/prisma/seed.ts` (promove `SEED_ADMIN_EMAIL` a `ADMIN`,
      idempotente, substitui o UPDATE manual no banco) +
      `npx prisma migrate deploy` documentado como o comando de produção.
- [x] Deixar o projeto pronto pra deploy via Docker (genérico, sem
      plataforma escolhida) — feito em 2026-08-13: `backend/Dockerfile`,
      `frontend/Dockerfile`, `docker-compose.yml`,
      `deploy/nginx.conf.example`. **Não testado com Docker de verdade**
      (não havia Docker disponível onde isso foi implementado) — rodar
      `docker compose build && docker compose up` antes de confiar nisso
      em produção. Ver `Contextos/Ambientes.md` ("Produção (Docker)").
- [x] Decidido em 2026-08-13: **VPS + Supabase** (não mais Postgres local
      em Docker). `docker-compose.yml`/`.env.example` já ajustados; guia
      completo de deploy (VPS, Nginx, HTTPS, Asaas em produção) em
      `Contextos/Ambientes.md` ("Guia completo: VPS + Supabase + Nginx +
      HTTPS + Asaas").
- [x] **VPS no ar, em produção** (`pricify3d.com`) — confirmado em
      2026-08-17 (inclusive diagnosticado e corrigido um incidente real de
      produção nesse dia, ver `Contextos/Conhecimento.md`). CI/CD continua
      fora de escopo (deploy manual via `docker compose`, comandos
      informados a cada entrega).
- [ ] **Ambiente de dev/staging — desenhado em 2026-08-22, execução em
      andamento na VPS desde 2026-08-24.** Mesma VPS de produção,
      Postgres local em Docker (não Supabase), subdomínio
      `dev.pricify3d.com`, sempre `ASAAS_ENV=sandbox`. Repo já clonado em
      `~/app-dev` (SSH, mesma chave da produção). Achado real: `RESEND_API_KEY`
      é **obrigatória** mesmo em dev (`NODE_ENV=production` exige, sem
      olhar pro `ASAAS_ENV`) — corrigido em `.env.dev.example` e
      `Contextos/Ambientes.md`, ver `Contextos/Decisoes.md` (2026-08-24).
      Falta terminar: Nginx + Certbot pro `dev.pricify3d.com`, cadastrar
      o webhook do Asaas manualmente no painel sandbox (o script
      `asaas:register-webhook` se recusa a rodar fora de
      `ASAAS_ENV=production`), e testar o checkout de ponta a ponta.
      Runbook completo em `Contextos/Ambientes.md` ("Ambiente de
      dev/staging").

## PDF de orçamento (implementado em 2026-08-18)

- [x] CNPJ/CPF, telefone e endereço no schema de `Company` (todos
      opcionais), editáveis na aba Perfil, mostrados no cabeçalho do PDF
      só quando preenchidos (cabeçalho com altura dinâmica).
- [x] Termos comerciais customizados por empresa (`Company.customTerms`,
      texto livre multi-linha) — substituem os termos padrão localizados
      quando preenchidos; nota de validade continua sempre no final.
- [x] Preview in-app antes do download (`QuotePdfPreviewModal.tsx`, iframe
      com `blob:` URL) nos dois lugares que geram PDF — tela de criar/
      editar orçamento e a listagem. Ver `Contextos/Decisoes.md`
      (2026-08-18).
- [ ] Conteúdo visual exato do PDF (posicionamento de CNPJ/telefone/
      endereço/termos customizados) validado só por revisão de código +
      tipos batendo depois da migration — não por inspeção pixel a pixel
      do PDF renderizado. Se algo parecer deslocado/cortado na prática,
      avisar pra ajustar o layout em `quote-pdf.service.ts`.
- [x] Termos customizados agora são bilíngues — `Company.customTermsEn`
      (2026-08-20) guarda um texto próprio pra PDFs gerados em inglês, sem
      fallback cruzado entre os dois idiomas. Ver `Contextos/Decisoes.md`.
- [x] Exportação de orçamento em PDF com opção completa/resumida —
      `GET /quotes/:id/pdf?format=FULL|SUMMARY` (2026-08-20). Resumida
      omite a tabela de mesas (material/máquina/peso/tempo/valor por mesa),
      mostrando só o valor total. Toggle no `QuotePdfPreviewModal.tsx`. Ver
      `Contextos/Decisoes.md`.

## Analytics

- [ ] Comparativo ano contra ano.
- [ ] Margem por material/máquina.
- [ ] Funil temporal detalhado (enviados, aprovados, rejeitados).

## Qualidade / testes

- [ ] Expandir validação Zod para os próximos CRUDs e cálculos.
- [x] Testes unitários para services — feito em 2026-08-13 para
      `formula-engine.ts` e `CalculationService.ts` (`backend/src/services/
      *.test.ts`, `npm run test` no backend). Ver `Contextos/Auditoria.md`
      (TEST-001) e `Contextos/Chat.log`.
- [ ] Testes unitários para os demais services (`QuoteService`,
      `BillingService`, `FormulaService`, `AdminService` etc.) — ainda sem
      cobertura.
- [x] Testes de integração para rotas Express (multi-tenancy, planos,
      auth) — feito em 2026-08-13: `backend/src/routes/auth.routes.test.ts`,
      `multi-tenancy.test.ts`, `plan-limits.test.ts` (15 testes,
      via `supertest` contra o Postgres local de dev). Ver
      `Contextos/Auditoria.md` (TEST-001) e `Contextos/Ambientes.md`
      (seção "Testes automatizados" — nota importante: roda contra o MESMO
      banco do `npm run dev`, sem banco de teste isolado ainda).
- [x] **Testes de frontend/E2E implementados em 2026-08-18** — última fase
      de TEST-001. Playwright configurado em `frontend/` (`npm run
      test:e2e`), 3 testes em 2 specs: `e2e/auth.spec.ts` (registro → vai
      pro dashboard → logout → login de novo; senha errada mostra erro sem
      navegar) e `e2e/quote-creation.spec.ts` (cadastra máquina + material
      → cria orçamento → aparece na listagem). Cobertura deliberadamente
      não-exaustiva (fluxo feliz dos caminhos mais centrais, não todo caso
      de borda). Achado real de i18n durante a implementação: o rótulo do
      campo de e-mail é "E-mail" no cadastro mas "Email" (sem hífen) no
      login — inconsistência do dicionário PT do próprio app, sinalizada
      mas não corrigida (fora do escopo pedido). Ver
      `Contextos/Decisoes.md` (2026-08-18).
- [ ] Banco de teste isolado para os testes de integração (hoje rodam
      contra o Postgres de dev) — só vira necessário de verdade quando
      houver CI (`DEVOPS-001`).

## Dependências (major versions registradas, não aplicadas — decisão do Yuri em 2026-08-13)

- [ ] Ver tabela completa de risco em `Contextos/Auditoria.md` (DEP-001).
      Resumo: `prisma`/`@prisma/client` (5→7), `express` (4→5),
      `tailwindcss`/`tailwind-merge` (3→4), `react`/`react-dom` (18→19),
      `typescript` (5→7), `lucide-react`, `helmet`, `@types/*`. Se algum
      dia for puxar, um de cada vez, com sessão dedicada — prisma primeiro
      (agora com os 57 testes de `TEST-001` como rede de segurança).
      Atualizações seguras (dentro da faixa semver já declarada) já foram
      aplicadas via `npm update` em 2026-08-13.

## RBAC

- [ ] Evoluir para RBAC granular por permissão quando houver múltiplos
      usuários por empresa (hoje é só `USER`/`ADMIN`).

## Segurança (monitorar, não é bug ativo)

- [ ] Vulnerabilidade alta em `expr-eval` sem fix automático — mitigada via
      whitelist em runtime (ver `Contextos/Conhecimento.md`); acompanhar se
      surgir fix upstream.
- [ ] **Não aplicar** o fix automático de `npm audit` para `next → postcss`
      — faria downgrade quebrante para Next 9.

## Sessão / refresh token (seguimento de SEC-001/SEC-002, implementado em 2026-08-12)

- [ ] Job periódico de limpeza das linhas expiradas/revogadas de
      `RefreshToken` — adiado por não haver infraestrutura de cron decidida
      ainda (depende de `DEVOPS-001`). Sem isso a tabela só cresce.
- [ ] UI para "sair de todos os dispositivos" — o endpoint
      `POST /api/auth/logout-all` já existe e foi testado via curl, mas
      não tem nenhum botão/tela no frontend ainda (fora do escopo aprovado
      na implementação original).
- [ ] Considerar reduzir ainda mais a superfície do
      `clearRefreshTokenCookie` (hoje limpa dois `Path` — `/` e o antigo
      `/api/auth` usado brevemente durante o desenvolvimento) quando tiver
      certeza de que nenhum navegador de teste ainda carrega o cookie
      antigo — ver `Contextos/Conhecimento.md`.

## Assinaturas via Asaas (implementado em 2026-08-13)

- [ ] **🔴 URGENTE — bug crítico achado e corrigido em 2026-08-24: o
      primeiro pagamento de uma assinatura nova nunca ativava o plano.**
      `webhook.controller.ts` correlacionava via `payment.
      externalReference` (sempre `null` — o Asaas nunca propaga esse
      campo do Checkout pro pagamento, confirmado com um pagamento real
      no sandbox), em vez de `payment.checkoutSession`. Já corrigido no
      código (dev) — **falta**: (1) aplicar a mesma correção em
      produção, (2) auditar produção por `Company`/`Payment` órfãos —
      qualquer cliente que pagou de verdade no Asaas mas cujo plano
      nunca ativou. Ver `Contextos/Decisoes.md` (2026-08-24) e
      `Contextos/Conhecimento.md`.
- [x] Tabela `Plan` administrável (preço, ciclo, limites, features) substitui
      o enum fixo `SubscriptionPlan`; `Company.planId` (FK). Tela
      `/admin/plans` (CRUD completo, protegida por `adminMiddleware`).
- [x] Checkout hospedado do Asaas (`POST /billing/checkout`) — cartão de
      crédito processado inteiramente no domínio do Asaas. Confirmação via
      webhook (`POST /api/webhooks/asaas`), nunca no redirect de volta.
- [x] Testado de ponta a ponta contra o sandbox real do Asaas (checkout
      real criado + link renderizando a página deles + webhook simulado
      ativando o plano, idempotente, token errado rejeitado). Ver
      `Contextos/Chat.log` e `Contextos/Decisoes.md` (2026-08-13).
- [x] **Script de cadastro do webhook implementado em 2026-08-18**
      (`backend/scripts/register-asaas-webhook.ts`, `npm run
      asaas:register-webhook` dentro de `backend/`) — chama a API do Asaas
      (`POST`/`PUT /v3/webhooks`) apontando pra
      `${APP_BASE_URL}/api/webhooks/asaas`, com o mesmo `ASAAS_WEBHOOK_TOKEN`
      do backend, inscrito só nos 3 eventos que `webhook.controller.ts`
      realmente trata (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
      `PAYMENT_OVERDUE`). Idempotente (atualiza em vez de duplicar se já
      existir um webhook pra essa URL) e recusa rodar se `ASAAS_ENV` não for
      `production` ou se `APP_BASE_URL` não for `https://`. Validado
      rodando de verdade contra o sandbox (client Asaas confirmado
      funcionando; a chamada real de registro não foi testada com dado
      válido pra não sujar o sandbox com um webhook de teste). Ver
      `Contextos/Decisoes.md` (2026-08-18).
- [x] **Webhook do Asaas cadastrado em produção** — confirmado em
      2026-08-20.
- [x] **Preços reais de Pro/Enterprise definidos** — confirmado em
      2026-08-18, editado pelo Yuri via `/admin/plans` (os R$49,90/R$199,90
      da seed eram só placeholder).
- [ ] Pix recorrente **não é suportado** pelo Checkout Asaas para
      `chargeTypes: RECURRENT` (só `CREDIT_CARD`; descoberto testando
      contra o sandbox real, contradiz a documentação). Se o Yuri quiser
      oferecer Pix para assinaturas, precisaria de um fluxo separado (o
      pagador reconfirma a cada ciclo) — não implementado, fora de escopo
      desta rodada.
- [ ] Job periódico pra expirar/limpar `Checkout` que ficaram `PENDING`
      além do `minutesToExpire` (hoje não tem nenhuma limpeza — mesmo
      padrão já adiado do `RefreshToken`, depende de `DEVOPS-001`).
- [ ] Pequeno nit de exibição: `payment.paymentDate`/`dueDate` são datas
      puras (`YYYY-MM-DD`) convertidas com `new Date(...).toLocaleDateString()`
      no frontend — dependendo do fuso do navegador pode mostrar o dia
      anterior (visto no smoke test: pagamento de `2026-08-13` exibido como
      `12/08/2026`). Cosmético, não afeta o que é gravado/processado.
- [ ] Revisitar upgrade/downgrade entre planos pagos: hoje qualquer troca
      de plano sempre cria um novo checkout e cancela a assinatura Asaas
      anterior (sem proration) — comportamento MVP deliberado, documentado
      em `Contextos/Decisoes.md`.
- [x] **Plano Cortesia — implementado em 2026-08-20.** Mesmos limites/
      recursos do Pro, preço R$ 0, `isPublic: false` (não aparece na
      tela de cobrança pro cliente contratar). Só o admin consegue
      definir, direto em `/admin/users` (mesmo seletor de plano que já
      existia) — atribuir não gera nenhuma cobrança nem chamada ao
      Asaas. Ver `Contextos/Decisoes.md` (2026-08-20).
- [x] **Cupons de desconto — implementado em 2026-08-22.** Tela
      `/admin/coupons` (código, percentual, ativo/inativo). Campo de
      cupom em `/dashboard/billing` antes de assinar; o desconto vira o
      valor fixo cobrado pelo Asaas em toda cobrança futura da
      assinatura (mecanismo nativo do Checkout Asaas — nenhuma
      reaplicação por ciclo foi necessária). Ver `Contextos/Decisoes.md`.
- [x] **Dois tipos de cupom — implementado em 2026-08-22 (mesmo dia).**
      `Coupon.type`: `RECURRING` (padrão, comportamento acima) ou
      `ONE_TIME` (desconto só na primeira cobrança — assim que o
      webhook confirma, o valor da assinatura no Asaas é revertido pro
      preço cheio do plano via `PUT /v3/subscriptions/{id}`). Ver
      `Contextos/Decisoes.md`.
- [x] **Alerta por e-mail na falha de reversão do cupom `ONE_TIME` —
      implementado em 2026-08-22 (mesmo dia).** Se
      `revertSubscriptionToFullPrice` falhar, `emailService.
      sendCouponRevertFailed` avisa todo admin ativo (empresa, id da
      assinatura no Asaas, valor a corrigir, erro retornado, link pra
      lista de assinaturas no painel). Ver `Contextos/Decisoes.md`.
- [ ] Achado ao implementar o alerta acima: banco de dev tem **902
      usuários `ADMIN` ativos** acumulados de `promoteToAdmin()` usado
      em testes ao longo desta sessão, nunca limpos. Inofensivo até
      agora (suíte ainda roda em segundos), mas é dívida real e a
      primeira feature que age sobre "todo admin" em escala. Considerar
      um helper de teste que desfaça a promoção no `afterEach`, ou um
      script de limpeza manual sob demanda. Ver `Contextos/Conhecimento.md`.
- [ ] Frequência do crash nativo do Vitest no Windows (já documentado em
      `Contextos/Conhecimento.md`) piorou em 2026-08-22 — lotes de 9
      arquivos que vinham funcionando passaram a crashar; precisou
      dividir em lotes de 4-5 arquivos. Ainda não confirmado se está
      relacionado à carga do fan-out de e-mail pra múltiplos admins ou é
      só variação do problema pré-existente. Sem ação de código possível
      (ambiente), só registrando pra não perder o padrão se piorar mais.
- [ ] Checkout pago não pode ser testado clicando de ponta a ponta em
      dev local — o Asaas rejeita `successUrl`/`cancelUrl`/`expiredUrl`
      apontando pra `localhost` (exige URL pública). Descoberto
      2026-08-22 testando cupons; não é um bug de nenhuma feature
      específica. Ver `Contextos/Conhecimento.md`.

## Catálogo de impressoras (implementado em 2026-08-14)

- [x] Tabela `MachineCatalog` com 63 modelos reais (FDM/resina, ≥4 por
      marca), autocomplete no cadastro de máquina, `Machine.price` +
      `maintenanceCostPerHour` derivados automaticamente (depreciação e
      manutenção somadas no custo base do orçamento). Ver
      `Contextos/Decisoes.md` (2026-08-14).
- [x] **Tela `/admin/machine-catalog` implementada em 2026-08-18** —
      CRUD completo (criar/editar/excluir) + import por CSV (upsert por
      marca+modelo, valida linha por linha, uma linha ruim não derruba o
      resto do arquivo, botão "baixar modelo"). Preços do catálogo
      seguem sendo referência de pesquisa manual (Mercado Livre/
      AliExpress) de quando foram cadastrados — agora dá pra manter
      atualizado direto pela tela, sem precisar de SQL. Ver
      `Contextos/Decisoes.md` (2026-08-18).
- [ ] Cobertura de marcas ficou em modelos "atuais" conhecidos em
      2026-08-14 — lançamentos novos ou marcas menores (ex. Elegoo Neptune
      5, Bambu Lab H2D se já tiver saído, marcas nacionais brasileiras)
      não entraram nesta leva. Pedir uma atualização quando fizer sentido.

## Sistema de e-mails via Resend (implementado em 2026-08-15)

- [x] 6 templates editáveis em `/admin/email-templates` (conta criada,
      reset de senha, assinatura confirmada/renovada/perto de vencer,
      resumo de orçamento), reset de senha com token de uso único (mesmo
      padrão de segurança do refresh token), cron diário in-process pro
      alerta de vencimento. Ver `Contextos/Decisoes.md` (2026-08-15).
- [x] **`RESEND_API_KEY` real configurada em produção** — confirmado em
      2026-08-18.
- [x] **Domínio `pricify3d.com` verificado no Resend** (SPF/DKIM) —
      confirmado em 2026-08-18.
- [x] **Log de e-mails visível em `/admin/email-templates` — implementado
      em 2026-08-19.** O registro em si (`EmailLog`) já existia desde a
      implementação original — todo envio, real ou de teste, sempre
      gravava uma linha — mas não tinha nenhuma tela pra visualizar.
      Seção "Logs de envio" nova na mesma página, com filtro por status
      e paginação (`GET /admin/email-logs`). Ver `Contextos/Decisoes.md`
      (2026-08-19).
- [x] **Status de entrega (webhook do Resend) — implementado em
      2026-08-19.** O item acima só mostrava se a chamada à API do Resend
      foi aceita, não se o e-mail chegou de verdade. Novo endpoint
      `POST /api/webhooks/resend` (assinatura verificada via `svix`)
      recebe os eventos `email.delivered/bounced/complained/
      delivery_delayed/failed` e preenche `EmailLog.deliveryStatus` —
      coluna "Entrega" nova na mesma tela, com filtro próprio. Ver
      `Contextos/Decisoes.md` (2026-08-19).
- [x] **Webhook do Resend cadastrado em produção — confirmado em
      2026-08-19.** A chave de API de produção era restrita só a envio
      (não conseguia gerenciar webhook via API — `401
      restricted_api_key`) — cadastrado manualmente pelo Yuri direto no
      painel do Resend em vez de rodar o script. `RESEND_WEBHOOK_SECRET`
      configurado no `.env` da VPS.
- [x] **Prévia do conteúdo enviado — implementado em 2026-08-20.**
      Botão novo na tela "Logs de envio" abre modal com o HTML exato
      que foi mandado pro destinatário (nome, link/token reais — não
      dados de exemplo). Existia um buraco real: `EmailLog` nunca
      guardava esse HTML antes, só o assunto — coluna `body_html` nova
      resolve isso. Serve principalmente pro caso de um cliente com
      problema no reset de senha não ter recebido o e-mail — dá pra ver
      o link direto no log e passar manualmente. Ver
      `Contextos/Decisoes.md` (2026-08-20).
- [x] **Origem teste/real + limpeza automática — implementado em
      2026-08-20.** Coluna "Origem" nova ("Teste"/"Real") + filtro na
      tela de logs. Job novo (`email-log-cleanup.job.ts`, roda às 3h)
      apaga só linhas de teste com mais de 48h — envios reais nunca
      são apagados automaticamente. Ver `Contextos/Decisoes.md`
      (2026-08-20).
- [x] **Checado em 2026-08-15**: nenhum webhook está cadastrado no Asaas
      ainda (`GET /v3/webhooks` no sandbox devolveu `totalCount: 0`) — ou
      seja, hoje nem o alerta de vencimento nem os e-mails de assinatura
      confirmada/renovada disparariam sozinhos em produção, porque o Asaas
      não tem pra onde mandar nada (isso já era esperado, ver item do
      webhook de produção acima — o que não estava claro é que também
      afeta os outros dois e-mails, não só o de vencimento). Corrigido só
      pro alerta de vencimento: o job agora busca a próxima fatura direto
      na API do Asaas (`asaasClient.listPendingPayments`) em vez de só
      esperar um webhook, então funciona hoje independente de quando o
      webhook de produção for cadastrado. Ver `Contextos/Decisoes.md`
      (2026-08-15). **Assinatura confirmada/renovada continuam dependendo
      do webhook de produção ser cadastrado** (são reações a um evento que
      aconteceu, não dá pra "puxar" o mesmo jeito).
- [x] E-mail de "pagamento atrasado" (`PAYMENT_OVERDUE`) implementado em
      2026-08-20 — dispara no webhook do Asaas (`OVERDUE_EVENTS`), mesma
      guarda de idempotência `isNewPaymentRecord` usada pra
      confirmada/renovada. Ver `Contextos/Decisoes.md`.
- [ ] `Quote` não guarda e-mail do cliente final — o resumo de orçamento
      vai pro dono da conta, não pro cliente. Se um dia fizer sentido
      mandar direto pro cliente, precisa de um campo novo + migração.

## Perfil do usuário + preferências de e-mail (implementado em 2026-08-16)

- [x] Aba "Perfil" em `/dashboard/settings` (nome editável, e-mail
      travado, 3 preferências de e-mail: financeiro/orçamentos/
      newsletter). `PATCH /auth/me`, `User.name` + 3 booleanos novos.
      Contas/reset de senha nunca são bloqueados por preferência. Ver
      `Contextos/Decisoes.md` (2026-08-16).
- [ ] Newsletter ainda não existe como funcionalidade de verdade — só o
      toggle de preferência foi criado, pronto pra quando existir um
      disparo de newsletter de fato.
- [ ] Dropdown "Admin" no menu lateral agrupa os 4 links admin — sem
      pendência conhecida, só registrando que existe caso o Yuri queira
      adicionar mais itens admin no futuro (entram automaticamente no
      mesmo grupo via `adminNavigation` em `Sidebar.tsx`).

## Redesenho do motor de precificação (implementado em 2026-08-17)

- [x] Fórmula avaliada uma única vez por orçamento (não mais por mesa) -
      corrige o bug de pintura/acabamento duplicando por mesa. Novo
      endpoint `POST /quotes/preview`, `CalculationService.calculateAggregate`.
      Ver `Contextos/Decisoes.md` (2026-08-17).
- [ ] Orçamentos criados **antes** desta mudança mantêm o snapshot antigo
      (`marginAmount`/`feesTotal` por item com valor real, `finalPrice`
      por item != `baseCost`) - não foram recalculados retroativamente
      (são snapshots financeiros históricos, recalcular mudaria o valor
      que o cliente recebeu). Só orçamentos novos/editados depois de
      2026-08-17 seguem o modelo novo. Se isso confundir relatórios
      antigos vs novos, avaliar uma migração de dados específica.
- [ ] `administrativeFeeAmount`/`marginAmount` no breakdown são
      estimativas de exibição (`subtotal * taxa`), não um valor exato
      extraído da fórmula (que é texto livre) - correto o suficiente
      pra exibição, mas não usar em cálculos financeiros que exijam
      precisão absoluta. `cardFeeAmount` deixou de ser estimativa em
      2026-08-21 - ver item logo abaixo.
- [x] **Taxa de cartão virou opcional por orçamento (2026-08-21)** —
      até aqui ela era sempre embutida no preço via `taxas_percentuais`
      (mesmo pra quem não cobra no cartão). Novo campo
      `Quote.cardPayment` (checkbox "Pagamento Cartão" no formulário,
      logo abaixo do valor acumulado) soma a taxa configurada por cima
      do preço só quando marcado; `Quote.cardFeeAmount` guarda o valor
      real acrescido (snapshot). Calculadora standalone
      (`/dashboard/calculator`) ganhou o mesmo checkbox. Ver
      `Contextos/Decisoes.md`.
- [x] **Bug corrigido em 2026-08-21**: selecionar uma fórmula do
      **sistema** (biblioteca global, não fórmula própria da empresa) num
      orçamento não sobrevivia à edição - reabrir sempre mostrava a
      fórmula padrão de novo. Causa: `Quote.formulaId` só referenciava a
      tabela `formulas` (por empresa); o backend gravava `NULL` de
      propósito ao usar uma fórmula do sistema. Nova coluna
      `Quote.systemFormulaId` guarda esse caso. Ver
      `Contextos/Decisoes.md`.
- [x] **"Desconto/Acréscimo" por orçamento — implementado em
      2026-08-22 (mesmo dia).** Campo novo abaixo de "Pagamento
      Cartão": ao escolher Desconto ou Acréscimo, um percentual
      aparece e é aplicado por cima do valor final (formula + taxa de
      cartão) — mesmo padrão real (não estimativa) de
      `cardPayment`/`cardFeeAmount`. `Quote.adjustmentType`/
      `adjustmentPercent`/`adjustmentAmount`. A calculadora standalone
      (`/dashboard/calculator`) **não** ganhou esse campo nesta rodada
      (fora do pedido). PDF ganhou de brinde: a linha "Descontos" que
      já existia no financial summary estava hardcoded em R$0,00 desde
      sempre (não havia mecanismo real) — agora mostra o valor de
      verdade, com rótulo "Acréscimo" quando for o caso. Ver
      `Contextos/Decisoes.md`.

## Traducao do sistema (implementado em 2026-08-17)

- [x] Idioma por usuario (`User.language`, pt-BR/en), selecionavel no
      cadastro e em "Meu perfil", com deteccao do idioma do navegador como
      default. Todas as telas de usuario + PDF de orcamento + 6 templates
      de e-mail traduzidos (EN criado a partir do original PT); precos de
      orcamento mostram `$`/USD quando o idioma e ingles (troca so de
      formatacao, nunca conversao de valor real). Painel Admin permanece
      100% portugues por decisao do Yuri. Ver `Contextos/Decisoes.md`
      (2026-08-17).
- [x] Descricoes de variaveis de formula traduzidas em 2026-08-20 —
      `systemVariableMeta`/`customVariableDescriptions` em
      `formula.service.ts` agora guardam `Record<SupportedLanguage, string>`;
      `GET /formulas/variables` devolve no idioma do usuario logado. Nomes
      das variaveis (`peso`, `tempo`, etc.) continuam sem traducao de
      proposito — sao o identificador digitavel na formula. Ver
      `Contextos/Decisoes.md`.
- [ ] `<html lang="pt-BR">` em `app/layout.tsx` fica fixo independente do
      idioma escolhido pelo usuario - `RootLayout` e Server Component,
      mudar isso exigiria cookie/middleware de locale. Limitacao
      conhecida, sem impacto funcional (so acessibilidade/SEO).
- [ ] Mensagens de erro internas em portugues em
      `lib/download-quote-pdf.ts` (ex. "Reinicie a API na porta 3001") -
      confirmado que nunca aparecem pro usuario final na pratica (fluxo de
      toast sempre usa o fallback traduzido do call site, nao
      `error.message`). Cosmetico/dev-only, nao vale expandir escopo pra
      corrigir agora.
- [ ] Se o Yuri quiser revisitar o painel Admin traduzido no futuro, ele
      ficou deliberadamente de fora desta rodada (decisao explicita) -
      registrar aqui caso mude de ideia depois.

## Pais no cadastro + preco de referencia em dolar (implementado em 2026-08-17)

- [x] Campo Pais no cadastro (lista completa ISO 3166-1) e em "Meu perfil",
      definindo `defaultCurrency` automaticamente (Brasil = BRL, outros
      paises = USD). Campo `Plan.priceUsd` opcional, editavel em
      `/admin/plans`. Tela de Plano/faturamento mostra o preco em USD (por
      plano) so quando o pais da empresa != BR e aquele plano tem
      `priceUsd` configurado, com aviso de que e so referencia. Ver
      `Contextos/Decisoes.md` (2026-08-17).
- [ ] **Confirmado que o Asaas nao cobra em dolar de verdade** - a API deles
      nao tem parametro de moeda, todo valor e sempre em reais. Cliente
      estrangeiro/cartao emitido fora do Brasil so pode ser cobrado depois
      de autorizacao manual de um gerente de conta Asaas (contatar o
      suporte deles, fora do escopo do codigo) - sem isso, o checkout pode
      falhar pra esses clientes mesmo com o preco em USD configurado aqui.
- [ ] `Plan.priceUsd` so foi preenchido no plano Pro (valor de teste,
      US$ 9,90) durante a verificacao desta sessao - Free e Enterprise
      ficam sem, caindo no fallback BRL. Preencher os valores reais em
      `/admin/plans` quando o Yuri decidir os precos em dolar.
- [ ] Pais nao afeta nada alem da moeda de exibicao da assinatura hoje
      (nao afeta idioma, fuso, formato de PDF, etc) - se algum dia fizer
      sentido usar o pais pra mais alguma coisa (ex. imposto, compliance),
      avaliar separadamente.

## Landing page pública (implementado em 2026-08-18)

- [x] Página de atração na raiz do domínio (`https://pricify3d.com/`),
      substituindo o antigo redirect vazio pra `/dashboard`/`/login`.
      Vira o conteúdo real de `frontend/src/app/page.tsx` (Server
      Component + CSS Modules), não um HTML estático à parte. Ver
      `Contextos/Decisoes.md` (2026-08-18).
- [ ] Preço do plano Pro (`R$ 39,90/mês`) está hardcoded como texto na
      landing — não vem da tabela `Plan` administrável (`/admin/plans`).
      Se o preço mudar, editar manualmente `frontend/src/app/page.tsx`
      (seção `id="planos"`) também, ou considerar buscar via API pública
      no futuro se isso incomodar.

## App mobile (PWA instalável, implementado em 2026-08-24)

- [x] **Instalável via Chrome (Android) — confirmado ao vivo em
      2026-08-24.** `manifest.ts`, ícones, `sw.js` (não-cacheia quase
      nada de propósito — app é sempre-online), `offline.html`. Yuri
      confirmou que "Instalar app" pelo menu do Chrome funciona contra
      `https://dev.pricify3d.com`. O banner automático (mini-infobar) não
      apareceu na primeira visita — esperado, depende do score de
      engajamento do Chrome com o site, não é bug. Ver
      `Contextos/Decisoes.md` (2026-08-24).
- [x] Botão "Instalar app" dentro da própria interface — implementado em
      2026-08-24 (mesmo dia) via `useInstallPrompt` (escuta
      `beforeinstallprompt`/`appinstalled`), botão no `Header`. Não foi
      possível confirmar o disparo real do evento no browser desta
      ferramenta (mesma limitação de tooling do `sw.js`) — falta o Yuri
      confirmar num Android de verdade. Ver `Contextos/Decisoes.md`
      (2026-08-24).
- [ ] Publicar na Play Store (TWA) — deliberadamente fora desta rodada
      (decisão do Yuri). Exigiria conta Google Play Developer paga dele
      + Digital Asset Links + Bubblewrap. Revisitar se ele quiser.

## Bug em correção: campos numéricos de Configurações (2026-08-24, mesmo dia)

- [ ] Campo "grudava" no "0" ao digitar por cima (sobretudo no celular,
      "12" virava "012") e decimal não aceitava "," — só ".". Primeira
      correção (seleção total no foco) não resolveu — Yuri mandou vídeo
      do Android real mostrando o mesmo sintoma, e ainda revelou que
      digitar "." apagava o campo inteiro (efeito colateral do
      select()). Segunda correção: removido o `select()`; agora, se o
      valor for exatamente 0, o campo mostra vazio (placeholder "0") em
      vez do caractere — sem "0" no DOM pra atrapalhar o próximo dígito
      (`frontend/src/app/dashboard/settings/page.tsx`, Custos
      Fixos/Impressoras/Materiais). Verificado simulando digitação real
      via JS no dev local (não dá pra reproduzir teclado touch na
      ferramenta) — falta o Yuri confirmar no Android de verdade. Ver
      `Contextos/Decisoes.md` (2026-08-24).

## Próximo passo geral

Pós-MVP: preparar deploy, seeds, testes automatizados, monitoramento externo
e testes de carga.
