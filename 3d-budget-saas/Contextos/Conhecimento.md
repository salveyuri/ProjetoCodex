# Conhecimento — bugs resolvidos e aprendizados

Migrado de `CONTEXT.md` em 2026-08-12. Registre aqui bugs de produção/dev já
resolvidos e vetores de ataque já fechados, para não reabrir a mesma
investigação depois.

---

## Bugs resolvidos

### `ASAAS_API_KEY` some silenciosamente no Docker Compose (chave começa com `$`)
- **Sintoma:** em produção (VPS), `docker compose build`/`up` falhava com
  `error while interpolating services.backend.environment.ASAAS_API_KEY:
  required variable ASAAS_API_KEY is missing a value`, precedido de vários
  `WARN[0000] The "aact_prod_..." variable is not set. Defaulting to a
  blank string.` — mesmo com a chave preenchida no `.env`.
- **Causa raiz:** as chaves do Asaas começam com um **`$` literal** (ex.:
  `$aact_prod_...`, `$aact_hmlg_...`). Sem aspas no `.env`, o parser de
  interpolação do Docker Compose trata `$aact_prod_...` como referência a
  **outra** variável de ambiente (estilo shell), não encontra nada com
  esse nome, e zera o valor — daí o `ASAAS_API_KEY` chegar vazio e cair no
  guard `:?` do `docker-compose.yml`. O `dotenv` do Node (usado em
  `npm run dev`, fora do Docker) **não** tem esse problema — não expande
  `$` por padrão — por isso o sandbox funcionou normal nos testes durante
  o desenvolvimento, e o bug só apareceu em produção via Compose.
- **Solução:** sempre envolver o valor em **aspas simples** no `.env`
  usado pelo `docker-compose.yml`: `ASAAS_API_KEY='$aact_prod_...'`.
  Aspas simples impedem qualquer expansão. Avisos adicionados nos
  comentários de `.env.example` (raiz e `backend/`).
- **Incidente relacionado:** a chave de produção do Yuri apareceu em texto
  puro na saída de terminal que ele colou no chat ao reportar o erro
  (o warning do Compose ecoa o valor não resolvido). Orientei rotacionar a
  chave no painel do Asaas imediatamente — tratada como comprometida assim
  que exposta em qualquer lugar fora do `.env` do servidor.

### `prisma migrate deploy` falha em produção — libssl ausente na imagem Docker
- **Sintoma:** rodando `docker compose run --rm backend npx prisma migrate
  deploy` na VPS, aparecia `prisma:warn Prisma failed to detect the
  libssl/openssl version to use... Defaulting to "openssl-1.1.x"` seguido
  de `Error: Schema engine error:`. Depois de subir os containers mesmo
  assim, `curl /api/health` retornava `Recv failure: Connection reset by
  peer` (o backend crashava/reiniciava em loop).
- **Causa raiz:** `node:20-slim` (base do `backend/Dockerfile`) é Debian,
  mas **não inclui `libssl`** por padrão — o engine nativo do Prisma
  precisa dele em tempo de execução (e também no momento do `prisma
  generate`, pra saber qual engine bundlar). Sem `libssl`, o Prisma nem
  sempre falha alto e claro — às vezes só "adivinha" a versão errada e
  quebra de forma menos óbvia depois.
- **Solução:** `RUN apt-get update && apt-get install -y
  --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*`
  adicionado em **duas** stages do `backend/Dockerfile` — `deps` (propaga
  pra `build`, onde `prisma generate` roda) e `runtime` (stage final,
  onde `prisma migrate deploy`/`db seed`/o servidor rodam de verdade —
  é um `FROM node:20-slim` novo, não herda o que foi instalado em `deps`).
- **Por que só apareceu em produção:** localmente o Prisma roda via
  `npm run dev`/`tsx` direto no Windows, nunca dentro do container Debian
  — o Dockerfile nunca tinha sido testado de fato até o deploy real na
  VPS (ver `Contextos/Ambientes.md`, "não testado com Docker de verdade").

### React input uncontrolled → controlled em `/dashboard/settings`
- **Sintoma:** React alertava mudança de input uncontrolled para controlled
  em `frontend/src/app/dashboard/settings/page.tsx`.
- **Causa raiz:** campos novos de `ProductionSettings` podiam chegar
  `undefined` em respostas antigas/intermediárias, fazendo o `NumberField`
  receber `value={undefined}` e depois um número.
- **Solução:** `normalizeSettings()` mescla qualquer payload de settings com
  `defaultSettings`; `NumberField` usa `safeValue = 0` quando recebe valor
  não finito.

### Acesso admin bloqueado por role antiga em cache
- **Sintoma:** usuário promovido manualmente a `ADMIN` no banco continuava
  vendo "Acesso restrito" em `/admin/users`, mesmo com token válido.
- **Causa raiz:** frontend usava `role` cacheada em `localStorage`/JWT antigo
  como autoridade de acesso, e middlewares de plano também confiavam na role
  do payload do JWT em vez de reconsultar o banco.
