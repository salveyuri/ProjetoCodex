# Decisões de Arquitetura e Negócio

Migrado de `CONTEXT.md` (seção "Decisões de Arquitetura") em 2026-08-12, ao
adotar o padrão `Contextos/` já usado no projeto `atendimentos_app`. Novas
decisões devem ser adicionadas ao final, com a data.

---

## Estrutura geral

- Modular Monolith em monorepo simples: `frontend`, `backend` e `shared`
  ficam separados por responsabilidade, mas evoluem juntos.
- Backend usa Service Layer Pattern: controllers lidam com HTTP, services
  concentram regras de negócio, Prisma fica encapsulado no singleton
  `backend/src/config/prisma.ts`.
- Express dividido entre `app.ts` e `server.ts` para permitir testes
  unitários futuros sem subir uma porta real.
- `shared` existe para reduzir divergência de tipos em payloads comuns
  (ex.: `HealthCheckResponse`) — não depende de frontend, backend ou banco.
- Dependências internas usam `file:../shared` para compatibilidade com npm
  puro no ambiente Windows atual.
- Frontend usa Next.js 16+ com App Router e `src/`; `src/proxy.ts` substitui
  a convenção antiga de `middleware.ts` como guard de rota no Next 16.
- `overrides` no `package.json` raiz mantêm `postcss` em faixa segura quando
  dependências transitivas puxarem versões antigas — **não aplicar** o fix
  automático de `npm audit` para `next→postcss`, pois ele forçaria downgrade
  quebrante para Next 9.
- ESLint em flat config para acompanhar Next 16 e manter lint consistente
  entre frontend e backend.
- Paleta visual consolidada: base Slate/Zinc escura, ações primárias em
  Indigo/Violet, estados positivos em Emerald, alertas em Amber/Rose.

## Modelo de custo e cálculo

- `Machine`, `Material` e `PricingSettings` pertencem a `Company` — sem
  migração adicional para o motor de cálculo inicial.
- Custos fixos flexíveis (energia/kWh, taxa de cartão, taxa administrativa)
  ficam em `PricingSettings.extraFees` (JSON) para evoluir sem alterar
  colunas a cada nova variável.
- `calculateQuoteBreakdown` é uma função pura (recebe dados já resolvidos,
  retorna o breakdown); a busca no banco fica isolada em `CalculationService`.
- `PrintItem` persiste snapshots de custo — o valor histórico do orçamento
  não muda quando material, máquina ou settings mudam depois.
- Orçamento é multi-item: `Quote` é o container (totais agregados),
  `PrintItem` guarda os custos granulares por mesa.
- Preço final é produzido por uma fórmula salva no banco (parser seguro
  `expr-eval`, operadores restritos); componentes técnicos calculados com
  `Prisma.Decimal`. Se nenhuma fórmula estiver disponível ou falhar em
  runtime, o motor cai para a fórmula padrão do sistema
  (`formula.source = SYSTEM_FALLBACK`).
- Variáveis customizadas evoluíram de número simples para objeto tipado
  `{ value, type }` (`INTEGER`/`FLOAT`/`PERCENTAGE`), com leitura
  retrocompatível de valores legados (número puro → `FLOAT`).
- `depreciationCostPerHour` normaliza o custo da máquina por hora; se o
  schema evoluir para custo de compra + vida útil, esse campo poderá ser
  derivado por `machineCost / usefulLifeHours`.
- Motor usa `Prisma.Decimal` em toda operação monetária interna; arredonda
  só na saída (2 casas, `ROUND_HALF_UP`). Nunca usa `eval()`/`new Function()`.

## Fórmulas dinâmicas

- Tela de fórmulas adota o padrão "biblioteca-primeiro": a lista de fórmulas
  fica sempre visível; editor, variáveis disponíveis e teste só aparecem
  quando o usuário cria ou edita uma fórmula — reduz ruído visual e elimina
  sobreposições.
- `PdfService`/PDF: geração server-side com `pdfkit`, evita divergência
  entre navegadores; ownership validado por `companyId` no backend.

## Planos, RBAC e billing

- Monetização fica dentro do agregado `Company` — o plano controla recursos
  da empresa inteira, não apenas o login individual.
- Permissões administrativas são validadas no backend contra o banco a cada
  rota `/api/admin`, nunca dependendo de tokens antigos quando um usuário
  muda de role.
- Frontend não usa mais o usuário cacheado como autoridade final para
  `/admin/users`; tenta carregar a rota administrativa e só mostra "Acesso
  restrito" quando o backend retorna `403`.
- `AuthProvider` revalida a sessão em `GET /api/auth/me` no bootstrap e expõe
  `refreshUser()`, para refletir mudanças manuais de `role`/`company`/status
  sem exigir novo login.
- Middlewares de plano consultam a role atual do usuário no banco antes de
  aplicar bypass ADMIN, evitando que um JWT emitido antes da promoção
  continue impondo limites do plano Free.
- Gateway de pagamento isolado em `PaymentService` mock, para receber Stripe
  futuramente sem espalhar detalhes de SDK pelos controllers.
- Planos: `FREE`, `PRO`, `ENTERPRISE`. Status: `ACTIVE`, `CANCELED`,
  `PAST_DUE`. `BillingService` centraliza limites e sincroniza
  `currentQuotesCount` com os orçamentos do mês corrente antes de validar uso.
- Tokens JWT antigos com role legada `CUSTOMER` são aceitos temporariamente
  pelo middleware e normalizados para `USER` durante a migração
  (`20260512190000_plans_rbac`).

## Analytics, auditoria e observabilidade

- Analytics usa snapshots financeiros de `PrintItem` como fonte de verdade;
  relatórios não recalculam orçamentos antigos e preservam histórico mesmo
  após mudança de material, máquina ou fórmula.
- Cache em memória (`node-cache`): TTL de 5 min para métricas da empresa e
  10 min para métricas globais do Admin; mutações de orçamento, máquinas,
  materiais, erros e auditoria invalidam os caches relevantes.
- Logs HTTP migrados de `morgan` para `pino`/`pino-http`, com redaction de
  credenciais e níveis configuráveis por `LOG_LEVEL`.
- Middleware global de erro persiste falhas em `SystemError` e emite logs
  estruturados; rotas 404 não são persistidas (evita ruído operacional).
- Auditoria (`AuditLog`) é trilha append-only para mudanças sensíveis de
  usuário/plano, billing e fórmulas.

## Segurança e multi-tenancy

- Estratégia anti-IDOR: consultas e mutações usam `{ id, companyId }` nos
  agregados de empresa; recursos fora do tenant retornam `403` em vez de
  serem atualizados por `id` isolado.
- Payloads JSON de mutação usam schemas Zod `.strict()` e números/booleanos
  reais, sem coerção permissiva de strings em campos monetários, percentuais
  ou flags (query params continuam usando coerção controlada, pois o
  transporte HTTP exige string).
