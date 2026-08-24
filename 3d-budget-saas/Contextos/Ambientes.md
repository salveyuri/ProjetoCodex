# Ambientes

Migrado de `CONTEXT.md` em 2026-08-12.

---

## Desenvolvimento

- Monorepo npm workspaces: `frontend`, `backend`, `shared`.
- Scripts principais (raiz):
  - `npm run dev:frontend` → `npm --workspace @3d-budget/frontend run dev`
  - `npm run dev:backend` → `npm --workspace @3d-budget/backend run dev`
  - `npm run build` → builda `shared` → `backend` → `frontend`, nessa ordem.
  - `npm run lint` → lint de `shared`, `backend` e `frontend`.
- Backend dev roda por padrão na porta `3001` (`PORT`).
- Prisma: `DATABASE_URL` aponta para PostgreSQL local. Comando de migração
  inicial registrado em `backend/package.json`
  (`npm run prisma:migrate:init --workspace @3d-budget/backend`). Aplicar
  migrações com `npx prisma migrate deploy` a partir de `backend/`.
- **Correção (2026-08-12):** o projeto ESTÁ sob Git — só não com `.git`
  dentro de `3d-budget-saas/` (por isso a checagem anterior, que só olhou a
  raiz do projeto, não achou). A raiz real do repositório é um nível acima,
  `D:\ProjetoCodex`, com remoto `origin` em
  `https://github.com/salveyuri/ProjetoCodex.git`. `3d-budget-saas/` é um
  subdiretório versionado dentro dele. `.env`/`node_modules`/`.next`/`dist`
  já estão no `.gitignore` (`3d-budget-saas/.gitignore`), então segredos
  locais não vazam.
- **Estado em 2026-08-12:** só **3 commits** no histórico
  (`Primeiro commit`, `Alterações finais do projeto deixando MVP`,
  `Novas variáveis e inclusão de fórmula`) — a maior parte do trabalho
  incremental descrito em `Contextos/Chat.log` (Blocos 1-13 e as rodadas de
  auditoria) nunca foi commitada. Havia **47 arquivos modificados e 6 novos
  arquivos não rastreados** quando isso foi percebido — incluindo
  `Contextos/`, `Notas/` e `CLAUDE.md` deste próprio esforço de reorganizar
  o padrão de contexto. **Nunca rode `git commit`/`git push` aqui sem
  confirmação explícita do Yuri** — commitar 47 arquivos de uma vez, sem o
  Yuri revisar, é um risco real (mistura trabalho de sessões muito
  diferentes num commit só).

## Produção (Docker) — decisão: VPS + Supabase (2026-08-13)

- **Onde hospedar foi decidido em 2026-08-13**: VPS (a contratar) +
  **Supabase** como Postgres gerenciado (não mais Postgres local em
  Docker). `docker-compose.yml` foi ajustado nesse mesmo dia: o serviço
  `postgres` foi **removido** (era só pra dev/teste do compose), o backend
  agora lê `DATABASE_URL` direto do `.env` (a connection string do
  Supabase), e as portas do `backend`/`frontend` ficaram amarradas a
  `127.0.0.1` (só o Nginx do host consegue alcançar — nada Docker exposto
  direto pra internet).
- **Ainda não testado com Docker de verdade** — mesma ressalva de sempre,
  não há Docker disponível no ambiente onde isso foi escrito. O
  `docker-compose.yml` foi validado sintaticamente (`npx js-yaml
  docker-compose.yml`), o que já pegou um bug real (mensagens de erro do
  `${VAR:?...}` com `: ` dentro quebravam o parse YAML — corrigido).
- Guia completo de deploy (VPS + Supabase + Nginx + HTTPS + Asaas em
  produção) na seção seguinte.

### Arquivos

- `backend/Dockerfile`, `frontend/Dockerfile` — multi-stage, **build
  context é a raiz do repo** (não `backend/`/`frontend/` isolados), porque
  é um monorepo com workspaces (`@3d-budget/shared` é `file:../shared`).
  `frontend/Dockerfile` usa o modo `standalone` do Next
  (`frontend/next.config.mjs`) — em monorepo, o `server.js` gerado fica
  aninhado em `frontend/server.js` dentro do output, não na raiz; os
  comentários no Dockerfile explicam isso.