- **Solução:** `AuthProvider` passou a revalidar a sessão em
  `GET /api/auth/me` no bootstrap (`refreshUser()`); `/admin/users` deixou de
  bloquear no client e passou a confiar só no `403` da API; middlewares de
  plano consultam a role atual do banco antes de aplicar bypass ADMIN. Tokens
  JWT antigos com role legada `CUSTOMER` continuam aceitos e são normalizados
  para `USER` em runtime.

### Download de PDF sem mensagem de erro útil
- **Sintoma:** erro genérico ao baixar PDF quando o backend retornava
  HTML/JSON (ex.: API desatualizada) em vez de PDF.
- **Solução:** tratamento de erro do download passou a extrair mensagens
  reais de respostas `blob`, inclusive quando o corpo não é PDF.

### Backend servindo build antigo sem rota de PDF
- **Sintoma:** `GET /api/quotes/:id/pdf` não existia em runtime mesmo após o
  código ser criado.
- **Causa raiz:** o processo local em `3001` estava rodando `dist/server.js`
  (build antigo) em vez do código-fonte atualizado.
- **Aprendizado:** após adicionar rota/endpoint novo, reiniciar com
  `npm --workspace @3d-budget/backend run dev` (ou rebuildar) antes de
  validar — não assumir que o processo já rodando reflete o código atual.

## Vetores de ataque já fechados (não reabrir a investigação)

- **IDOR por troca manual de UUID na URL** (`/api/quotes/:id`,
  `/api/machines/:id`, `/api/materials/:id`, `/api/formulas/:id`,
  `/api/quotes/:id/pdf`): anulado — todas as mutações/consultas críticas usam
  `{ id, companyId }` via `updateMany`/`deleteMany`/`findFirst`, e IDs de URL
  passam por `idParamSchema` (UUID estrito) antes de chegar aos services.
- **Injeção de JS em fórmulas / chamada de APIs globais do runtime**:
  anulado — `formula-engine` bloqueia identificadores perigosos (`process`,
  `require`, `constructor`, `eval`, `Function`, `console`, `window`,
  `globalThis`, `prototype`, `__proto__`, etc.) e caracteres como colchetes,
  aspas, crase, ponto e vírgula e setas antes do parse; parser (`expr-eval`)
  roda com acesso a membros desativado e operadores de atribuição,
  comparação, condicional, lógica, `in`, aleatório e definição de função
  bloqueados.
- **Payload pollution por campos extras** (ex.: `role`, `planType`,
  `subscriptionStatus` injetados em payload de usuário comum): anulado —
  schemas Zod `.strict()` em auth/billing/admin/máquinas/materiais/
  settings/cálculo/fórmulas/orçamentos.
- **Strings maliciosas em campos numéricos monetários/percentuais**:
  anulado — payload JSON usa `z.number()` (não `z.coerce.number()`).
- **Brute-force de login**: mitigado por `express-rate-limit` — 5
  tentativas/min por IP em `/api/auth/login` (`429 RATE_LIMIT_LOGIN`);
  confirmado por smoke test (5 tentativas inválidas → `400`, 6ª → `429`).
- **Vazamento do mecanismo de proteção via mensagem de erro** (2026-08-13):
  anulado — a tela de `/admin/users`/`/admin/analytics` dizia literalmente
  "disponível apenas para usuários com role ADMIN" quando um usuário comum
  tentava acessar, e o backend retornava mensagens tipo "Admin privileges
  required."/"Machine is not accessible for this company." — ambos
  entregavam de bandeja qual checagem exata barrou o acesso. Fechado em
  duas camadas: (1) backend — `ADMIN_REQUIRED`, `MACHINE_FORBIDDEN`,
  `MATERIAL_FORBIDDEN`, `QUOTE_FORBIDDEN`, `FORMULA_FORBIDDEN` e o
  `AUTH_TOKEN_INVALID` de payload de JWT malformado agora usam mensagens
  genéricas ("Access denied."/"Invalid or expired token.") — os **códigos**
  continuam distintos (uso legítimo por quem consome a API), só a frase
  humana parou de descrever o motivo exato; (2) frontend —
  `frontend/src/lib/api-error.ts` (novo) centraliza a tradução de erro em
  **allowlist**: só um conjunto pequeno de códigos conhecidos e seguros
  (`INVALID_CREDENTIALS`, `EMAIL_ALREADY_EXISTS`, `PLAN_LIMIT_REACHED`
  etc.) vira mensagem amigável; qualquer código fora da lista — incluindo
  todo `*_FORBIDDEN`/`ADMIN_REQUIRED` — cai numa mensagem genérica por
  tela. Isso substituiu uma função `getApiErrorMessage`/`getErrorMessage`
  **duplicada em 12 arquivos**, que ecoava o campo `message` cru do backend
  direto na tela sempre que o código não era tratado — ver
  `Contextos/Decisoes.md` para o padrão a seguir em telas novas.

