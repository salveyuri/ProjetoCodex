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