- `docker-compose.yml` (raiz) — **2 serviços** (`backend` porta `3001`,
  `frontend` porta `3000`, ambos só em `127.0.0.1`) — sem `postgres`
  local, banco fica no Supabase. `frontend` recebe `NEXT_PUBLIC_API_URL`
  como *build arg*, não variável de runtime — Next inlina `NEXT_PUBLIC_*`
  no bundle do client em build time, mudar depois exige rebuild.
- `.env.example` (raiz) — variáveis do `docker-compose.yml`, incluindo
  `DATABASE_URL` (Supabase). **Diferente** de `backend/.env.example`/
  `frontend/.env.example`, que são só pro `npm run dev` sem Docker
  (esses continuam com Postgres local — não mudaram).
- `backend/prisma/seed.ts` — promove `SEED_ADMIN_EMAIL` a `ADMIN`. Roda
  com `docker compose run --rm backend npx prisma db seed`. Idempotente.
- `deploy/nginx.conf.example` — reverse proxy de referência (frontend na
  `/`, backend em `/api/`), **sem TLS** (o Certbot adiciona isso — ver
  guia abaixo). Usa `TRUST_PROXY_HOPS=1` — ver `SEC-006` em
  `Contextos/Auditoria.md`.

### Guia completo: VPS + Supabase + Nginx + HTTPS + Asaas

Passo a passo entregue ao Yuri em 2026-08-13 (ver `Contextos/Chat.log`
pra contexto completo da conversa). Resumo executável — os detalhes
completos (por que cada escolha, troubleshooting) foram dados na
conversa, aqui fica o runbook:

**0. Pré-requisito: código em algum lugar que a VPS consiga baixar.**
Hoje o repo (`D:\ProjetoCodex`, remoto `salveyuri/ProjetoCodex` no
GitHub) tem muito trabalho não commitado (ver seção "Desenvolvimento"
acima). Antes do deploy, alguém precisa revisar e commitar/dar push —
isso continua exigindo confirmação explícita do Yuri, nunca é feito
automaticamente. Alternativa sem Git: copiar os arquivos pra VPS via
`scp`/`rsync` direto do Windows.

**1. Supabase**: criar projeto (região `São Paulo`), guardar a senha do
banco, copiar a connection string em *Project Settings → Database →
Connection string → Session pooling* (porta `5432` via pooler — funciona
como Postgres normal, sem flag extra no Prisma).

**2. VPS**: 2 vCPU / 4 GB RAM / ~60-80 GB SSD, Ubuntu 24.04 LTS. Provedor
com região São Paulo (ex. Vultr) reduz latência pros usuários no Brasil;
Hetzner/DigitalOcean são alternativas mais baratas/maduras sem região BR.

**3. Domínio**: comprar (Registro.br pra `.com.br`, ou qualquer registrar
pra `.com`), apontar registro `A` pro IP da VPS.

**4. VPS — setup inicial**: usuário não-root com sudo, `ufw` (só
`OpenSSH`/`80`/`443` liberados — nunca `3000`/`3001` direto), instalar
Docker Engine + Compose plugin, Nginx, Certbot
(`certbot python3-certbot-nginx`).

**5. Deploy**: clonar/copiar o repo, `cp .env.example .env` e preencher
(`DATABASE_URL` do Supabase, `JWT_SECRET` via `openssl rand -base64 48`,
`CORS_ORIGIN`/`APP_BASE_URL`/`NEXT_PUBLIC_API_URL` com o domínio real
**https**, `ASAAS_ENV=production`, `ASAAS_API_KEY` de produção,
`ASAAS_WEBHOOK_TOKEN` via `openssl rand -hex 32`). Depois:
```bash
docker compose build
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d
```

**6. Nginx + HTTPS**: copiar `deploy/nginx.conf.example` pra
`/etc/nginx/sites-available/`, trocar `your-domain.example` pelo domínio
real, `ln -s` pra `sites-enabled`, `nginx -t && systemctl reload nginx`,
depois `certbot --nginx -d seudominio.com -d www.seudominio.com` (HTTPS +
renovação automática).