- `role`, `planType` e `subscriptionStatus` nunca são aceitos em payloads de
  usuário comum (schemas `.strict()`, sem endpoint `PATCH /api/users/me`);
  alteração manual fica restrita a `/api/admin/users/:id`.
- Upgrade/cancelamento de plano por usuário comum passa só por
  `/api/billing`, com plano validado por enum e `PaymentService` mock como
  fronteira futura para webhook Stripe assinado.

## Form de orçamento (UX)

- Formulário de orçamento separa estado parcial de estado persistível: mesas
  incompletas podem existir na UI, mas só mesas completas entram no preview,
  e todas precisam estar completas para salvar o `Quote`.

## Sessão/autenticação — refresh token com rotação (2026-08-12)

Implementado para resolver **SEC-001** e **SEC-002** do backlog de auditoria
(`Contextos/Auditoria.md`) — ver lá o achado original. Decisão tomada pelo
Yuri entre duas opções apresentadas (leve/tokenVersion vs. completa/refresh
rotativo): escolheu a **completa**, estilo OAuth.

- **Modelo:** access token JWT curto (`JWT_EXPIRES_IN`, default `15m`,
  assinado como antes) + refresh token opaco (`crypto.randomBytes(32)`,
  nunca um JWT) guardado só como **hash SHA-256** na tabela `RefreshToken`
  (nunca o valor bruto — mesmo princípio de `passwordHash`, mas hash rápido
  porque o segredo já tem alta entropia).
- **Entrega ao cliente:** o refresh token vai num cookie **HttpOnly**,
  `SameSite=Lax`, `Secure` só em produção, **`Path=/`** (não `/api/auth` —
  ver a pegadinha registrada em `Contextos/Conhecimento.md`). O access
  token vai no corpo da resposta JSON e o frontend
  guarda só em memória (nunca em `localStorage`/`document.cookie`).
- **Rotação com detecção de reuso:** cada `POST /api/auth/refresh` marca o
  token apresentado como revogado (`revokedAt` + `replacedByTokenHash`) e
  cria o próximo elo da cadeia com o mesmo `familyId`. Se um token **já
  revogado** for apresentado de novo, isso é tratado como sinal de roubo —
  mas só se ele foi revogado por **rotação individual** (tem
  `replacedByTokenHash` preenchido) e já passou o período de graça de 5s
  (`REUSE_GRACE_PERIOD_MS`); caso contrário a família inteira
  (`familyId`) é revogada na hora, matando todos os tokens daquela
  sessão/dispositivo — incluindo qualquer "irmão" que só existia porque
  foi mass-revogado (nunca teve rotação individual própria, então nunca
  tem direito à graça, mesmo que o `revokedAt` dele seja recentíssimo).
- **Por que o período de graça de 5s existe:** duas chamadas de refresh
  quase simultâneas usando o mesmo cookie ainda-não-rotacionado são
  esperadas em operação normal (StrictMode do React remontando efeitos,
  duas abas dando refresh ao mesmo tempo, um reload disparando duas
  requisições). Sem essa tolerância, cada uma dessas coincidências
  derrubava a sessão inteira por engano — bug real encontrado e corrigido
  durante a implementação (ver `Contextos/Conhecimento.md`).
- **`logout`** revoga a família do token apresentado (fim de uma
  sessão/dispositivo). **`logout-all`** (novo endpoint) revoga todas as
  famílias do usuário (todas as sessões/dispositivos). Os dois endpoints
  dependem só do cookie, não do `authMiddleware` — funcionam mesmo com o
  access token já expirado.
- **`accountStatusMiddleware`** (já existente) continua sendo a forma de
  "matar acesso AGORA" para uma conta desativada — consulta o banco em toda
  requisição autenticada, independente da validade do access token.
- Job de limpeza periódica das linhas expiradas/revogadas de
  `RefreshToken` foi **deliberadamente adiado** — não há infraestrutura de
  cron decidida ainda (`DEVOPS-001` no backlog de auditoria segue em
  aberto). Ver `Notas/TODO.md`.
- Login/logout/refresh **não** foram integrados ao `AuditLogService` —
  esse serviço é reservado a ações administrativas sensíveis hoje; auditar
  todo login/refresh seria escopo novo não pedido nesta rodada.

## Deploy — Docker genérico, sem plataforma escolhida (2026-08-13)

Implementado para resolver **`DEVOPS-001`** do backlog de auditoria
(`Contextos/Auditoria.md`). Perguntado ao Yuri onde pretende hospedar
(infra própria como o `atendimentos_app`, PaaS gerenciado, ou ainda sem
decisão) — escolheu **"ainda não decidi, só deixa pronto pra deploy"**.

- **Escopo:** preparar o monorepo pra rodar via Docker/Docker Compose de
  forma portável, sem assumir nenhuma nuvem/plataforma específica.
  **Deliberadamente fora de escopo**: CI/CD, domínio, TLS/certbot, e a
  escolha do host em si — tudo isso só faz sentido decidir quando o Yuri
  souber onde vai rodar.
- **`backend/Dockerfile`/`frontend/Dockerfile`** buildam com o **contexto
  na raiz do repo**, não isolados em cada pacote — é a única forma de um
  monorepo com npm workspaces (`@3d-budget/shared` como `file:../shared`)
  resolver corretamente dentro do Docker. `deps` stage copia o
  `package.json` de **todos** os workspaces (mesmo os que aquela imagem
  não roda) porque `npm ci` valida o grafo inteiro contra o
  `package-lock.json`; usa `--ignore-scripts` porque o `postinstall:
  "prisma generate"` do backend dispararia antes do `schema.prisma` ter
  sido copiado — o build stage já roda `prisma generate` explicitamente
  via `npm run build`.
- **`node:20-slim` (Debian), não Alpine** — evita o problema clássico de
  binário do query engine do Prisma compilado pra `musl` vs. `glibc`.
- **`frontend` usa `output: "standalone"`** do Next — em monorepo, o
  `server.js` gerado fica aninhado (`frontend/server.js` dentro do
  output), não na raiz; documentado em comentário no Dockerfile pra não
  virar uma pegadinha esquecida como a do `Path` do cookie de refresh.
- **`docker-compose.yml`**: Postgres **não publica porta pro host** por
  padrão (só rede interna do compose); `NEXT_PUBLIC_API_URL` vai como
  **build arg**, não variável de runtime — Next inlina `NEXT_PUBLIC_*` no
  bundle do client em build time, mudar depois exige rebuildar a imagem,
  não só reiniciar o container.