## Bugs encontrados e corrigidos durante a implementação do refresh token (2026-08-12)

Achados nesta própria rodada, ao implementar SEC-001/SEC-002 (ver
`Contextos/Decisoes.md`). Registrados aqui porque não são óbvios e podem
se repetir se alguém mexer nesse código sem saber.

### Cookie do refresh token com `Path` errado quebrava o login na UI
- **Sintoma:** login funcionava (o backend retornava `201`/`200` e setava o
  cookie), mas o frontend redirecionava de volta para `/login` em vez de ir
  para `/dashboard`.
- **Causa raiz:** o cookie foi setado com `Path=/api/auth` (defesa em
  profundidade para "só backend vê"). Só que o `Path` de um cookie é
  comparado contra a URL da requisição, **não** contra qual servidor a
  recebe. `frontend/src/proxy.ts` roda no servidor do Next.js (porta 3000)
  e precisa do cookie em requisições para `/dashboard`, `/admin` etc. —
  caminhos que não começam com `/api/auth`, então o navegador nunca
  enviava o cookie nessas navegações, e o middleware via "sem sessão".
- **Solução:** `Path=/` no cookie. Isso faz o cookie ser enviado em toda
  requisição para o host (incluindo chamadas de API que não precisam dele,
  mas isso é inofensivo — elas simplesmente não leem `req.cookies.refresh_token`).
- **Aprendizado:** ao decidir o `Path` de um cookie de sessão num app com
  frontend e backend em processos/portas diferentes, pensar em **todas as
  origens que precisam ler o cookie**, não só em qual serviço o emite.

### Detecção de reuso do refresh token derrubava sessões legítimas (StrictMode/reload)
- **Sintoma:** no navegador, dar F5 na página logo após o login às vezes
  travava a tela em skeleton para sempre; `localStorage` ficava vazio
  (sessão limpa) mesmo o cookie tendo acabado de ser emitido.
- **Causa raiz 1:** duas chamadas de refresh quase simultâneas com o mesmo
  cookie (StrictMode do React remontando efeitos em dev, ou duas abas)
  faziam a segunda chamada encontrar o token já rotacionado pela primeira e
  tratar isso como roubo — revogando a família inteira por engano.
  Corrigido com um período de graça de 5s (`REUSE_GRACE_PERIOD_MS`).
- **Causa raiz 2 (mais sutil — bug na própria correção da causa raiz 1):**
  o período de graça inicialmente valia para **qualquer** token com
  `revokedAt` recente, sem distinguir "revogado porque rotacionou
  normalmente" de "revogado porque a família inteira foi morta por
  detecção de roubo real". Resultado: reusar um token-irmão logo depois de
  uma revogação por roubo real ainda passava pela graça e reautenticava —
  a revogação de família não era realmente definitiva por 5 segundos.
  Corrigido restringindo a graça a tokens com `replacedByTokenHash`
  preenchido (só quem foi rotacionado individualmente tem direito a ela;
  quem foi mass-revogado via `updateMany` nunca tem).
- **Aprendizado:** ao adicionar tolerância/graça em cima de uma lógica de
  segurança "tudo ou nada", verificar explicitamente se a graça também
  vaza para os casos que a lógica original queria bloquear — não basta
  testar só o caminho feliz da tolerância.
- **Armadilha de teste (não é bug do produto):** durante essa investigação,
  reinícios do backend via `Stop-Process`/`npm run dev` no Windows às vezes
  não derrubavam o processo antigo antes do novo tentar subir na mesma
  porta — o novo processo falhava com `EADDRINUSE` e ficava um processo
  **zombie antigo** ainda respondendo, fazendo parecer que uma correção não
  tinha efeito. Sempre confirmar via `GET /api/health` → `uptimeSeconds`
  baixo (poucos segundos) antes de reusar os resultados de um teste após
  reiniciar o servidor.

## Limitações/avisos conhecidos (não é bug, é decisão consciente)

- `npm audit --omit=dev` aponta vulnerabilidade **alta** em `expr-eval`, sem
  fix automático disponível — mitigada em runtime por whitelist de
  caracteres/identificadores (Bloco 13), mas não corrigida na origem. Não
  tentar "corrigir" automaticamente sem entender que a mitigação já existe.
- Aviso moderado `next → postcss@8.4.31`: o fix automático do `npm audit`
  sugere downgrade para Next 9, o que seria uma regressão grave — **não
  aplicar**; o `overrides` no `package.json` raiz já mantém `postcss` em
  faixa segura.

## Vitest com pool "forks" trava worker intermitentemente no Windows (2026-08-13)

- **Sintoma:** `npx vitest run` no backend falhava aleatoriamente
  (~1 em cada 4 execuções) com `Error: Worker exited unexpectedly` /
  `[vitest-pool]: Worker forks emitted error`, derrubando um dos arquivos
  de teste sem nenhuma asserção falhando — parecia flakiness aleatória.