**7. Pós-deploy**: registrar pelo site → `docker compose run --rm backend
npx prisma db seed` (com `SEED_ADMIN_EMAIL` setado) pra virar `ADMIN` →
`/admin/plans` pra editar os preços reais de Pro/Enterprise (hoje são
placeholders da seed) → cadastrar o webhook de verdade no painel do Asaas
(`https://seudominio.com/api/webhooks/asaas`, mesmo valor de
`ASAAS_WEBHOOK_TOKEN`) → confirmar que a conta Asaas está em modo
produção (não sandbox), com o cadastro/verificação deles completo.

### Como rodar localmente (Docker), pra validar antes de ir pra VPS

```bash
cp .env.example .env        # DATABASE_URL do Supabase (ou local), JWT_SECRET, etc.
docker compose build
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npx prisma db seed   # opcional, se SEED_ADMIN_EMAIL estiver setado
docker compose up -d
curl http://localhost:3001/api/health
curl http://localhost:3000
```

`TRUST_PROXY_HOPS` agora é `1` por padrão no `docker-compose.yml` (correto
pro cenário de produção, com Nginx sempre na frente) — só mudar se **não**
houver Nginx na frente (ex.: teste local direto nas portas do compose).

## Ambiente de dev/staging (decidido em 2026-08-22)

**Por quê**: o dev local (Windows, sem HTTPS público) não consegue testar o
clique real de "Assinar" até o Checkout hospedado do Asaas — ver a
limitação de `successUrl`/`cancelUrl` na seção seguinte. Decisão com o
Yuri: **mesma VPS de produção** (não contratar uma nova — 2 vCPU/4GB tem
folga pra um segundo stack pequeno), com **Postgres local em Docker** só
pra dev (não um segundo projeto Supabase) — zero custo, zero dependência de
rede externa, fácil de resetar. Ver `Contextos/Decisoes.md` (2026-08-22)
pro raciocínio completo.

**Isolamento**: segundo clone do repo numa pasta irmã da de produção (não
a mesma pasta com flags diferentes — o nome do diretório vira o "project
name" do Docker Compose automaticamente, então networks/volumes nunca
colidem com os de produção). Subdomínio próprio (`dev.pricify3d.com`),
portas de host diferentes (`3011`/`3010`/`5433` em vez de `3001`/`3000`),
tudo amarrado a `127.0.0.1` (mesmo padrão de produção — `ufw` não precisa
mudar). Banco, `JWT_SECRET`, `ASAAS_WEBHOOK_TOKEN` e chave do Asaas são
**sempre diferentes** dos de produção; `ASAAS_ENV=sandbox` sempre.

### Arquivos

- `docker-compose.dev.yml` (raiz) — mesma forma do `docker-compose.yml` de
  produção, com um serviço `postgres` a mais (Postgres 16, volume
  `postgres_dev_data`, porta `127.0.0.1:5433:5432`) em vez de apontar pro
  Supabase.
- `.env.dev.example` (raiz) — mesmo formato do `.env.example` de produção,
  com `POSTGRES_PASSWORD` novo (em vez de `DATABASE_URL` externa) e os
  domínios/chaves trocados pro ambiente de dev.
- `deploy/nginx-dev.conf.example` — cópia de `deploy/nginx.conf.example`
  com `server_name dev.pricify3d.com` e `proxy_pass` pras portas de dev.

### Runbook (na VPS, pasta separada da de produção)

```bash
git clone git@github.com:salveyuri/ProjetoCodex.git pricify3d-dev
cd pricify3d-dev/3d-budget-saas
cp .env.dev.example .env   # preencher POSTGRES_PASSWORD, JWT_SECRET,
                            # ASAAS_API_KEY (sandbox), ASAAS_WEBHOOK_TOKEN,
                            # RESEND_API_KEY (obrigatoria - ver nota abaixo)
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml run --rm backend npx prisma migrate deploy
docker compose -f docker-compose.dev.yml up -d
curl http://127.0.0.1:3011/api/health
```

Depois: copiar `deploy/nginx-dev.conf.example` pra
`/etc/nginx/sites-available/dev.pricify3d.com`, `ln -s` pra
`sites-enabled`, `nginx -t && systemctl reload nginx`, e
`certbot --nginx -d dev.pricify3d.com` (registro DNS `A` de
`dev.pricify3d.com` pro mesmo IP da VPS precisa existir antes).