- **`TRUST_PROXY_HOPS=0` por padrão no compose** (não `1`) — sem Nginx
  plugado no `docker-compose.yml` por padrão, o backend fica exposto
  direto na porta `3001`; confiar em `X-Forwarded-For` nesse cenário seria
  inseguro (qualquer cliente direto poderia forjar o header). Só vira `1`
  quando um reverse proxy de verdade (`deploy/nginx.conf.example`) está na
  frente — mesma variável implementada pro `SEC-006`.
- **Seed padronizado** (`backend/prisma/seed.ts`): promove
  `SEED_ADMIN_EMAIL` a `ADMIN`, idempotente — substitui o "UPDATE users
  SET role" manual direto no banco que vinha sendo usado (inclusive
  durante os testes de integração do `TEST-001`).
- **Sem Docker disponível no ambiente onde isso foi implementado** — os
  Dockerfiles/compose foram escritos com cuidado seguindo boas práticas
  conhecidas, mas não puderam ser buildados/rodados de verdade aqui. O
  seed script e os Dockerfiles em si foram revisados manualmente; validar
  com `docker compose build && docker compose up` antes de confiar em
  produção.

## Mensagens de erro para o usuário — allowlist central (2026-08-13)

O Yuri pediu para tratar as telas de erro depois de ver uma que revelava o
mecanismo exato de proteção (`/admin/users` dizia "role ADMIN" pra quem não
era admin). Ver o vetor fechado em `Contextos/Conhecimento.md`.

- **Padrão a seguir em telas novas:** usar `getApiErrorMessage(error,
  fallbackText)` de `frontend/src/lib/api-error.ts` — **nunca** ler
  `error.response?.data?.message` direto num componente. Essa função só
  traduz um **allowlist** pequeno de códigos conhecidos-seguros (login
  inválido, e-mail duplicado, limite de plano, etc.); qualquer código fora
  da lista cai no `fallbackText` que cada tela passa (texto genérico
  contextual, tipo "Nao foi possivel salvar o orcamento."). Isso é
  deliberado: um allowlist (não uma blocklist) garante que um código de
  erro novo no backend cai no genérico por padrão, em vez de vazar sem
  querer até alguém lembrar de bloqueá-lo.
- **Backend:** mensagens de erro de autorização (`ADMIN_REQUIRED`,
  `*_FORBIDDEN`) viraram genéricas ("Access denied.") — o **código**
  continua específico (uso legítimo por quem consome a API), só a frase
  humana parou de descrever qual checagem exata rejeitou. Mensagens de
  erro de **negócio** para o dono do próprio recurso (limite de plano,
  assinatura atrasada, conta desativada, credenciais inválidas) não foram
  tocadas — são UX legítima, não revelam nada que ajude a burlar proteção
  de terceiros.
- Isso substituiu uma função `getApiErrorMessage`/`getErrorMessage`
  **duplicada em 12 arquivos** do frontend (mesmo código colado várias
  vezes — um problema de qualidade à parte, resolvido de brinde ao
  centralizar).

## Assinaturas via Asaas + planos administráveis (2026-08-13)