- **Causa provável:** o pool padrão do Vitest (`forks`) sobe um processo
  filho novo por arquivo de teste; os testes de integração carregam o
  binário nativo do Prisma nesse processo recém-criado, e no Windows isso
  ocasionalmente colide com o mesmo tipo de problema já documentado para
  `prisma generate` (DLL do query engine bloqueada/carregada de forma
  inconsistente entre processos).
- **Solução:** `pool: "threads"` em `backend/vitest.config.mts` — threads
  compartilham processo/módulo em vez de spawnar um processo OS novo por
  arquivo. Confirmado estável em mais de 10 execuções consecutivas depois
  da troca (antes falhava em ~25% delas).
- **Aprendizado:** se testes começarem a falhar de forma não-determinística
  no Windows sem nenhuma asserção quebrando (worker crash, não assertion
  error), suspeitar do pool de execução antes de assumir que é um teste
  ruim.

## Bug de produção: `ERR_MODULE_NOT_FOUND` no `shared` depois de dividir `index.ts` em vários arquivos (2026-08-17)

- **Sintoma:** depois de um deploy (`git pull` + `docker compose build` +
  `migrate deploy` + `up -d`), o container do backend entrou em loop de
  restart. `docker compose logs backend` mostrou:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/shared/dist/countries' imported from /app/shared/dist/index.js`.
  Do lado do navegador isso aparecia como **502** em qualquer chamada de
  API (`/api/auth/refresh` etc) - o Nginx não conseguia falar com um
  backend que não subia.
- **Causa raiz:** `shared/src/index.ts` ganhou um novo arquivo separado
  (`countries.ts`) e um `export * from "./countries";` sem extensão. O
  pacote `shared` é consumido de **duas formas diferentes** neste
  monorepo: o **backend** roda o `dist/index.js` **compilado** direto com
  `node dist/server.js` (ESM nativo do Node, que **exige** a extensão
  `.js` em imports relativos); o **frontend** aponta
  `"@3d-budget/shared"` direto pro **código-fonte** via
  `frontend/tsconfig.json` (`"paths": {"@3d-budget/shared": ["../shared/src"]}`),
  resolvido pelo Turbopack, que **não** aceita a extensão `.js` apontando
  pra um arquivo `.ts`. Ou seja: qualquer forma de escrever esse import
  (`"./countries"` ou `"./countries.js"`) quebra um dos dois lados -
  nenhuma opção de extensão funciona pros dois consumidores ao mesmo
  tempo. Isso nunca tinha aparecido antes porque `shared/src/index.ts`
  sempre foi um arquivo único, sem nenhum import relativo interno.
- **Fix:** eliminar a fronteira de módulo - o conteúdo de `countries.ts`
  foi movido de volta pra dentro do próprio `index.ts` (sem nenhum
  `export * from`/`import` relativo). Resolve os dois consumidores por
  igual, já que não existe mais nenhum caminho de arquivo pra resolver.
- **Aprendizado:** dentro de `shared/src/`, **nunca dividir em múltiplos
  arquivos com import/export relativo entre eles** - manter tudo num
  `index.ts` só (mesmo que fique grande, como listas de dados estáticas).
  Se um dia for inevitável dividir, teria que alinhar
  `shared/tsconfig.json` (`moduleResolution`) e o path alias do frontend
  pra resolver de forma consistente nos dois lados - not trivial, evitar
  enquanto der.
- **Aprendizado maior:** `npm run build`/`tsc --noEmit` (o que rodo pra
  verificar antes de entregar) **não pega esse tipo de bug**, porque
  `moduleResolution: "Bundler"` do `shared/tsconfig.json` é permissivo
  sobre extensão em import relativo - o erro só aparece rodando o
  `dist/` de verdade com `node` puro (o que acontece só em produção,
  dentro do Docker). A partir de agora, depois de qualquer mudança em
  `shared/src/`, rodar
  `node -e "import('./shared/dist/index.js').then(m=>console.log(Object.keys(m)))"`
  (ou de fato subir `node dist/server.js` localmente por alguns segundos)
  como parte da verificação, além do `tsc --noEmit` de sempre.

### Supabase Security Advisor — RLS desabilitado em todas as 22 tabelas do `public`