**Achado real ao executar (2026-08-24): `RESEND_API_KEY` é obrigatória
aqui, apesar de ser "dev".** `docker-compose.dev.yml` seta
`NODE_ENV=production` de propósito (cookies seguros, respostas de erro
discretas - correto pra um domínio HTTPS público de verdade), mas
`resolveResendApiKey()` em `backend/src/config/env.ts` trava o boot sem
essa chave sempre que `NODE_ENV=production`, **sem olhar pro
`ASAAS_ENV`**. A orientação original de deixar `RESEND_API_KEY` em
branco no `.env.dev` estava errada - `.env.dev.example` já corrigido pra
deixar isso claro. Solução: reusar a mesma `RESEND_API_KEY` de produção
(o Resend não tem modo sandbox; e-mails de teste saem de verdade, mas
quem testa esse ambiente é o próprio Yuri).

**Execução real na VPS**: repo clonado (via SSH, `git@github.com:...` -
a produção já usa SSH nesse mesmo usuário, então o clone do dev puxou a
chave automaticamente sem configurar nada novo) em `~/app-dev` (irmã de
`~/app`, onde a produção já roda). Postgres e frontend subiram de
primeira; backend caiu em crash loop pelo motivo do parágrafo acima,
corrigido no mesmo dia. Atualizar esta nota quando o runbook terminar
(Nginx/HTTPS/webhook do Asaas/checkout de ponta a ponta ainda
pendentes).

## Variáveis de ambiente (backend)

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma. |
| `JWT_SECRET` | Segredo para assinar o access token; obrigatório em produção. |
| `JWT_EXPIRES_IN` | Expiração do **access token** (curto — default `15m` desde 2026-08-12; era `7d` antes de existir refresh token). |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Expiração do refresh token opaco, em dias (default `30`). Adicionado em 2026-08-12 junto do refresh token com rotação — ver `Contextos/Decisoes.md`. |
| `CORS_ORIGIN` | Origens permitidas para o frontend (`localhost`/`127.0.0.1` em dev). **Nunca pode conter `*`** — o boot falha de propósito (`env.ts`), porque a API sempre manda `credentials: true`. |
| `PORT` | Porta da API, padrão `3001`. |
| `TRUST_PROXY_HOPS` | Número de hops de reverse proxy a confiar para `X-Forwarded-For` (usado pelo `express-rate-limit`). Default `0` (não confia em nenhum proxy — igual hoje, sem proxy na frente). Adicionado em 2026-08-13; setar para `1` quando o Nginx planejado entrar em produção (ver `Notas/TODO.md`). |
| `APP_BASE_URL` | Origem pública do frontend, usada para montar as `callback.successUrl/cancelUrl/expiredUrl` do checkout Asaas. Default `http://localhost:3000`. **O Asaas rejeita URLs não-`https`** (ver nota abaixo) — em produção precisa ser a URL real com HTTPS. Adicionado em 2026-08-13. |
| `ASAAS_ENV` | `sandbox` (default) ou `production` — resolve a base URL da API Asaas (`api-sandbox.asaas.com` vs `api.asaas.com`). Adicionado em 2026-08-13. |
| `ASAAS_API_KEY` | Chave de API do Asaas (header `access_token` em toda chamada). Obrigatória em produção (boot falha se ausente). Adicionado em 2026-08-13. |
| `ASAAS_WEBHOOK_TOKEN` | Segredo que escolhemos e cadastramos também no lado do Asaas ao criar o webhook — verificado contra o header `asaas-access-token` de cada chamada recebida em `POST /api/webhooks/asaas`. Obrigatório em produção. Adicionado em 2026-08-13. |
| `RESEND_WEBHOOK_SECRET` | Segredo que o **Resend** gera (não escolhemos) ao criar o webhook via `npm run resend:register-webhook` — verificado via `svix` nos headers `svix-id/svix-timestamp/svix-signature` de `POST /api/webhooks/resend`. **Opcional mesmo em produção** (diferente do `ASAAS_WEBHOOK_TOKEN`): sem ela, a rota só confirma recebimento sem processar — só deixa de preencher a coluna "Entrega" em `/admin/email-templates`, nunca trava o boot nem o envio de e-mail. Adicionado em 2026-08-19. |
| `EMAIL_SUBJECT_PREFIX` | Opcional — quando definida, prepende esse texto (mais um espaço) no assunto de todo e-mail enviado (`email.service.ts#send`), incluindo os de teste. Vazia em produção; o `.env.dev.example` já vem com `"[DESENVOLVIMENTO]"` pra nunca confundir um e-mail de teste com um real na caixa de entrada. Adicionado em 2026-08-24. |

