# Conhecimento — bugs resolvidos e aprendizados

Migrado de `CONTEXT.md` em 2026-08-12. Registre aqui bugs de produção/dev já
resolvidos e vetores de ataque já fechados, para não reabrir a mesma
investigação depois.

---

## Bugs resolvidos

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