- **Sintoma:** e-mail do Supabase em 2026-08-18 ("These issues require your
  immediate attention") + Security Advisor mostrando 22 erros críticos
  `RLS Disabled in Public`, um por tabela do schema `public` (todos os 20
  models do Prisma + `_prisma_migrations` + mais uma).
- **Causa raiz:** o Supabase expõe **toda** tabela do schema `public`
  automaticamente via uma API REST própria (PostgREST), autenticável com a
  `anon key` do projeto. Row-Level Security (RLS) é o que restringe o que
  essa API consegue ler/escrever; sem RLS, qualquer um com a `anon key`
  poderia ler/editar/apagar a tabela inteira **por fora** da autenticação
  do Express/Prisma. O Supabase sinaliza isso pra todo projeto, mesmo que
  a API REST nunca seja usada de fato.
- **Risco real neste projeto:** baixo na prática — confirmado por grep que
  o código nunca usa `@supabase/supabase-js`, `anon key` nem a API REST/
  GraphQL do Supabase em lugar nenhum (nem frontend nem backend). O
  `DATABASE_URL` é só uma connection string Postgres normal, consumida via
  Prisma, que nunca passa pela camada PostgREST. Ainda assim, corrigir é
  custo zero (dono de tabela sempre ignora RLS no Postgres, então o
  Prisma continua funcionando igual) e fecha a superfície residual (ex.:
  se a `anon key` vazar um dia sem querer).
- **Fix aplicado pelo Yuri em 2026-08-18** (rodado por ele direto no SQL
  Editor do Supabase, sem eu ter acesso ao projeto): habilitar RLS em
  toda tabela do `public` de uma vez, sem policy nenhuma (RLS habilitado
  + zero policies = acesso negado por padrão pra qualquer role que não
  seja dona da tabela — exatamente o que se quer aqui, já que nenhuma
  tabela deve ser acessada via PostgREST mesmo):
  ```sql
  DO $$
  DECLARE
    t text;
  BEGIN
    FOR t IN
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
  END $$;
  ```
- **Aprendizado:** ao decidir hospedar o Postgres no Supabase só pela
  connection string (sem usar o restante da plataforma), o Security
  Advisor deles continua rodando e sinalizando como se o projeto
  estivesse usando a API REST — vale revisar o Advisor de vez em quando
  mesmo sem intenção de usar PostgREST/Auth/Storage do Supabase, e
  aplicar `ENABLE ROW LEVEL SECURITY` (sem policy) em qualquer tabela
  nova como higiene padrão, já que não tem custo nem risco de quebrar o
  Prisma.

### Backend em crash loop em produção — `Cannot find module 'svix'`

- **Sintoma:** depois do deploy que adicionou o webhook do Resend
  (2026-08-19), `docker compose up -d` subia os containers mas o
  backend ficava reiniciando em loop (`docker compose exec backend ...`
  respondia "Container ... is restarting"). `docker compose logs
  backend` mostrava `Error: Cannot find module 'svix'` ao carregar
  `webhook.controller.js`, com `MODULE_NOT_FOUND`.
- **Causa raiz:** `svix` foi instalado (`npm install svix` rodado de
  dentro de `backend/`) e ficou registrado no `package-lock.json` como
  `backend/node_modules/svix` — **não** hoisted pra raiz do monorepo
  como todo outro dependency do backend (`resend`, `express`, etc.,
  todos em `node_modules/<pkg>` na raiz). Localmente isso não dava erro
  nenhum: rodando `node dist/server.js` de dentro de `backend/`, a
  resolução de módulo do Node sobe os diretórios e acha
  `backend/node_modules/svix` direto, sem precisar da raiz. Só que
  `backend/Dockerfile` (stage `runtime`) só copia **`/app/node_modules`
  (a raiz)** pro container — nunca `backend/node_modules` — porque
  todo o resto do projeto sempre dependeu só da raiz. Resultado: local
  "funcionava" e produção quebrava, mesma categoria do bug já registrado
  aqui sobre `libssl` (ambiente de teste local não reflete o container).
- **Por que só aconteceu com o `svix` e não com os outros pacotes:**
  não foi conflito de versão (conferido — nenhum outro pacote do
  monorepo depende de `svix`/`standardwebhooks`). Parece ter sido só um
  detalhe de como o `npm install <pkg>` incremental (rodado a partir de
  `backend/`, inclusive quando troquei a versão de `2.0.0` pra
  `1.99.1`) decide onde colocar um pacote novo — ele reaproveita a
  forma resolvida já existente no lockfile em vez de recalcular hoisting
  do zero, então nem `rm -rf node_modules && npm install` limpo
  resolvia sozinho.
- **Fix:** apagar manualmente as entradas `backend/node_modules/svix` e
  `node_modules/standardwebhooks` de dentro de `package-lock.json`
  (`packages`), forçando o npm a resolver os dois do zero na próxima
  instalação — só então ele hoisted os dois pra raiz
  (`node_modules/svix`), igual todo o resto. Confirmado com `npm ci`
  (o mesmo comando que o Dockerfile roda) que o resultado bate: sem
  `backend/node_modules` nenhum, tudo na raiz.
- **Aprendizado:** depois de adicionar **qualquer** dependência nova a
  um workspace deste monorepo, checar onde ela ficou registrada no
  `package-lock.json` (`grep -n '"node_modules/<pkg>"'` deve mostrar a
  entrada na **raiz**, não `backend/node_modules/<pkg>` nem
  `frontend/node_modules/<pkg>`) antes de considerar a mudança pronta —
  `tsc`/testes locais não pegam esse tipo de problema porque a
  resolução de módulo do Node funciona igual dos dois jeitos fora do
  Docker. Mais forte ainda: testar o `dist/` compilado simulando
  exatamente o que o `Dockerfile` copia (só `/app/node_modules` da
  raiz, sem `backend/node_modules`) antes de dar a mudança por
  concluída — não só rodar localmente com o `backend/node_modules`
  "de sobra" ainda no lugar.

### `vitest run` falhando de forma intermitente com "toHaveBeenCalledTimes(1) mas foi chamado 2x"

- **Sintoma:** ao adicionar `resend-webhook.routes.test.ts` e
  `email-log.routes.test.ts` (2026-08-20), a suite completa
  (`npm run test`) passou a falhar de vez em quando com
  `email-template-test.routes.test.ts` reportando
  `expected "send" to be called 1 times, but got 2 times` num teste que
  não tinha relação nenhuma com os arquivos novos.
- **Causa raiz:** `resendClient` é um singleton de módulo de verdade
  (`export const resendClient = {...}`) e vários arquivos de teste
  diferentes fazem `vi.spyOn(resendClient, "send")` cada um no seu
  próprio teste. `vitest.config.mts` já usava `pool: "threads"`
  (threads compartilham um processo/module cache, ao contrário de
  `forks` - decisão de 2026-08-13, documentada ali mesmo) **e**, por
  padrão, o Vitest roda arquivos de teste diferentes **em paralelo**.
  Combinando os dois: dois arquivos diferentes rodando ao mesmo tempo
  literal podiam acabar apontando pro mesmo `resendClient` em memória -
  uma chamada real disparada pelo teste do arquivo A ficava registrada
  no spy do arquivo B, que then contava errado. Já era um risco latente
  antes (`email.service.test.ts` e `email-template-test.routes.test.ts`
  já faziam a mesma coisa), só que com poucos arquivos a chance de
  colisão era baixa o bastante pra nunca ter aparecido - os 2 arquivos
  novos aumentaram o número de testes concorrentes mexendo no mesmo
  singleton o suficiente pra reproduzir com frequência.
- **Fix:** `fileParallelism: false` em `vitest.config.mts` - força os
  arquivos de teste a rodar um de cada vez (não só as threads dentro de
  um arquivo). Confirmado com 6 rodadas seguidas da suite completa: as
  116 asserções sempre passaram depois da mudança (nenhuma falha de
  contagem de chamada), contra falhar em pelo menos 1 de cada 3-4
  rodadas antes.
- **Achado à parte, não corrigido**: mesmo com `fileParallelism: false`,
  o processo do `vitest` ainda crasha ocasionalmente com um erro nativo
  do Windows (`Segmentation fault`, ou `STATUS_STACK_BUFFER_OVERRUN`)
  **depois** de todos os testes já terem passado (ou, mais raramente,
  no meio da suite) - mesma família do problema já documentado acima
  ("Prisma no Windows sob `threads`"), não parece 100% eliminado, só
  mitigado. Não bloqueia nada de verdade: é só o exit code do processo
  que fica errado às vezes, os resultados dos testes em si (visíveis no
  output do próprio `vitest`, antes do crash) sempre bateram certo nas
  6 rodadas. Não afeta o build/deploy (`docker compose build` nunca
  roda `vitest`, só `tsc`). Se aparecer de novo, rodar a suite mais uma
  vez costuma bastar - não é motivo pra desconfiar de um teste
  específico sem antes conferir se ele realmente reportou falha (`Tests
  N failed`) ou só o processo caiu depois de reportar sucesso.
- **Atualização 2026-08-20**: nessa rodada a frequência do crash subiu
  bastante - 7 tentativas seguidas de `npm run test` (suite completa,
  16 arquivos) travaram sem chegar a imprimir o resumo final (`EXIT:139`
  a maior parte, uma com stack trace completo de panic Rust através de
  `napi_register_module_v1`, o motor nativo do Prisma). "Rodar de novo"
  parou de ser suficiente sozinho dessa vez. **Contorno que funcionou**:
  dividir os 16 arquivos em 2 lotes de 8 e rodar cada lote com
  `npx vitest run <arquivo1> <arquivo2> ...` separadamente - os dois
  lotes passaram limpo (47 + 80 = 127 testes) na primeira tentativa de
  cada. Não investiguei a causa da piora (suspeita não confirmada: o
  banco de dev acumulou muitas linhas em `email_logs` ao longo da
  sessão, deixando algumas queries mais pesadas sob o pool `threads` -
  não teve tempo de validar essa hipótese). Se o crash voltar a ser
  raro nas próximas sessões, ignorar esta nota; se continuar frequente,
  vale considerar rodar a suite sempre em lotes por padrão em vez de
  como contorno pontual.

## Checkout Asaas real (clique-a-clique) não funciona em dev local

Testado em 2026-08-22: clicar em "Assinar" de verdade em `/dashboard/billing`
rodando local (`npm run dev`) sempre falha com `502 ASAAS_API_ERROR`. O corpo
do erro (logado no backend antes de virar `AppError` genérico) mostra o
motivo real: `successUrl`/`cancelUrl`/`expiredUrl` inválidos - essas URLs são
montadas a partir de `env.appBaseUrl` (`http://localhost:3000/...` em dev), e
o Asaas (sandbox ou produção) exige uma URL pública de verdade pra callback
de checkout, não aceita `localhost`. Isso **não é um bug** de nenhuma feature
específica (confirmado ao testar cupons - o payload chega certo até o Asaas,
com o valor já descontado, e só falha na validação da URL) - é uma limitação
de ambiente que sempre existiu nesse fluxo, só nunca tinha sido clicado de
ponta a ponta localmente antes. Pra testar o checkout pago clicando de
verdade, precisa ser num ambiente com `APP_BASE_URL` público (staging/prod)
- localmente, validar via `vi.spyOn(asaasClient, "createCheckout")` mockado
(padrão já usado em `coupon.routes.test.ts`) é o único jeito de exercitar
esse fluxo sem essa barreira.

## Banco de dev acumulou ~900 usuários ADMIN de teste — cuidado com features que iteram "todo admin"

Descoberto em 2026-08-22 implementando o alerta de e-mail por falha de
cupom (`emailService.sendCouponRevertFailed`, que envia pra
`prisma.user.findMany({ where: { role: "ADMIN", isActive: true } })`):
o banco de dev local tem **902 usuários com `role: ADMIN`** hoje. Causa:
o helper `promoteToAdmin` usado em vários arquivos de teste
(`system-formula.routes.test.ts`, `coupon.routes.test.ts`, etc.) promove
o usuário de teste registrado direto no banco real de dev - e nunca
reverte/limpa depois. Cada rodada da suíte completa soma mais usuários
promovidos, sem nenhuma limpeza automática (diferente do
`email-log-cleanup.job.ts`, que só cuida de `EmailLog` marcado
`isTest`).

Efeito prático já observado: uma feature nova que itere "todo admin
ativo" (como o alerta de cupom) dispara centenas de envios de teste toda
vez que a suíte roda - não trava os testes (medido: suíte inteira roda
em ~7s mesmo com o fan-out), mas polui `email_logs` ainda mais rápido e
deixa qualquer asserção baseada em "as últimas N linhas" não-confiável
(um teste precisou ser reescrito pra filtrar por `toEmail`/`dedupeKey`
específico em vez de contar/pegar as últimas linhas). Se uma futura
feature também iterar "todo admin", escrever o teste already pensando
nisso (filtrar pelo dado específico daquele teste, nunca por contagem
ou "top N recente").

Não foi feita nenhuma limpeza dos 902 registros - são dados de teste
plausivelmente inofensivos (nenhum standing pra produção depende
deles), mas apagá-los em massa é uma decisão do Yuri, não algo pra
fazer sem perguntar. Se isso virar um problema de verdade (suíte lenta,
banco de dev pesado), vale considerar: (a) um helper de teste que
desfaça `promoteToAdmin` no `afterEach`, ou (b) um script de limpeza
manual sob demanda.

## Docker Compose: pastas com o mesmo nome final colidem (derrubou produção)

Descoberto em 2026-08-24 no primeiro `docker compose up -d` do ambiente
de dev: `~/app/3d-budget-saas` (produção) e `~/app-dev/3d-budget-saas`
(dev) têm o mesmo nome de pasta final. O Docker Compose usa o nome da
pasta como "nome do projeto" quando nada é configurado explicitamente -
como os dois eram iguais, o Compose tratou as duas pastas como **o
mesmo projeto**. O `up -d` do dev recriou os containers `backend`/
`frontend` que já existiam (os de produção!) com a config errada
(portas de dev, Postgres local em vez do Supabase) - produção caiu
(502) até alguém notar.

Reconhecer: `docker compose ps`/`logs` rodado de dentro de uma pasta
mostrando containers/portas que não batem com o `docker-compose.yml`
daquela pasta é o sintoma - significa que outro projeto com o mesmo
nome default já criou containers com esses nomes.

Correção permanente: todo `docker-compose*.yml` de um segundo
ambiente **precisa** de um `name:` explícito no topo do arquivo (Compose
Specification), nunca depender do nome do diretório. `docker-compose.dev.yml`
tem `name: pricify3d-dev` - se outro ambiente for criado no futuro,
replicar isso desde o primeiro `up -d`, não depois de um incidente.

### Reincidência (2026-08-24, mesmas horas): a correção nunca tinha sido commitada de verdade

A frase acima ("já tem `name: pricify3d-dev`") foi escrita como se a
correção estivesse no git - mas a linha só existia como edição manual
aplicada direto na VPS durante a recuperação do incidente, nunca
commitada. Meses (na prática, horas) depois, numa sessão diferente,
sugeri descartar essa mesma linha como "mudança local redundante" (já
que parecia bater com o que eu achava que já estava commitado) pra
resolver um `git pull` travado - **derrubando produção pela segunda vez
com a causa raiz idêntica**: sem o `name:`, o `docker compose up -d` do
diretório de dev usou o nome de projeto default (`3d-budget-saas`, igual
ao de produção) e recriou os containers `backend`/`frontend` de
produção com a config de dev.

Recuperação (mesmo padrão da primeira vez): `docker rm -f` nos
containers fantasmas criados com nome errado (ficaram em `Created`,
nunca chegaram a rodar - o Postgres do serviço `postgres` do dev nem
conseguiu subir, porta 5433 já estava em uso pelo Postgres de dev de
verdade, o que impediu backend/frontend de sequer iniciar), depois
`docker compose build --no-cache && docker compose up -d` de dentro do
diretório de produção pra reconstruir as imagens de produção do zero
(rebuild sem cache é necessário aqui - o build do dev pode ter
sobrescrito a mesma tag de imagem, já que produção e dev usam os mesmos
`Dockerfile`s do monorepo).

**Lição real**: documentação que descreve uma correção como já aplicada
só vale alguma coisa se a correção estiver de fato no git. Uma edição
feita à mão na VPS durante uma recuperação de incidente tem que ser
commitada explicitamente na hora, com o mesmo cuidado que qualquer outra
mudança - "já documentei que fiz" não é o mesmo que "já commitei". Ver
`Contextos/Decisoes.md` (2026-08-24) pra o relato completo dessa
reincidência.

## Asaas Checkout nunca propaga `externalReference` pro pagamento gerado

Descoberto em 2026-08-24 testando um pagamento real de ponta a ponta no
sandbox (só possível depois que o ambiente de dev com HTTPS existiu -
ver `Contextos/Ambientes.md`). `POST /v3/checkouts` aceita um
`externalReference` na criação (usado pra tentar linkar o pagamento
resultante de volta a um registro nosso), mas **esse campo nunca chega
no payload do webhook do pagamento** - vem sempre `null`, confirmado
contra uma resposta real do Asaas. Isso quebrava silenciosamente a
ativação do primeiro pagamento de toda assinatura nova (ver
`Contextos/Decisoes.md`, 2026-08-24, "BUG CRÍTICO").

O campo que efetivamente correlaciona é `payment.checkoutSession` - o id
da sessão de Checkout do próprio Asaas, que já gravávamos como
`Checkout.asaasCheckoutId` desde a criação (`billing.controller.ts`).
Se algum dia mexer de novo nessa correlação: **nunca confiar em
`externalReference` de um pagamento vindo do produto Checkout do
Asaas** - só funciona pra chamadas que criam a cobrança diretamente
(`POST /v3/payments`/`POST /v3/subscriptions`), não pra quem passa pela
página hospedada. Testar contra um payload real (sandbox ou produção)
antes de confiar em qualquer suposição sobre o formato do webhook do
Asaas - os testes automatizados que simulavam esse payload reproduziam
a suposição errada do próprio código, não o formato real, e por isso
nunca pegaram esse bug.

## Supabase expõe toda tabela `public` sem RLS via PostgREST - mesmo sem usar PostgREST

Alerta automático do Supabase (2026-08-24): `Table public.coupons is
public, but RLS has not been enabled`. Esse app nunca usa a API
REST/client JS do Supabase (confirmado via grep - só Prisma, com o role
`postgres` do connection pooler), mas o Supabase expõe TODA tabela do
schema `public` via PostgREST por padrão, independente de a aplicação
usar isso ou não. Ao investigar, as **21 tabelas** do `schema.prisma`
estavam igualmente sem RLS - `coupons` foi só a primeira que o Supabase
alertou.

Correção: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sem nenhuma
policy, nas 21 de uma vez (migração
`20260824220000_enable_rls_all_tables`). Funciona sem quebrar nada
porque o role `postgres` (dono das tabelas) faz bypass automático de RLS
em Postgres - só fecha o acesso via PostgREST pros roles `anon`/
`authenticated`, que não têm nenhuma policy concedendo acesso. Virou
convenção permanente em `Contextos/Convencoes.md`: toda tabela nova
precisa disso na própria migração que a cria.

### Pegadinha ao aplicar: `docker compose run` usa a imagem já buildada

Ao tentar aplicar essa migração em produção, `docker compose run --rm
backend npx prisma migrate deploy` reportou "No pending migrations to
apply" mesmo com a migração nova já commitada e com `git pull` feito -
sem erro, sem aviso, silenciosamente incorreto. Causa: as migrations são
copiadas pra dentro da imagem Docker em tempo de **build**
(`COPY --from=build /app/backend/prisma ./backend/prisma` no
`backend/Dockerfile`) - `git pull` só atualiza o código-fonte no disco
da VPS, não a imagem já construída. `docker compose run` usa a imagem
existente, que ainda só conhecia as migrations de antes do pull.

Diagnosticado comparando a contagem de pastas locais
(`ls backend/prisma/migrations/*/ | wc -l`) com o "N migrations found"
que o comando imprime - divergiam (32 local vs. 31 na imagem). Fix:
sempre `docker compose build backend` antes de rodar uma migração nova,
nunca só `git pull` sozinho. Reforçado em
`Contextos/Convencoes.md`.