### Limitação conhecida: testar o checkout do Asaas localmente

O Asaas **rejeita `callback.successUrl/cancelUrl/expiredUrl` que não sejam
`https://`** — confirmado testando contra o sandbox real (`http://localhost:3000/...`
retorna `400 "O campo successUrl é inválido."`, mesmo com `customerData`
omitido). Isso significa que `POST /billing/checkout` para um plano pago
**sempre falha em dev local** com `APP_BASE_URL=http://localhost:3000`
(comportamento correto e esperado, não é bug). Para testar o clique real de
"Assinar" → redirecionamento → página hospedada do Asaas de ponta a ponta
localmente, seria necessário um túnel HTTPS (ex. ngrok/cloudflared) apontando
pro frontend, com `APP_BASE_URL` setado pra URL do túnel. Em produção, com
`APP_BASE_URL` sendo o domínio real (HTTPS), isso não é um problema.
A criação do checkout em si (sem o clique/redirecionamento) e todo o
processamento do webhook foram validados de ponta a ponta contra o sandbox
real sem precisar desse túnel — ver `Contextos/Chat.log` (2026-08-13).

## Testes automatizados

- `npm --workspace @3d-budget/backend run test` (ou `npx vitest run` dentro
  de `backend/`) — 57 testes: unitários (`formula-engine`,
  `CalculationService`) + integração via `supertest` contra o app Express
  real.
- **Os testes de integração usam o mesmo Postgres local de dev** (o mesmo
  `DATABASE_URL` do `npm run dev`) — não existe banco de teste isolado
  ainda. Cada teste registra empresas com e-mail
  timestamp+random (`test-<label>-<timestamp>-<random>@example.com`) para
  não colidir entre execuções, mas os dados criados **não são limpos**
  depois — aceitável para uma máquina de dev, não seria para CI ou banco
  compartilhado. Se algum dia houver CI (`DEVOPS-001`), isso vai precisar
  de um banco de teste dedicado (container efêmero, `DATABASE_URL` próprio
  do CI).
- Os testes de integração setam `TRUST_PROXY_HOPS=1` no ambiente de teste
  (`backend/vitest.config.mts`) e mandam um `X-Forwarded-For` diferente por
  registro de empresa, para simular clientes diferentes e não esbarrar no
  rate limit de `/api/auth/register` (5/min por IP) — isso reusa a mesma
  configuração de `TRUST_PROXY_HOPS` que existe para produção atrás de
  proxy (ver tabela acima).
- `backend/vitest.config.mts` usa `pool: "threads"` — o pool padrão
  (`forks`) travava um worker de forma intermitente no Windows (~1 em 4
  execuções) ao carregar o binário nativo do Prisma num processo filho
  recém-criado; threads compartilham o processo e evitaram isso.

## Checklist de validação usado antes de dar uma mudança por concluída

Nas sessões anteriores, o padrão de validação por bloco de trabalho foi:

1. `npm --workspace @3d-budget/<pacote> run lint`
2. `npx tsc -p <tsconfig> --noEmit` (quando TypeScript puro, sem rebuild completo)
3. `npm --workspace @3d-budget/<pacote> run build` (ou `npm run build` na raiz
   para os três pacotes em sequência)
4. `npx prisma validate` / `npx prisma migrate deploy` quando o schema mudou
5. Smoke test manual dos endpoints afetados (via curl/porta temporária) e,
   quando a mudança é de UI, validação no navegador local
   (ver skill `run`/preview do Claude Code para isso).

Manter esse mesmo rigor em novas tarefas — ver também
`Contextos/Convencoes.md`.