Substituiu o `PaymentService` mock (sempre "sucesso instantâneo") e o
enum fixo `SubscriptionPlan` por uma integração real com o
[Asaas](https://docs.asaas.com/) e uma tabela `Plan` administrável. Decisão
completa e alternativas descartadas em `Notas/TODO.md`; aqui só o "porquê"
arquitetural.

- **`Plan` substitui o enum inteiro** (não convive com ele) — `Company`
  passou a ter `planId` (FK, `onDelete: Restrict`) em vez de `planType` +
  colunas de limite fixas (`maxMachinesAllowed` etc., que só existiam em
  `Company`). Os limites agora vivem só em `Plan` e são lidos ao vivo via
  join — editar um plano no admin já reflete em todas as empresas daquele
  plano, sem precisar reaplicar nada por empresa. `Plan.features` é JSON
  (mesmo padrão de `PricingSettings.extraFees`) para permitir novos feature
  flags sem migração.
- **Checkout roda inteiramente no domínio do Asaas** (`Checkout Asaas`,
  `POST /v3/checkouts`) — cartão nunca toca nosso backend. O retorno é só
  um `link` para redirecionar o navegador; a confirmação de pagamento chega
  **de forma assíncrona por webhook**, nunca no redirect de volta (o
  próprio Asaas documenta isso explicitamente). Por isso existe o model
  `Checkout` (status `PENDING`→`PAID`/`EXPIRED`/`CANCELED`): guarda a
  tentativa de assinatura até o webhook confirmar, e seu `id` vai como
  `externalReference` pro Asaas — é o que liga o webhook de volta à
  empresa/plano certos antes de existir uma assinatura Asaas confirmada.
  `Payment` guarda o histórico de faturas de verdade (era um placeholder na
  tela de billing) e dá idempotência ao webhook via `upsert` por
  `asaasPaymentId` (Asaas garante só "at least once", pode reentregar).
- **Duas descobertas só confirmadas testando contra o sandbox de verdade**
  (a documentação do Asaas não deixa isso claro, e num caso ativamente
  contradiz o comportamento real):
  1. Para `chargeTypes: ["RECURRENT"]` (assinatura), o Asaas **rejeita
     qualquer `billingTypes` que não seja só `["CREDIT_CARD"]`** — Pix não
     tem produto de cobrança recorrente no Checkout Asaas (existiria via
     confirmação manual do pagador a cada ciclo, um fluxo diferente, fora
     de escopo). Por isso a decisão original ("cartão + Pix" no checkout)
     foi ajustada para **só cartão** — documentado no código
     (`asaas.service.ts`) e no `TODO.md`.
  2. Um `customerData` **parcial** (ex.: só `name`/`email`) faz o Asaas
     exigir o resto (`cpfCnpj`, `phoneNumber`, `address`, etc.) — mas
     **omitir `customerData` inteiramente é aceito** e deixa a própria
     página do Asaas coletar tudo. Por isso `asaas.service.ts` não envia
     `customerData` nenhum: além de contornar o bug, isso também significa
     que **não precisamos guardar CPF/CNPJ/endereço em `Company`** — menos
     dado sensível do nosso lado, reforça a promessa de segurança do
     checkout hospedado.
- **Mudança de plano (inclusive downgrade)** sempre passa por
  `billingService.applyPlan(companyId, planId, status)` — é a única função
  que muda o plano de uma empresa, chamada pelo checkout de plano grátis,
  pelo cancelamento, pelo webhook de confirmação de pagamento e pelo admin
  em `/admin/users`. Cancelar sempre volta pro plano seed de código `"free"`
  (`PlanService.getFreePlan()`), nunca deleta a assinatura Asaas
  silenciosamente sem tentar cancelá-la lá também
  (`asaasService.cancelSubscription`, best-effort — não bloqueia o
  downgrade local se a assinatura já não existir mais do lado do Asaas).
- **Webhook (`POST /api/webhooks/asaas`)** fica fora da cadeia
  `authMiddleware`/`accountStatusMiddleware` de propósito — o Asaas não
  manda JWT. Autenticidade é por comparação direta do header
  `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN` (segredo que
  escolhemos e cadastramos também no lado do Asaas). Resolve a empresa alvo
  em duas etapas: primeiro por `payment.subscription` →
  `Company.asaasSubscriptionId` (pagamentos de renovação), senão por
  `payment.externalReference` → `Checkout.id` (primeira confirmação, antes
  de existir uma assinatura Asaas na empresa). Só grava `AuditLog`/muda
  `Company` quando o estado derivado realmente muda, pra reentrega do
  mesmo evento (comportamento documentado do Asaas) não duplicar auditoria.
- **`webhook.validator.ts` é o único validator do projeto que não é
  `.strict()`** — de propósito: valida um payload externo e evolutivo do
  Asaas, não uma mutação interna nossa, então rejeitar campos
  desconhecidos tornaria a integração frágil contra o Asaas adicionar
  campos novos no futuro.
- Testado de ponta a ponta contra o sandbox real do Asaas (API key do
  Yuri): checkout criado com sucesso retornou um link real do
  `sandbox.asaas.com` que renderiza a página de pagamento de verdade;
  webhook simulado (`PAYMENT_CONFIRMED`) ativou o plano corretamente,
  reentrega do mesmo evento não duplicou auditoria, e token errado foi
  rejeitado com 401. Ver `Contextos/Chat.log` (2026-08-13) para o
  passo a passo completo.

## Catálogo de impressoras + custo de manutenção por hora (2026-08-14)

Pedido do Yuri: uma tabela de referência com impressoras 3D reais (FDM e
resina) pra alimentar um autocomplete no cadastro de máquina, mais uma
segunda variável de custo horário (manutenção, além da depreciação já
existente), ambas derivadas do **valor da impressora**.

- **`MachineCatalog`** é uma tabela de referência global (sem `companyId`,
  não pertence a nenhuma empresa) — populada só via seed na própria
  migração (63 modelos reais: Bambu Lab, Creality, Prusa, Anycubic, Elegoo,
  Phrozen, Qidi Tech, Flashforge, Sovol, Artillery, Voxelab, Peopoly, ≥4
  por marca). Nunca é escrita pelo usuário, só lida via
  `GET /api/machine-catalog?q=` pro autocomplete do campo Nome.
- **Preços do catálogo são referência, não cotação exata** — pesquisados no
  Mercado Livre/AliExpress quando encontrados, senão estimados via câmbio ×
  ~2 (regra de bolso pro custo de importação/Remessa Conforme, encontrada
  durante a pesquisa). O artifact publicado pro Yuri (2026-08-14, antes
  desta tabela) já vinha com uma bolinha verde/âmbar marcando pesquisado vs.
  estimado — essa distinção não foi trazida pro banco, só documentada aqui.
- **Fórmulas** (fornecidas pelo Yuri, aplicadas em `resolveMachineHourlyCosts`
  no `machine.service.ts` e replicadas no seed da migração):
  - FDM: `depreciação/h = (valor * 0.9) / 10000`, `manutenção/h = (valor * 0.3) / 2000`
  - SLA/Resina: `depreciação/h = (valor * 0.9) / 6000`, `manutenção/h = (valor * 0.35) / 1500`
- **`Machine.price` substitui a entrada direta de depreciação no
  formulário** — `depreciationCostPerHour` e o novo `maintenanceCostPerHour`
  nunca são aceitos do cliente (removidos do `machineSchema`), sempre
  recalculados no backend a partir de `price`+`type`. Mesmo padrão já usado
  em `Material.costPerGram` (derivado de `purchasePrice`/`totalWeightGrams`)
  — `machine.service.ts` replica o `ensureOwnership` + "normalizedInput"
  de `material.service.ts` pra recalcular corretamente mesmo num PATCH
  parcial que só muda `type` sem tocar `price` (ou vice-versa).
- **Máquinas já cadastradas foram migradas por retroengenharia**: a mesma
  migração faz `UPDATE` reconstruindo um `price` plausível a partir do
  `depreciation_cost_per_hour` já existente (fórmula invertida), depois
  calcula `maintenance_cost_per_hour` a partir desse `price` reconstruído —
  em dois `UPDATE`s separados, porque uma instrução só não pode ler na mesma
  linha um valor que ela mesma acabou de escrever noutra coluna.
- **`manutencao_maquina` vira uma segunda variável de fórmula**, ao lado de
  `depreciacao_maquina` (`formula-engine.ts` INTERNAL_VARIABLES,
  `formula.service.ts` registry, `CalculationService.ts`). `baseCost` agora
  soma os dois: `materialCost + energyCost + depreciationCost +
  maintenanceCost + laborCost` — é a "nova variável que soma os dois
  valores e substitui nos cálculos" pedida pelo Yuri. `PrintItem` ganhou a
  coluna `maintenanceCost` (snapshot, igual `depreciationCost` já
  funcionava) — itens de orçamento históricos ficam com `0` (conceito não
  existia quando foram calculados).
- **Autocomplete no frontend** (`dashboard/settings/page.tsx`,
  `MachineNameAutocomplete`): busca debounced (250ms, mínimo 2 caracteres)
  contra `/api/machine-catalog`; ao clicar numa sugestão, preenche
  nome (`"{marca} {modelo}"`, ex. "Bambu Lab X1 Carbon"), tipo, watts,
  volume XYZ e valor — **tudo continua editável depois**, sem nenhum
  impedimento pra ajustar antes de salvar (só o próprio `price` dirige o
  cálculo; se o usuário mudar o valor depois de importar, depreciação e
  manutenção recalculam sozinhas). Um label pequeno abaixo do campo Valor
  mostra a prévia calculada (mesma fórmula replicada no client, só pra
  exibição — o backend recalcula do zero ao salvar, é a autoridade real).

## Remocao de densidade e tipo "Po" de Material (2026-08-15)

Pedido do Yuri: o campo "densidade" no cadastro de material nunca chegou a
ser usado em nenhum calculo de custo (nao aparece em `CalculationService.ts`
nem nas variaveis de formula) e a opcao de tipo "Po" (`POWDER`) tambem nao
parecia util no momento — ambos removidos do sistema, incluindo do banco.

- **Migracao** (`20260814190000_remove_material_density_and_powder_type`):
  reatribui materiais existentes com `type = 'POWDER'` para `'OTHER'` antes
  de recriar o enum `MaterialType` sem esse valor (Postgres nao deixa
  remover um valor de enum ainda referenciado - o padrao e renomear o tipo
  antigo, criar o novo sem o valor, converter a coluna via
  `USING (col::text::NovoTipo)` e derrubar o tipo antigo). Coluna `density`
  dropada na mesma migracao. Nenhum material do banco de dev tinha
  `type = 'POWDER'` no momento (so uma salvaguarda pra producao, que pode
  ter dados diferentes).
- `MaterialType` (schema Prisma e `shared/src/index.ts`) passa a ser só
  `FILAMENT | RESIN | OTHER`. `materialSchema` (`resources.validator.ts`)
  e `MaterialResource`/`MaterialPayload` perderam o campo `density`.
  `material.service.ts` removeu toda leitura/escrita de `density` (nunca
  entrava em nenhum calculo, só era guardado e devolvido pro cliente).
- Frontend (`dashboard/settings/page.tsx`): removido o campo "Densidade"
  do modal de material (grid de 3 colunas virou 2) e a opcao "Po" do
  select de Tipo, que agora lista só Filamento/Resina/Outro.
- Validado: `prisma validate`, lint/build de shared+backend+frontend,
  58/58 testes de backend, e criacao de material de ponta a ponta pelo
  navegador (tipo Resina, sem campo de densidade, salvando certo).

## Remocao de variaveis de formula redundantes (2026-08-15)

Seguimento da checagem dos botoes de variavel: confirmado que `peso`/
`peso_gramas` e `tempo`/`tempo_horas` eram literalmente a mesma variavel
computada duas vezes (`CalculationService.ts` atribuia o mesmo valor pras
duas chaves; o proprio registro em `formula.service.ts` ja descrevia
`peso_gramas`/`tempo_horas` como "Alias de..."). `margem_lucro_percentual`
tambem foi identificada como redundante frente a `margem_lucro` (mesma
configuracao, so em escala diferente - percentual bruto vs. taxa decimal).
Nenhuma das ~85 formulas salvas no banco de dev usava qualquer um dos
tres nomes. O Yuri confirmou remover os tres.

- `INTERNAL_VARIABLES` (`formula-engine.ts`): removidos `peso_gramas`,
  `tempo_horas`, `margem_lucro_percentual`. Lista de variaveis de sistema
  cai de 24 para 21.
- `buildFormulaVariables` (`CalculationService.ts`): removidas as 3 chaves
  correspondentes do objeto retornado.
- `systemVariableMeta` (`formula.service.ts`): removidas as 3 entradas do
  registro (o tipo `Record<(typeof INTERNAL_VARIABLES)[number], ...>` ja
  forca consistencia entre os dois arquivos em tempo de compilacao).
- Nao mexido: `calculation.validator.ts` continua aceitando
  `peso_gramas`/`tempo_horas` como nomes alternativos de CAMPO no corpo da
  requisicao `POST /calculate` (ex.: `peso_gramas` no lugar de
  `weightGrams`) - e um mecanismo diferente e deliberado (aliasing
  camelCase/snake_case no payload da API, o mesmo padrao ja usado pra
  `machineId`/`machine_id`, `formulaId`/`formula_id` etc.), nao a lista de
  variaveis disponiveis dentro de uma expressao de formula.
- Nenhuma migracao de banco necessaria - variaveis de formula sao
  calculadas em runtime, nunca ficam persistidas como coluna.
- Validado: lint+build de shared/backend/frontend, 58/58 testes de
  backend (os testes ja iteravam sobre `INTERNAL_VARIABLES` dinamicamente,
  nao tinham nomes hardcoded), e conferencia ao vivo no navegador (painel
  "Variaveis disponiveis" caiu de 24 pra 21 itens, sem peso_gramas/
  tempo_horas/margem_lucro_percentual).

## Sistema de e-mails transacionais via Resend (2026-08-15)

Pedido do Yuri: implementar envio de e-mail (Resend, remetente
`system@pricify3d.com`, dominio hospedado no Zoho Mail) para 6 situacoes -
conta criada, reset de senha, assinatura confirmada, assinatura renovada,
assinatura perto de vencer, resumo de orcamento (ao exportar ou aprovar) -
com uma tela admin pra editar o conteudo dos templates. Plano completo
aprovado em plan mode antes de implementar (ver historico do chat).

### Modelo de dados (3 tabelas novas)

- **`EmailTemplate`**: `key` (unico, um dos 6 nomes fixos), `name`,
  `description`, `subject`, `bodyHtml`, `isActive`. Sao templates
  **globais do sistema**, nao por empresa. Deliberadamente **sem
  create/delete** - so listar e editar (`email-template.service.ts`,
  `admin.controller.ts`) - porque cada `key` esta amarrada a um ponto fixo
  do codigo que dispara aquele e-mail; criar uma key nova nao faria nada
  disparar, e apagar uma quebraria o gatilho correspondente. Seed inicial
  (migracao `20260815120000_email_system`) com layout HTML generico (card
  branco, header com a logo, rodape) repetido nos 6 - o Yuri ajusta o HTML
  de verdade depois pela tela `/admin/email-templates`.
- **`EmailLog`**: registro de cada envio (`status`: `SENT`/`FAILED`/
  `SKIPPED_INACTIVE`), com `dedupeKey` opcional unico - usado pra garantir
  que um evento que pode ser reentregue (webhook do Asaas, "at least
  once") ou que roda periodicamente (cron de vencimento) nunca manda o
  mesmo e-mail duas vezes pro mesmo evento.
- **`PasswordResetToken`**: mesmo padrao de seguranca do `RefreshToken` ja
  existente (`auth.service.ts`) - token bruto de 32 bytes aleatorios
  (base64url) gerado, **emailado uma unica vez**, e **so o hash SHA-256** e
  gravado no banco (`tokenHash String @unique`). Nunca da pra recuperar o
  token cru a partir do banco. `expiresAt` curto (30 min), `usedAt`
  marca uso (rejeitando reuso). Ver secao de seguranca abaixo.

### Variaveis de template: `{{chave}}` (chaves duplas)

Sintaxe deliberadamente diferente da usada nas formulas (`nome` sem
chaves, corrigido nesta mesma sessao) - contextos diferentes: aqui
`{{chave}}` e o formato real, persistido e usado pelo motor de template
(`email.service.ts`, regex `/\{\{(\w+)\}\}/g`), nao so uma tolerancia de
digitacao. Substituicao por string simples, sem lib nova (mesmo espirito
do `.replace()` ja usado em `formula-engine.ts`, so que pra HTML/assunto
em vez de expressao matematica).

**Escaping por padrao**: toda variavel e HTML-escapada antes de entrar no
corpo (`escapeHtml` em `email.service.ts`) - protege contra
nome_da_empresa/nome_do_cliente (dados do usuario) injetando HTML/tags no
e-mail. Excecao: chaves terminadas em `Html` (ex.: `itemsHtml`, a lista de
itens do orcamento pre-renderizada em HTML pelo proprio `sendQuoteSummary`)
passam raw - convencao de nomenclatura simples em vez de um segundo
parametro. No assunto as variaveis NAO sao HTML-escapadas (assunto e texto
puro, nunca renderizado como HTML - escapar ali mostraria "&amp;" literal
pro destinatario) - so remove quebras de linha, pra uma variavel nao
conseguir injetar cabecalhos extras.

### Envio best-effort, nunca bloqueia a acao principal

`EmailService.send()` (e todos os `sendX` de conveniencia) nunca lanca -
todo o corpo do metodo esta num try/catch que so loga. Todo ponto de
disparo chama com `void emailService.sendX(...)` (fire-and-forget, sem
`await`) - cadastro, webhook do Asaas (que precisa responder 2xx rapido,
por recomendacao deles), e aprovacao/exportacao de orcamento nunca podem
falhar ou ficar mais lentos por causa de uma indisponibilidade do Resend.
`resend-client.ts` segue o mesmo principio (nunca lanca, so retorna
`{id, error}`) e se `RESEND_API_KEY` nao estiver configurada (dev sem
chave), loga aviso e pula o envio - confirmado nos testes/smoke test desta
sessao, aparece como `EmailLog.status = "FAILED"` com `errorMessage:
"RESEND_API_KEY not configured"`, o que ja e suficiente pra confirmar que
o gatilho disparou no lugar certo sem precisar de uma chave real.

### Reset de senha - seguranca (pedido explicito do Yuri)

- `POST /auth/forgot-password`: sempre responde 200 independente do
  e-mail existir ou nao (evita enumeracao de contas) - so dispara e-mail
  se achar um usuario ativo. Invalida qualquer token anterior ainda valido
  do mesmo usuario antes de criar um novo (nunca mais de um link vivo).
  Rate limit apertado (3 / 15min por IP, `forgotPasswordRateLimiter`) -
  janela bem maior que os outros limiters de auth, porque aqui o abuso
  significa spam na caixa de entrada de outra pessoa.
- `POST /auth/reset-password`: busca so pelo hash do token recebido (nunca
  varre comparando token cru); rejeita se nao achar, se ja foi usado
  (`usedAt`), ou se expirou. Ao suceder: atualiza a senha, marca o token
  usado, e revoga todos os refresh tokens do usuario (`revokedAt = now()`
  em todas as linhas `revokedAt: null` daquele `userId` - mesma query que
  `logoutAll` ja fazia) - forca logout em todo dispositivo logado, pratica
  padrao depois de troca de senha (o pedido em si e sinal de possivel
  comprometimento da conta).
- Testado em `password-reset.routes.test.ts` (4 testes de integracao
  contra o app real): sempre 200 no forgot-password; token reusado rejeita
  na segunda vez; senha antiga para de funcionar e a nova funciona; sessao
  antiga (refresh token de antes do reset) fica invalida apos o reset.
  Validado tambem manualmente no navegador nesta sessao (fluxo completo
  `/forgot-password` -> `/reset-password?token=...` -> login com senha
  nova).

### Gatilho de assinatura confirmada/renovada - achado importante no webhook

Durante o planejamento, encontrado um problema real no
`webhook.controller.ts` existente: o bloco que muta `Company`/grava
`AuditLog` so roda `if (isFirstActivation || statusChanged)` - numa
renovacao de rotina (empresa ja `ACTIVE`, pagamento confirma, continua
`ACTIVE`) esse `if` nunca entra, entao nao dava pra pendurar o e-mail de
renovacao ali dentro sem reescrever logica ja testada. Solucao: uma
checagem independente antes do upsert do `Payment` - `isNewPaymentRecord =
(payment ainda nao existia no banco)` - e um bloco novo, separado do `if`
existente, que dispara `sendSubscriptionConfirmed` (se `isFirstActivation`)
ou `sendSubscriptionRenewed` (senao) sempre que `isNewPaymentRecord &&
CONFIRMED_EVENTS.has(event)`. `isNewPaymentRecord` garante que reentregas
do mesmo evento (Asaas "at least once") nunca duplicam o e-mail. Validado
nesta sessao simulando os dois webhooks de verdade contra o endpoint real
(`POST /api/webhooks/asaas` com o token correto): primeiro pagamento (com
`externalReference` = checkout pendente) disparou `SUBSCRIPTION_CONFIRMED`
e promoveu o plano pra Pro; segundo pagamento (mesma `subscription`, sem
checkout) disparou `SUBSCRIPTION_RENEWED`, nao `SUBSCRIPTION_CONFIRMED` de
novo.

### Alerta de vencimento - checagem dos eventos do webhook do Asaas (2026-08-15)

Sem infraestrutura de fila/cron dedicada no projeto (mesmo motivo que ja
adiava a limpeza periodica de `RefreshToken`, ver `Notas/TODO.md`) -
resolvido com `node-cron` dentro do proprio processo Node (sem
worker/infra nova, roda todo dia as 9h America/Sao_Paulo,
`backend/src/jobs/subscription-expiring.job.ts`, chamado a partir de
`server.ts`). Consulta `Payment` com `dueDate` entre agora e agora+3 dias
(prazo confirmado com o Yuri), status ainda nao liquidado, empresa
`ACTIVE`, com `dedupeKey` por `Payment.id` pra nunca reenviar o mesmo
aviso rodando todo dia dentro da janela de 3 dias.

Pedido do Yuri numa sessao seguinte: checar de verdade se os eventos do
webhook do Asaas mandam o que o alerta precisa, e corrigir se nao. Checado
direto na API do Asaas (sandbox, `GET /v3/webhooks`, mesma chave ja
configurada em `ASAAS_API_KEY`):

- **Nenhum webhook esta cadastrado** - `totalCount: 0`. Isso confirma o que
  ja estava anotado no `Notas/TODO.md` ("Cadastrar o webhook de verdade no
  painel/API do Asaas... só faz sentido depois de DEVOPS-001"), mas
  esclarece o alcance real: **nao e so o alerta de vencimento que fica sem
  dado** - as assinaturas confirmada/renovada tambem nunca disparariam
  sozinhas hoje, porque o Asaas nao tem pra onde mandar nada (o teste
  ponta a ponta anterior desta mesma sessao simulou os webhooks chamando
  nosso proprio endpoint diretamente, nao veio do Asaas de verdade).
- Testado tambem (criando um customer + subscription reais no sandbox via
  API): o Asaas **gera o Payment da proxima cobranca com antecedencia**
  (status `PENDING`, `dueDate` dias no futuro) assim que a cobranca
  anterior e liquidada / a assinatura e criada - confirmado ao vivo,
  `GET /v3/payments?subscription={id}&status=PENDING` devolveu o pagamento
  futuro na hora. Ou seja, o dado que o alerta precisa **existe do lado do
  Asaas bem antes do vencimento** - so nao estava chegando aqui porque
  nada esta cadastrado pra empurrar.

**Correcao aplicada**: em vez de depender so do que um webhook (ainda nao
cadastrado, e que exigiria lembrar de marcar `PAYMENT_CREATED` entre os
eventos escolhidos - facil de esquecer) empurraria, o job agora **busca
direto na API do Asaas** antes de rodar a consulta local:
`asaasClient.listPendingPayments()` (novo metodo em `asaas-client.ts`,
`GET /payments?subscription={id}&status=PENDING`) pra cada empresa `ACTIVE`
com `asaasSubscriptionId`, e faz upsert do resultado em `payments` -
mesmo formato que o `webhook.controller.ts` já grava - antes da consulta
local original (que continua igual). Se uma chamada falhar pra uma
empresa (rate limit, erro transitorio), loga e continua o lote, não trava
o job inteiro. Sem `ASAAS_API_KEY` configurada (dev sem chave), pula essa
sincronizacao silenciosamente.

Validado de ponta a ponta com dado real do sandbox: criada uma
subscription de verdade (vencimento em 2 dias), empresa de teste
apontada pra ela, rodado `runSubscriptionExpiringCheck()` diretamente
(agora exportado) - encontrou o candidato puxando do Asaas (nada estava
no banco local antes) e dispara o e-mail certo ("Sua assinatura vence em
2 dias"). Dado de teste (subscription no sandbox, empresa local) limpo
depois.

Isso torna o alerta funcional **hoje**, independente de quando/se o
webhook de producao for cadastrado, e independente de quais eventos forem
escolhidos ao cadastra-lo - deixa de ser um ponto de falha silencioso.

### Resumo de orcamento - destinatario e gatilhos

Vai pro e-mail do dono da conta (`Company.user.email`), nao pro cliente
final - decisao confirmada com o Yuri, ja que `Quote` so guarda
`customerName` (texto), nunca um e-mail de contato do cliente. Dois
gatilhos, mesmo template, variavel `triggerLabel` muda o texto
("aprovado"/"exportado"): `QuoteService.update()` quando `status` vira
`APPROVED` (comparando antes/depois da transacao, `quote.service.ts`) e
`QuoteController.exportPdf()` apos gerar o PDF com sucesso
(`quote.controller.ts`) - sem dedupe nesse caso, ja que reexportar o mesmo
orcamento varias vezes e um uso legitimo (nao e um evento unico como
pagamento). Testado nesta sessao criando maquina+material+orcamento de
verdade via API, aprovando e exportando - `EmailLog` confirma os dois
disparos com o `customerName` e destinatario corretos.

### Testes novos

`password-reset.routes.test.ts` (4, integracao completa contra o app
real) e `email.service.test.ts` (3, unitario - escaping de HTML,
nao-escaping de assunto, `send()` nunca lanca mesmo com o Resend
falhando). Suite total: 58 -> 65 testes, todos passando.

## 2026-08-16 - Perfil do usuario + preferencias de e-mail por categoria

Duas mudancas relacionadas: menu Admin virou um grupo colapsavel, e o
usuario ganhou uma tela de perfil onde edita seu proprio nome e escolhe
quais categorias de e-mail automatico quer receber.

### Preferencias sao por usuario, nao por empresa

`notifyFinancialEmails`/`notifyQuoteEmails`/`notifyNewsletter` ficam em
`User`, nao em `Company` - segue o mesmo raciocinio de `fuso_horario` no
projeto `atendimentos_app` (preferencia de exibicao/notificacao e
individual de quem usa o sistema, nao da empresa). Como hoje so existe um
`User` por `Company` (1:1), na pratica o efeito e o mesmo, mas o campo no
lugar certo evita ter que migrar de novo se um dia a empresa tiver
multiplos usuarios.

### Gating vive nos metodos de conveniencia, nao no `send()` generico

`EmailService.send()` so recebe `to: string` cru, sem nocao de qual
`User`/`Company` esta por tras - nao da pra checar preferencia ali sem
inventar contexto que ele nao tem. A checagem foi colocada em cada um dos
4 metodos de conveniencia que ja tinham esse contexto
(`sendSubscriptionConfirmed/Renewed/Expiring` = financeiro,
`sendQuoteSummary` = orcamentos), logo apos o `select` que ja buscava o
`user.email` - so precisou adicionar o booleano relevante no mesmo
`select`. `sendAccountCreated` e `sendPasswordReset` foram deliberadamente
deixados de fora dessa checagem (e de qualquer checagem futura de
preferencia) - e um requisito duro do Yuri, nao uma omissao.

Quando uma preferencia bloqueia o envio, grava um `EmailLog` com status
novo `SKIPPED_PREFERENCE` em vez de simplesmente nao fazer nada -
mesmo espirito do `SKIPPED_INACTIVE` que ja existia pra template
desativado, mantem a tela de Logs como fonte unica de "o que aconteceu
com cada tentativa de envio", incluindo os que nunca chegaram a tentar.

### `User.name` fecha uma lacuna preexistente

`fullName` sempre foi validado no cadastro (`registerSchema`) mas nunca
gravado em lugar nenhum - um campo morto. Adicionar `User.name` e gravar
`input.fullName` nele em `register()` resolveu isso como efeito colateral
natural de dar ao usuario algo para editar no perfil (o pedido era
"editar informacoes, exceto o e-mail" - nome e a informacao pessoal obvia
pra isso, sem inventar campo novo sem uso).

### E-mail imutavel garantido no validador, nao so na UI

`updateProfileSchema` usa `.strict()` e nao inclui `email` no shape -
entao mandar `email` no payload de `PATCH /auth/me` derruba a
requisicao inteira com 400 `VALIDATION_ERROR`, em vez de silenciosamente
ignorar o campo. Reforça a regra no lugar que importa (o contrato da API),
nao so escondendo o campo no formulario do frontend.

### Atualizacao do usuario local sem rotacionar sessao

`AuthContext` ganhou `updateUser(nextUser)`, que so expoe o `persistUser`
que ja existia internamente (grava em `localStorage` + `setUser`). A tela
de Perfil usa isso depois de um `PATCH /auth/me` bem-sucedido, em vez de
chamar `refreshUser()` (que existia antes) - `refreshUser()` troca o
refresh token cookie a cada chamada (rotacao de sessao), efeito colateral
desnecessario so pra atualizar o nome/preferencias em tela.

### Dropdown Admin no menu lateral

Os 4 links `/admin/*` (BI, Users, Planos, E-mails) saíram do array flat
`navigation` pra um `adminNavigation` separado, renderizado dentro de um
grupo colapsavel com estado proprio (`useState`). Nao usa nenhuma lib de
menu nova - e um `<div>` com um botao toggle (`ChevronDown` que gira) e
uma lista condicional por baixo, seguindo exatamente os mesmos padroes de
classe Tailwind (collapsed/mobile/ativo) que os outros itens do menu ja
usavam.

### Testes novos

5 em `auth.routes.test.ts` (`PATCH /auth/me`) e 3 em
`email.service.test.ts` (gating de preferencia, incluindo confirmar que
`sendAccountCreated` ignora as 3 preferencias). Suite total: 70 -> 78
testes, todos passando.

## 2026-08-16 - Convencao de taxas seguras a zero + remocao de "Hora tecnica"

### Toda taxa percentual da formula segue a mesma convencao: somar antes de multiplicar

`taxa_cartao`, `taxa_administrativa` e `taxa_erro` agora sao, as tres,
percentuais (0-100% na UI, convertidos pra taxa 0.0-1.0 antes de entrar na
formula) que a formula padrao do sistema **soma entre si dentro de um unico
fator multiplicativo** -
`(taxa_cartao + taxa_administrativa + taxa_erro)` - em vez de cada uma
multiplicar o subtotal separadamente. Essa e a razao estrutural pela qual
"nao preenchida" (0) nunca zera o preco: dentro de uma soma, 0 e o elemento
neutro; so seria perigoso se uma taxa multiplicasse o resultado sozinha
(onde o neutro seria 1, nao 0) - o que a formula padrao nunca faz.

`taxa_erro` foi a excecao antes desta mudanca: o registro de variaveis da
tela de formulas a documentava como um multiplicador direto (tipo `FLOAT`,
exemplo `1.2`), mas o valor real vinha de um campo com default `0` - ou
seja, qualquer formula customizada que seguisse a propria sugestao do
sistema (`custo_base * taxa_erro`) zerava o orcamento sempre que o campo
nao fosse preenchido. Convertida pra `PERCENTAGE` e somada na formula
padrao do mesmo jeito que as outras duas, ela deixa de ter esse defeito -
e ganha a mesma garantia "nao preenchida = sem efeito" que taxa_cartao/
administrativa ja tinham.

**Limite aceito**: isso protege a formula padrao e qualquer formula
customizada que siga a mesma convencao ensinada pelo sistema. Como o motor
de formulas e algebra generica (`expr-eval`, sem analise de arvore
sintatica), uma empresa ainda poderia escrever `preco = custo_base *
taxa_cartao` como a formula INTEIRA (nao um termo somado) e zerar o proprio
calculo com uma taxa em 0 - nao ha como prevenir isso sem reescrever a
expressao estruturalmente, fora de escopo. O que a mudanca garante e que o
caminho padrao/ensinado pelo produto e sempre seguro.

### "Hora tecnica" removida do sistema (nao so escondida)

Campo sem uso conhecido (Yuri: "nao lembro pelo que foi criado"). Removida
de ponta a ponta em vez de so escondida da UI: coluna `technical_hour_rate`
dropada de `pricing_settings`, `applied_technical_hour_rate` e `labor_cost`
dropadas de `print_items` (snapshot historico de orcamentos ja calculados -
aceitavel apagar porque o projeto ainda nao foi pra producao, sem clientes
reais, so dados de dev/teste). `baseCost` deixa de somar mao de obra -
passa a ser so material + energia + depreciacao + manutencao. Variaveis de
formula `mao_obra`/`valor_hora_tecnica` removidas do whitelist
(`INTERNAL_VARIABLES`) - uma formula customizada que ja usasse essas
variaveis passa a falhar validacao (`FORMULA_UNKNOWN_VARIABLE`) na proxima
edicao; nenhuma formula existente no banco de dev as usava.

## 2026-08-16 - Trocar senha revoga todas as sessoes, nao so as outras

`PATCH /auth/password` segue exatamente o mesmo padrao de seguranca que
`resetPassword` (via e-mail) ja usava: apos trocar a senha, **todo**
refresh token do usuario e revogado, incluindo o da propria sessao que fez
a troca - nao so "os outros dispositivos". Alternativa considerada e
descartada: preservar a sessao atual (poupar o refresh token de quem
mandou a requisicao). Nao foi implementada porque o endpoint autentica via
access token (header `Authorization`), e o refresh token correspondente
fica so no cookie httpOnly - o backend nao tem como saber, a partir do
access token, qual refresh token especifico poupar sem adicionar
complexidade nova (ex.: uma claim extra ligando os dois). Na pratica o
efeito e suave: o access token da aba atual continua valido ate expirar
(~15min, `JWT_EXPIRES_IN`), so o proximo silent refresh e que vai falhar e
pedir login de novo - nao e um logout imediato/brusco.

## 2026-08-17 - Fórmulas do sistema: recurso global admin-only, não mais copia por empresa

### Por que uma tabela nova em vez de "so proteger a edicao" na tabela existente

A alternativa mais simples seria manter `ensureDefaultFormula` criando a
copia por empresa, so adicionando uma trava (`isSystem` bloqueia `update`/
`delete`). Rejeitada porque nao resolve o problema de fundo: teria N copias
independentes (uma por empresa) do "mesmo" texto, cada uma podendo
divergir silenciosamente se algum dia o texto padrao mudar (empresas
antigas ficariam com a copia velha pra sempre, sem forma de sincronizar).
Uma tabela global (`system_formulas`) com N=poucas linhas, editada uma vez
pelo admin e refletida na hora pra todo mundo, e o modelo certo pra algo
que e, por definicao, "do sistema" - a mesma logica ja usada pra
`EmailTemplate` (tambem global, tambem admin-only).

### `Quote.formulaId` continua so apontando pra formula da propria empresa

Cogitado adicionar uma segunda FK (`Quote.systemFormulaId`) pra permitir
que um orcamento referencie uma formula do sistema diretamente. Descartado
por escopo: `formulaId` nao e exposto na UI de criacao de orcamento hoje
(so via API, nao usado por nenhuma tela) - adicionar uma FK nova pra um
caminho que ninguem usa e complexidade sem uso real. Em vez disso, quando
o calculo resolve pra uma formula do sistema, ela e representada com
`id: null` (mesma convencao que o fallback hardcoded `SYSTEM_DEFAULT_
FORMULA` ja usava) - o orcamento salvo simplesmente nao guarda qual
formula do sistema foi usada (so o resultado calculado, que e o que
importa pro snapshot financeiro). Se um dia a UI passar a deixar escolher
formula por orcamento, revisitar essa decisao.

### Protecao contra edicao e em duas camadas, nao so no frontend

O frontend esconde os controles de editar/salvar/excluir quando a formula
selecionada e do sistema, mas a garantia de verdade e no backend:
`FormulaService.update()/delete()` sempre passam por `findOwnedFormula`,
que so busca na tabela `formulas` **filtrada por `companyId`** - um id de
`system_formulas` nunca existe la, entao a tentativa cai automaticamente
no mesmo 403 `FORMULA_FORBIDDEN` que qualquer id invalido/de outra empresa
já causava. Nenhum código novo de "if isSystem, bloqueia" foi necessário
no service - a segregação por tabela já resolve isso estruturalmente.
