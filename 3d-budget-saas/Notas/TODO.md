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
- [ ] **Ainda pendente do lado do Yuri**: contratar a VPS de verdade,
      comprar o domínio, criar o projeto no Supabase, e executar o guia.
      CI/CD segue fora de escopo por enquanto (deploy manual via
      `docker compose` documentado no guia).

## PDF de orçamento

- [ ] Adicionar CNPJ/CPF, telefone e endereço no schema de `Company`.
- [ ] Permitir termos comerciais customizados por empresa.
- [ ] Criar preview in-app antes do download.

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
- [ ] Testes de frontend/E2E — última fase de TEST-001, ainda não
      iniciada.
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
- [ ] **Cadastrar o webhook de verdade no painel/API do Asaas** apontando
      pra `https://<dominio-real>/api/webhooks/asaas`, com o mesmo valor de
      `ASAAS_WEBHOOK_TOKEN` configurado no backend — sem isso, nenhum
      pagamento real confirma automaticamente. Só faz sentido depois de
      `DEVOPS-001` (domínio real com HTTPS).
- [ ] **Preços reais de Pro/Enterprise** — os valores atuais (R$49,90 /
      R$199,90) são placeholders inseridos pela migração seed, nunca
      existiu preço real no sistema mock anterior. Editar via `/admin/plans`
      quando o Yuri decidir os valores reais.
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

## Catálogo de impressoras (implementado em 2026-08-14)

- [x] Tabela `MachineCatalog` com 63 modelos reais (FDM/resina, ≥4 por
      marca), autocomplete no cadastro de máquina, `Machine.price` +
      `maintenanceCostPerHour` derivados automaticamente (depreciação e
      manutenção somadas no custo base do orçamento). Ver
      `Contextos/Decisoes.md` (2026-08-14).
- [ ] **Preços do catálogo são referência de 2026-08-14** (pesquisa
      Mercado Livre/AliExpress + estimativa cambial pra quem não achou
      preço nacional) — vão desatualizar com o tempo. Não existe tela
      admin pra editar o catálogo ainda; hoje só dá pra corrigir via SQL
      direto na tabela `machine_catalog`. Se isso incomodar no dia a dia,
      vale pedir uma tela `/admin/machine-catalog` (mesmo padrão CRUD de
      `/admin/plans`).
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
- [ ] **`RESEND_API_KEY` real ainda não configurada em lugar nenhum** — o
      Yuri precisa gerar a chave no painel do Resend e setar em produção
      (`docker-compose.yml`/`.env` já pedem a variável,
      `EMAIL_FROM_ADDRESS` já tem o default certo). Sem isso nenhum
      e-mail é entregue de verdade (fica só registrado como `FAILED` em
      `EmailLog`, comportamento correto/esperado em dev).
- [ ] **Domínio `pricify3d.com` precisa estar verificado no Resend**
      (registros SPF/DKIM) — o e-mail está hospedado no Zoho Mail, então
      isso é configuração cruzada entre os dois painéis, feita pelo Yuri
      (fora do escopo do código).
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
- [ ] Nenhum e-mail de "pagamento atrasado" (`PAYMENT_OVERDUE`) foi
      implementado nesta rodada — só era pedido confirmada/renovada/perto
      de vencer. Avaliar se vale adicionar depois.
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

## Próximo passo geral

Pós-MVP: preparar deploy, seeds, testes automatizados, monitoramento externo
e testes de carga.
