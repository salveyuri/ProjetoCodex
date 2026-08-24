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

## 2026-08-17 - Redesenho do motor de precificação: fórmula calculada uma vez por orçamento, não por mesa

### O bug relatado e a causa raiz

O Yuri reportou (com prints) que aumentar as horas de pintura/acabamento
inflava o subtotal de **cada mesa** pelo mesmo delta - com 2 mesas, ambas
subiam R$78,09 ao mudar pintura de 5h para 8h. Causa raiz confirmada em
`quote.service.ts`: o método privado `calculateItems` montava UM
`quoteCalculationContext` com `paintingHours`/`finishingHours` do
orçamento inteiro e espalhava esse mesmo contexto, sem alteração, em
`calculationService.calculateWithResolvedContext` chamado **uma vez por
item**, independente. Como a fórmula usa `horas_pintura`/`horas_acabamento`
como se fossem do orçamento todo, cada mesa recontava o custo de
pintura/acabamento do zero.

### Modelo novo: dois estágios, fórmula roda uma vez

Substituído por um pipeline de dois estágios em `CalculationService.ts`
(`calculateAggregate`, chamado tanto por `calculateQuoteBreakdown` -
caso N=1, usado pela Calculadora avulsa - quanto por `calculateQuote` -
caso N mesas, usado pelo preview e pela criação/edição de orçamento):

1. **Por mesa (aritmética pura, sem fórmula)**: `materialCost = custo_por_g
   * peso`, `energyCost = consumo_kw * horas_impressao * custo_kwh`,
   `depreciationCost`/`maintenanceCost` iguais a antes. A soma dos quatro é
   o **custo bruto da mesa** (`rawCost`) - é isso que aparece como
   "Custo da mesa" na tela, nunca incluindo taxa de erro, taxas, margem
   ou pós-processamento.
2. **Uma vez pro orçamento inteiro**: soma os quatro custos de todas as
   mesas; `printCost = materialCost + energyCost` (só esses dois, por
   pedido explícito do Yuri); `errorCostAmount = printCost * taxa_erro`
   (a taxa de erro **não** incide sobre depreciação/manutenção);
   `custo_base = printCost + errorCostAmount + depreciationCost +
   maintenanceCost`; pintura/acabamento somados **uma única vez**
   (`valor_hora_pintura*horas_pintura + valor_hora_acabamento*
   horas_acabamento`). A fórmula (padrão do sistema ou customizada da
   empresa - decisão explícita do Yuri: vale pra **todas**, não só a
   padrão) é avaliada **uma vez** contra essas variáveis agregadas.

Três perguntas de escopo foram tiradas a limpo com o Yuri antes de
implementar (todas resolvidas com a opção recomendada): depreciação/
manutenção continuam por mesa (só pintura/acabamento saíram do nível "por
mesa"); o "subtotal" exibido por mesa é o custo bruto, sem nada de taxas/
margem/pós-processamento (o preço com tudo aplicado só existe no total do
orçamento); e a mudança vale pra toda fórmula, não só a padrão do sistema.

### `taxas_percentuais` volta a significar só cartão+administrativa

Numa correção anterior nesta mesma sessão (bug do "%% zerava o preço"),
`taxas_percentuais` tinha passado a incluir `taxa_erro` pra evitar que uma
taxa de erro zerada zerasse a fórmula. Isso deixou de ser necessário: como
`taxa_erro` agora é aplicada **antes** da fórmula rodar (embutida em
`custo_base`, como um valor aditivo, nunca multiplicativo), uma taxa de
erro em 0% simplesmente não soma nada - não há mais risco de zerar o
preço por causa dela. `taxas_percentuais` voltou a ser só
`taxa_cartao + taxa_administrativa`, que é como a própria fórmula do Yuri
usa esse nome. `taxa_erro` continua disponível como variável avulsa pra
quem quiser referenciá-la numa fórmula customizada.

### Nova fórmula padrão do sistema (adotada literalmente do pedido do Yuri)

`(custo_base + (valor_hora_acabamento * horas_acabamento) +
(valor_hora_pintura * horas_pintura)) * (1 + taxas_percentuais +
margem_lucro)` - substituiu a fórmula anterior (que compunha dois fatores
multiplicativos, `custo_base*(1+margem)*(1+taxas)`) por uma única soma
antes de multiplicar, formato que o próprio Yuri já usava. Isso muda os
valores numéricos de qualquer orçamento existente que dependa da fórmula
padrão (ex.: no fixture de teste, R$22,59 virou R$22,25) - mudança
estrutural deliberada, não regressão. Migration
`20260817120000_update_default_formula_pricing_model` faz o `UPDATE` na
linha `system_formulas` com `code = 'system_default'`.

### Taxa de cartão/administrativa e margem viram estimativas de exibição uniformes

Como a fórmula é texto livre, não há como saber quanto dela é "taxa" vs
"margem" no resultado - antes disso só era calculado quando a fórmula era
o fallback do sistema (fórmula customizada zerava `cardFeeAmount`/
`administrativeFeeAmount` de propósito). Isso mudou: agora
`cardFeeAmount`/`administrativeFeeAmount` são sempre `subtotal * taxa`
(estimativa best-effort) e `marginAmount` é o resto (`finalPrice -
subtotal - taxas`, nunca negativo), **uniformemente**, seja a fórmula
padrão ou customizada. Efeito colateral esperado: um teste antigo que
esperava `cardFeeAmount = 0` pra fórmula customizada foi atualizado pra
esperar o valor calculado.

### `QuoteItemSnapshot.marginAmount`/`feesTotal` ficam sempre zero

Sem migração de schema: as colunas continuam existindo (reuso, não
remoção), mas como taxas/margem só existem no nível do orçamento agora,
não faz sentido mais atribuir uma fatia arbitrária pra cada mesa - os
campos ficam `0` daqui pra frente. `Quote.totalAmount` passa a ser o único
lugar onde mora o preço final de verdade (o resultado da avaliação única
da fórmula), não mais uma soma de `finalPrice` por item.

### Novo endpoint `POST /quotes/preview`

O formulário "Novo orçamento" antes calculava um preview por mesa
(N chamadas paralelas a `POST /calculate`) e somava os resultados no
cliente - o mesmo desenho que causava o bug (cada chamada recontava
pintura/acabamento). Endpoint novo recebe o orçamento inteiro (todas as
mesas + horas de pós-processamento) numa chamada só e devolve o mesmo
`calculateQuote` que `create`/`update` usam internamente - preview e
salvamento **nunca podem divergir**, porque é literalmente o mesmo código.

### `analytics.service.ts`: receita/lucro por orçamento, não por item

Consequência direta: `item.finalPrice` deixou de carregar margem/taxas/
pós-processamento (agora = `item.baseCost`, custo bruto). O código que
somava `item.finalPrice` por item pra montar receita/lucro (mensal e
export CSV) foi reescrito pra calcular **uma vez por orçamento**
(`revenue = quote.totalAmount`, `profit = max(totalAmount - somaDosCustos
Brutos, 0)`) e só então **alocar de volta** pra cada item, proporcional à
fatia de custo bruto daquele item no orçamento (`allocateShare`) - usado
tanto no `materialMix` (receita por tipo de material) quanto nas colunas
`finalPrice`/`profit` do export CSV. Sem essa mudança, `profit` teria
virado sempre `0` (já que `finalPrice == baseCost` por item) e `revenue`
subestimaria qualquer orçamento com margem/taxas/pós-processamento.

## 2026-08-17 - Tradução do sistema para inglês (pt-BR/en) + preço em dólar

### Escopo confirmado com o Yuri antes de começar

Pergunta feita porque o app tem 18 telas e nenhuma lib de i18n instalada -
traduzir tudo de uma vez é bem mais trabalho que só as telas principais.
Resposta do Yuri: traduzir **todas as telas de usuário** (incluindo PDF e
os 6 e-mails, com versão EN criada a partir do original PT) - só o painel
**Admin** (5 telas) fica de fora, porque é uso interno só do Yuri.

### Preferência de idioma é do `User`, não da `Company`

`User.language` (`"pt-BR" | "en"`, default `"pt-BR"`) - não `Company`,
porque autenticação/perfil já são por usuário no resto do sistema (nome,
preferências de e-mail), e cada usuário de uma mesma empresa pode
querer ver o sistema no próprio idioma. Coluna `TEXT` livre (não enum do
Prisma) de propósito - trocar de idioma no futuro (ex. espanhol) vira só
uma nova entrada de dicionário + seed de e-mail, nunca uma migração
alterando o tipo da coluna.

### i18n do frontend: dicionário + Context, não next-intl

Este app é inteiramente client-rendered (todo componente já é `"use
client"`, busca dados via `useEffect`/axios, sem Server Components
buscando dado) - a maquinaria de `next-intl` (negociação de locale via
URL/middleware, roteamento internacionalizado) não bate com essa
arquitetura e adicionaria complexidade sem necessidade real. Implementado
em vez disso um par `frontend/src/lib/i18n/{pt,en}.ts` (chaves flat tipo
`"quotes.list.title"`) + `LanguageContext` (mesmo padrão de
`AuthContext.tsx` já existente) expondo `t()`, `formatMoney()`,
`formatDate()`, `setLanguage()`. `en.ts` é tipado contra as chaves de
`pt.ts` (`Record<TranslationKey, string>`) - uma chave faltando ou sobrando
vira erro de compilação, os dois arquivos nunca podem divergir.

### Fonte da verdade do idioma: usuário logado > cache local > navegador

Ordem de resolução no `LanguageProvider`: (1) se o usuário está
autenticado, `user.language` sempre vence (sincronizado via `useEffect`
assistindo `user?.language`); (2) senão, o que ficou salvo em
`localStorage` de uma escolha anterior (ex. usuário trocou no formulário de
cadastro mas ainda não confirmou a conta); (3) senão, `navigator.language`
do navegador (`en*` → inglês, qualquer outra coisa → português - decisão
deliberada de "quando em dúvida, português", já que a base atual de
usuários é 100% brasileira). O cadastro já pré-seleciona esse palpite e
deixa trocar ali mesmo, com o formulário inteiro mudando de idioma em
tempo real conforme a l Yuri pediu.

### `$` em vez de `R$` é só troca de símbolo/formatação - nunca conversão de valor

O Yuri pediu isso explicitamente ("a cifra de dólar no lugar de BRL") -
os valores numéricos gravados no banco continuam exatamente os mesmos,
só o `Intl.NumberFormat` usado pra exibir muda de `pt-BR/BRL` pra
`en-US/USD` conforme `language`. Nenhuma taxa de câmbio envolvida. Os 6
lugares que faziam essa formatação com `pt-BR`/`BRL` hardcoded
(`quote-ui.ts`, `calculator/page.tsx`, `settings/page.tsx`,
`settings/formulas/page.tsx`, `dashboard/analytics/page.tsx`,
`billing/page.tsx`) foram centralizados: `quote-ui.ts` perdeu
`toMoney`/`formatDate` (agora só `useLanguage().formatMoney()`/
`formatDate()`), e `quoteStatusLabels` virou `quoteStatusLabelKeys`
(mapeia pra uma chave de tradução, não pro texto fixo).

### Exceção deliberada: cobrança de assinatura (`billing/page.tsx`) fica sempre em BRL

A única tela onde dinheiro **não** segue `language` é Plano/faturamento -
o Asaas (gateway de pagamento usado pra cobrar a assinatura do próprio
Pricify3D) só processa BRL, então mostrar `$` ali seria mentira: o valor
realmente cobrado no cartão continua sendo em reais não importa o que a
tela mostrasse. `formatMoney` local nesse arquivo foi deixado
propositalmente fora do `useLanguage()`, com comentário explicando o
porquê. Mesma lógica pro painel Admin (`admin/analytics/page.tsx` etc) -
fora do escopo da tradução, então ganhou seu próprio `toMoney` local em
vez de importar de `quote-ui.ts`.

### E-mails: linha vira `(key, language)` em vez de só `key`

`EmailTemplate` antes tinha `key` único (6 linhas); agora `@@unique([key,
language])` (12 linhas - 6 chaves × pt-BR/en), com os 6 templates em
inglês escritos nesta sessão a partir do texto original em português
(mesmo layout/HTML, só o texto traduzido). `EmailService.send()` passa a
receber `language` e busca a linha certa via `findUnique({where:
{key_language: {key, language}}})`; cada método de conveniência
(`sendAccountCreated` etc.) resolve o idioma a partir de
`user.language`/`company.user.language` antes de chamar `send()`.
`taxa_erro`... digo, `triggerLabel` ("aprovado"/"exportado") também virou
bilíngue via um mapa pequeno. Painel admin de e-mails (fora do escopo de
tradução) ganhou só uma badge "PT"/"EN" ao lado de cada linha pra
continuar utilizável com o dobro de linhas - texto da tela em si continua
em português.

### PDF do orçamento: dicionário de strings embutido no próprio service

`quote-pdf.service.ts` não tem acesso a React/Context (roda no backend,
gera o PDF com `pdfkit`) - criado um objeto `pdfStrings` local
(`Record<SupportedLanguage, {...}>`) com todo o texto fixo do PDF (headers
de coluna, rótulos, termos), escolhido uma vez no início de `generate()`
a partir de `quote.company.user.language` e passado como parâmetro pelas
funções de desenho (`drawHeader`, `drawItemsTable` etc.) - mesmo
formatador de moeda/data trocando `pt-BR/BRL` por `en-US/USD` conforme
esse idioma.

### `getApiErrorMessage` (não-React) sincronizado via variável de módulo

Mensagens de erro da API (`lib/api-error.ts`) são chamadas de ~30 lugares
espalhados pelo app, muitos sem acesso limpo a hooks React no ponto exato
da chamada. Em vez de mudar a assinatura da função em todos esses lugares
pra receber `language`, o `LanguageContext` mantém uma variável de módulo
sincronizada (`setErrorMessageLanguage`, mesma ideia do
`setApiAuthorization` que o `AuthContext.tsx` já usa pra manter o header
`Authorization` do axios fora do ciclo de render do React) - `
getApiErrorMessage` lê essa variável pra decidir qual dicionário de
mensagens (`KNOWN_ERROR_MESSAGES["pt-BR" | "en"]`) usar.

### Fora do escopo desta rodada (documentado, não esquecido)

- **Painel Admin** (5 telas) continua só em português, por decisão
  explícita do Yuri.
- **Descrições das variáveis de fórmula** (`formula.service.ts`'s
  `systemVariableMeta`, mostradas na tela de Fórmulas ao passar o mouse)
  continuam em português - são dado vindo do backend (catálogo de
  variáveis), não "chrome" de interface; traduzir exigiria um esforço de
  i18n backend separado (a rota `/formulas/variables` teria que devolver
  descrição no idioma certo). Mesma lógica pro **nome das fórmulas** em si
  (ex. "Formula Padrao do Sistema" aparece assim mesmo com o resto da tela
  em inglês) - é conteúdo gravado no banco, não uma string estática da UI.
- `<html lang="pt-BR">` em `app/layout.tsx` ficou fixo - `RootLayout` é
  Server Component, mudar isso dinamicamente exigiria cookie/middleware
  de locale, considerado fora de escopo pra uma decisão só de atributo de
  acessibilidade/SEO.
- `lib/download-quote-pdf.ts` tem algumas mensagens de erro internas em
  português (ex. "Reinicie a API na porta 3001") que na prática nunca
  aparecem pro usuário final (todo call site usa `getApiErrorMessage`
  com um `fallback` próprio, que ignora `error.message` de um `Error`
  que não é do axios) - claramente texto de debug/desenvolvimento, não
  copy de produção, deixado como está.

## 2026-08-17 - País no cadastro + preço de referência em dólar nos planos

### Pesquisa prévia: o Asaas não tem parâmetro de moeda

O Yuri pediu pra checar se o Asaas permite enviar valor em real ou dólar.
Confirmado via [central de ajuda do Asaas](https://central.ajuda.asaas.com/hc/pt-br/articles/31972902909851)
e via o próprio código já existente (`AsaasCreateCheckoutPayload` em
`asaas-client.ts` só tem `value: number`, sem campo de moeda nenhum): a API
do Asaas **não aceita moeda como parâmetro** - todo valor enviado é sempre
interpretado como reais. Pra cliente estrangeiro/cartão emitido fora do
Brasil, o Asaas exige autorização manual prévia de um gerente de conta
(processo comercial, fora do código) e, mesmo autorizado, o valor continua
sendo enviado em reais - a conversão pra dólar (ou outra moeda) acontece do
lado da bandeira do cartão (Visa/Master), na cotação do dia deles, fora do
nosso controle.

**Consequência**: não existe "cobrar em dólar de verdade" com o Asaas hoje.
Perguntado ao Yuri via `AskUserQuestion` como proceder dado essa limitação -
escolhida a opção recomendada: dólar como **preço de referência/exibição**
apenas, a cobrança real continua sempre em reais.

### `Company.country` (ISO 3166-1 alpha-2) define `defaultCurrency` automaticamente

Novo campo no cadastro (e editável em "Meu perfil", junto de nome/nome da
empresa) com uma lista completa de países
(`shared/src/countries.ts` - 249 entradas, nome em PT e EN, dado factual do
ISO 3166-1, sem lib nova). `defaultCurrency` (`BRL`/`USD`) deixou de ser um
campo que o formulário de cadastro escolhia direto (era sempre hardcoded
`"BRL"` até agora) e passou a ser **derivado** do país
(`currencyForCountry`: `BR` -> `BRL`, qualquer outro -> `USD`) tanto no
registro quanto toda vez que o país é editado depois - nunca os dois saem
de sincronia. Default do seletor de país no cadastro usa a mesma ideia já
usada pro idioma (`detectBrowserLanguage`): olha `navigator.language`
(`"en-US"` -> `"US"`), com `"BR"` como fallback.

### `Plan.priceUsd`: preço USD por plano, opcional, editado pelo admin

Coluna nova `Decimal? price_usd` em `plans` (migration
`20260817150000_add_country_and_plan_usd_price`, junto com
`companies.country`). Nula até o admin preencher em `/admin/plans` - por
enquanto só o plano Pro tem um valor de teste (US$ 9,90) preenchido durante
a verificação desta sessão; Free e Enterprise ficam sem, então continuam
caindo no fallback BRL até o Yuri decidir os valores reais.

### Tela de Plano/faturamento: dólar só quando `país != BR` E o plano tem `priceUsd`

`dashboard/billing/page.tsx`: `showUsd = companyCountry !== "BR"`;
`planPriceDisplay(plan)` usa `priceUsd` (formatado `en-US`/`USD`) só quando
`showUsd` E `plan.priceUsd !== null` - senão cai pro preço em BRL de
sempre, plano por plano (não é tudo ou nada por conta - cada plano pode ou
não ter USD configurado). Quando `showUsd`, aparece um aviso fixo acima da
lista de planos avisando que o valor em dólar é referência e a cobrança
real é processada em reais, convertida pela operadora do cartão do
cliente - importante porque, diferente da troca de moeda dos orçamentos
(que é só exibição, sem dinheiro real envolvido), aqui existe uma cobrança
de verdade acontecendo por trás.

### Validado ao vivo (fluxo completo)

Cadastro de conta nova com país "Estados Unidos" -> dica de moeda troca pra
"cobrança exibida em dólar" em tempo real -> conta criada com
`country=US`/`defaultCurrency=USD`. Admin define `priceUsd=9.90` no plano
Pro -> tela de Plano da conta US passa a mostrar "US$ 9,90/mes" no Pro
(Free e Enterprise continuam em BRL, sem `priceUsd` configurado), com o
aviso de referência visível. Trocando o país de volta pra Brasil em "Meu
perfil", a mesma tela volta a mostrar todos os planos em BRL e o aviso
some - confirma que a lógica reage a mudança de país em tempo real, não só
no cadastro. Suite completa do backend: 95/95 passando. Lint/build limpos
em shared/backend/frontend.

## 2026-08-18 - Cadastro do webhook do Asaas via script, não via app

### Por que um script, não uma rota/tela

Cadastrar um webhook no Asaas é uma ação administrativa de infraestrutura,
feita uma vez (ou raramente, se a URL/eventos mudarem) - não faz sentido
virar uma tela ou rodar automaticamente no boot do backend (criaria um
webhook novo a cada deploy se não fosse cuidadosamente idempotente, e
precisaria de tratamento de erro/retry que não vale o esforço pra algo tão
raro). Seguido o mesmo padrão já usado pra `backend/prisma/seed.ts`: um
script standalone (`backend/scripts/register-asaas-webhook.ts`, rodado via
`tsx`, fora do `tsconfig.json` "include" do backend - mesma pasta/situação
do seed) que o Yuri roda manualmente quando precisar.

### `asaas-client.ts` ganhou `listWebhooks`/`createWebhook`/`updateWebhook`

Métodos novos no client HTTP já existente (mesmo padrão de
`createCheckout`/`cancelSubscription`), confirmados contra a API real do
Asaas (`POST/PUT /v3/webhooks`, `GET /v3/webhooks`) - `name`, `url`,
`email`, `enabled`, `interrupted`, `apiVersion: 3`, `authToken`,
`sendType: "SEQUENTIALLY"`, `events`. Validado rodando de verdade contra o
sandbox (chave já configurada em dev): `listWebhooks` retornou lista vazia
(confirma o achado de 2026-08-15, nenhum webhook cadastrado ainda);
`createWebhook` com dado de teste deliberadamente inválido (URL
`localhost`, token `"aaaa..."`) foi corretamente rejeitado pela API do
Asaas com erros claros (`"A url informada é inválida"`,
`"O token não pode conter mais de 4 caracteres iguais consecutivos"`) -
confirma que a chamada chega certa na API deles, só não foi testado o
caminho de sucesso de verdade pra não sujar o sandbox com um webhook de
teste.

### Eventos inscritos: só os 3 que o controller realmente trata

`webhook.controller.ts` ganhou `export const HANDLED_ASAAS_EVENTS` (união
de `CONFIRMED_EVENTS`/`OVERDUE_EVENTS` já existentes:
`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`/`PAYMENT_OVERDUE`) - fonte única
reusada pelo script, pra nunca inscrever um evento que o controller não
sabe processar (ou esquecer de inscrever um que ele trata). O
`asaasWebhookSchema` continua aceitando qualquer `event` (payload externo,
não validamos contra uma lista fechada), mas o Asaas só manda o que a
gente pediu pra receber.

### Duas travas de segurança no script (achadas testando)

- **Recusa rodar se `ASAAS_ENV != "production"`** - erro claro em vez de
  cadastrar sem querer um webhook de teste apontando pra
  `localhost`/sandbox junto com o de produção.
- **Recusa `APP_BASE_URL` que não comece com `https://`** - confirmado
  testando que o Asaas rejeita URL não-pública/não-HTTPS
  (`"A url informada é inválida"`), então falhar cedo com mensagem clara é
  melhor que deixar a API deles devolver um erro genérico.
- **Valida `ASAAS_WEBHOOK_TOKEN`** antes de chamar a API: 32-255
  caracteres (regra documentada do Asaas) e sem mais de 4 caracteres
  iguais consecutivos (regra descoberta testando, não documentada
  explicitamente na doc pública).

### Idempotente por design

Antes de criar, o script busca (`listWebhooks`) se já existe um webhook
com a mesma `url` - se sim, atualiza (`updateWebhook`) em vez de criar
outro (o Asaas permite até 10 webhooks por conta; rodar o script várias
vezes por engano nunca duplica).

## 2026-08-18 - 3 melhorias no PDF de orçamento (dados da empresa, termos customizados, preview)

### Dados da empresa: 4 campos novos, todos opcionais e independentes

`Company` ganhou `taxId`/`phone`/`address`/`customTerms` (todos
`String?` nullable). Editáveis na aba Perfil de `/dashboard/settings`,
junto dos campos que já existiam ali (nome, país, idioma) - mesmo padrão
de payload tri-estado já usado pro `country`: campo omitido não mexe no
valor salvo, string vazia ou `null` limpa, qualquer outra string grava.
Sem exigir nenhum deles (diferente de `country`, que é obrigatório desde
o cadastro) - empresa que nunca preencher continua vendo exatamente o
PDF de antes (placeholder "CNPJ/CPF: não informado", sem telefone/
endereço, termos padrão do sistema).

### Cabeçalho do PDF: altura dinâmica em vez de posição fixa

`drawHeader` em `quote-pdf.service.ts` antes desenhava sempre 2 linhas
fixas (contato + CNPJ) numa posição fixa (divisória em y=128). Reescrito
pra montar uma lista de linhas (`infoLines`) - contato sempre presente,
CNPJ/CPF sempre presente (com o placeholder quando vazio), telefone e
endereço só entram na lista se preenchidos - e calcular a posição da
divisória (`dividerY`) a partir da quantidade real de linhas, nunca menor
que 128 (mantém o layout idêntico ao anterior pra quem não preenche nada
novo). `drawHeader` passou a **retornar** essa posição, e
`drawCustomerBlock` (o card cinza com cliente/emitido/validade) usa esse
retorno em vez do `150` hardcoded de antes - o resto da página flui
corretamente não importa quantas linhas o cabeçalho acabou usando.

### Termos customizados: substituem, não complementam, os termos padrão

`Company.customTerms` é texto livre multi-linha (um termo por linha,
mesmo padrão de digitação que uma lista de bullets). Quando preenchido,
`resolveTerms()` faz `split("\n")` e usa isso no lugar dos 3 termos
padrão localizados (garantia/prazo/alterações) - a nota de validade
(`"Orçamento válido até ..."`) continua sendo sempre adicionada depois,
já que é uma informação calculada, não um termo editável. Não é
bilíngue - o texto digitado aparece do jeito que foi digitado,
independente do idioma do PDF (o dono da conta escreve no idioma dele
mesmo; traduzir automaticamente um texto livre do usuário não fazia
sentido).

### Preview antes do download: iframe com blob URL, sem lib nova

`download-quote-pdf.ts` foi dividido em `fetchQuotePdf` (só a chamada de
rede + resolução de blob/filename, sem efeito colateral) e
`triggerBlobDownload` (o `<a download>` sintético que já existia) -
`downloadQuotePdf` (usado em qualquer lugar que ainda queira baixar
direto) virou um wrapper fino dos dois. Novo componente
`QuotePdfPreviewModal.tsx`: busca o PDF ao abrir, mostra num
`<iframe src={blobURL}>` (navegadores renderizam PDF nativamente assim -
mesmo princípio já usado pro preview de e-mail em
`admin/email-templates`, que usa `srcDoc` com HTML; aqui é `src` com
blob porque o conteúdo é binário, não poderia ir inline via `srcDoc`),
com botão "Baixar" (usa o blob já buscado, sem nova chamada de rede) e
"Fechar". Usado nos dois lugares que geravam PDF antes -
`QuoteSummary`/`QuoteForm` (tela de criar/editar) e a listagem de
orçamentos - ambos perderam o download direto em favor de abrir esse
modal primeiro. `URL.revokeObjectURL` no cleanup do efeito evita
vazamento de memória do blob ao fechar o modal.

### Validado ao vivo

Preenchidos os 4 campos novos na aba Perfil, salvos, confirmados
persistindo após reload da página. Criado um orçamento de teste
(material/máquina cadastrados na hora) e gerado o preview em ambos os
pontos de entrada - botão da tela de criar/editar orçamento e da
listagem - confirmando em cada um que o `<iframe>` recebe uma `blob:`
URL de verdade (a chamada de rede pro endpoint de PDF retornou 200 nos
dois casos). Conteúdo textual do PDF em si (se CNPJ/telefone/endereço/
termos aparecem exatamente onde esperado no layout) não foi verificado
visualmente pixel a pixel - validado por revisão de código + tipos
batendo depois da migration, não por inspeção visual do PDF renderizado.
Suite completa do backend: 95/95 passando. Lint/build limpos em
shared/backend/frontend.

## 2026-08-18 - Tela admin do catálogo de impressoras + import CSV

### CRUD segue exatamente o padrão de `/admin/plans`/`/admin/system-formulas`

`machine-catalog.service.ts` (que já tinha só `search()`, usado pelo
autocomplete de cadastro de máquina das empresas) ganhou
`listAll`/`getById`/`create`/`update`/`remove`, mesmo desenho dos outros
recursos admin: conflito de `@@unique([brand, name])` vira `409
MACHINE_CATALOG_CONFLICT` (não um 500 genérico), cada mutação grava
`AuditLog` (`ADMIN_MACHINE_CATALOG_CREATED/UPDATED/DELETED`). Confirmado
que `Machine` (a tabela por empresa) não tem FK pra `MachineCatalog` -
é só uma fonte de autocomplete, os valores são copiados na hora do
cadastro - então excluir uma linha do catálogo nunca quebra nada em
orçamentos/máquinas já existentes.

### Import CSV: parse no frontend, validação linha-a-linha no backend

Decisão de não adicionar `multer` (ou qualquer parser de CSV) no backend -
o catálogo é uma tabela de referência pequena (~60-100 linhas, não
milhares), então o parser roda no navegador
(`frontend/src/lib/csv.ts`, RFC4180 básico: campos entre aspas, aspas
duplicadas escapando, vírgula dentro de aspas) e o resultado vai como
JSON (`{ rows: [...] }`) pro backend. Mesma filosofia já seguida o resto
da sessão (i18n sem `next-intl`, lista de países sem lib) - zero
dependência nova pra um problema pequeno.

Ponto importante descoberto ainda na primeira versão: se o schema Zod
validasse o array inteiro de uma vez (`z.array(machineCatalogCreateSchema)`),
UMA linha inválida rejeitava o lote inteiro (Zod falha o `.parse()` no
primeiro erro de qualquer elemento do array). Isso contradiz o objetivo
do recurso - um CSV real de dezenas de linhas com um typo numérico não
pode invalidar as 59 linhas boas. Corrigido: a rota só valida que `rows`
é um array de objetos (`z.array(z.record(z.string(), z.unknown()))`), e
`machineCatalogService.importRows()` roda `machineCatalogCreateSchema
.safeParse()` **linha por linha**, coletando erro com número da linha
sem abortar o resto. Validado ao vivo com um CSV de 3 linhas (2 boas, 1
com preço negativo) - resultado exato: 2 criadas, 1 erro reportado com
"Linha 3 (CsvBrand Bad Model): Too small: expected number to be >=0",
catálogo com as 2 linhas boas.

### Import é upsert por (brand, name), não insert puro

Reenviar o mesmo CSV (ou uma versão corrigida) nunca duplica - o
`brand_name` (chave composta do `@@unique`) decide se a linha atualiza
uma existente ou cria uma nova, contabilizado separadamente em
`created`/`updated` na resposta. Isso é literalmente o motivo do pedido
do Yuri (`Notas/TODO.md` já registrava "preços do catálogo desatualizam
com o tempo, sem tela pra editar") - reimportar um arquivo com preços
corrigidos é o fluxo esperado, não um erro. Validado ao vivo: reimportar
um CSV de 1 linha com preço diferente atualizou o valor sem criar
duplicata (contagem total de itens não mudou).

### Bug achado testando: `entityId` de auditoria não aceita string livre

`AuditLog.entityId` é `@db.Uuid` no schema - a primeira versão do log de
auditoria da importação usava `entityId: "bulk"` (não existe UM registro
pra essa ação, é um lote) e isso falhava silenciosamente
(`audit-log.service.ts` engole erro de escrita de log, só loga
"Audit log write failed" e segue - decisão antiga de nunca deixar
auditoria quebrar a ação principal). Corrigido omitindo `entityId`
inteiramente nesse caso (campo já é opcional) - o resumo do lote
(`created`/`updated`/`errorCount`) já vai inteiro em `metadata`. Achado
rodando o teste de integração novo, não em produção.

## 2026-08-18 - Testes E2E de frontend com Playwright (fase 3 de TEST-001)

### Setup: Playwright direto em `frontend/`, sem CI ainda

`@playwright/test` como devDependency, Chromium apenas instalado
(`npx playwright install chromium`). `frontend/playwright.config.ts`:
`webServer` como array com dois entries (backend `:3001/api/health`,
frontend `:3000`), cada um com `reuseExistingServer: true` - deixa o
Playwright subir os dois servidores do zero numa máquina limpa, mas
também anexa a processos `npm run dev` já rodando (o caso comum de
desenvolvimento local) em vez de dar erro de porta ocupada. Mesma
filosofia de "sem infra nova" já seguida a sessão inteira: nenhum banco
de teste isolado (os specs registram sua própria empresa via UI a cada
run, mesma limitação já documentada pros testes de integração do
backend em `Contextos/Ambientes.md`), sem pipeline de CI (roda manual
via `npm run test:e2e` de dentro de `frontend/`).

### Achado real: locale do Playwright quebra a própria detecção de idioma do app

Primeira rodada falhou inteira com timeout em `getByLabel('Nome
completo')`. Causa: o contexto de browser do Playwright usa `en-US` por
padrão, e `LanguageContext.tsx` detecta o idioma da UI via
`navigator.language` - a página de cadastro renderizou inteira em
inglês. Corrigido com `use: { locale: "pt-BR" }` no config. Vale como
lembrete: qualquer novo spec que dependa de texto em português precisa
desse locale fixado, não é comportamento automático do Playwright.

### Achado real (não bug de teste): rótulo do campo de e-mail diverge entre cadastro e login

Depois do fix de locale, o teste ainda travava em `getByLabel("E-mail")`
na tela de **login**. A árvore de acessibilidade real (capturada no
`error-context.md` que o Playwright gera em toda falha) mostrou que o
campo de login se chama exatamente "Email" (sem hífen, chave
`auth.login.email`), enquanto o de cadastro é "E-mail" (com hífen,
`auth.register.email`) - inconsistência de tradução dentro do próprio
dicionário PT do app, não um erro de locator. Também descoberto ali: o
`<label>` da senha no login engloba o link "Esqueci minha senha" no
mesmo elemento, então o nome acessível do campo vira "Senha Esqueci
minha senha" - `getByLabel("Senha", {exact:true})` nunca bate.
Corrigido nos specs (`getByLabel("Email", {exact:true})` /
`getByLabel("Senha")` sem exact, só na seção de login) - a
inconsistência em si **não foi corrigida no app**, fica sinalizada aqui
e em `Notas/TODO.md` para o Yuri decidir se vale padronizar.

### Achado real: rate limit de registro pode ser atingido reexecutando a suíte rápido demais

`registerRateLimiter` (5/min por IP) já existia e já tinha o mesmo
problema resolvido nos testes de integração do backend (IP falso via
`X-Forwarded-For`, ver `TEST-001` em `Contextos/Auditoria.md`). E2E
dirigido por browser real não tem como forjar IP por request da mesma
forma - com 3 registros por rodada completa da suíte, isso nunca é
problema numa execução isolada, mas rodar a suíte várias vezes seguidas
em menos de um minuto (como aconteceu durante o desenvolvimento desta
sessão, testando specs separados e depois juntos) esbarra no limite.
Comportamento correto do rate limit, não um bug - só documentando como
limitação prática de reexecução.

### Escopo: 3 testes, caminhos felizes centrais, não cobertura exaustiva

`e2e/auth.spec.ts` (registro→dashboard→logout→login de novo; senha
errada mostra erro sem navegar) e `e2e/quote-creation.spec.ts` (cadastra
máquina com só o nome preenchido + material com só marca/cor
preenchidos, relying nos defaults do resto do form - cria orçamento -
aparece na listagem). Decisão deliberada de não perseguir cobertura
exaustiva nesta rodada (edição, exclusão, filtros, relatórios, admin,
etc. continuam sem E2E) - o pedido original era fechar a fase 3 de
TEST-001, que o próprio achado da auditoria já descrevia como "testes de
frontend/E2E são uma fase posterior", sem especificar profundidade.
Ver `Notas/TODO.md` se quiser expandir depois.

## 2026-08-18 - Landing page pública vira a rota `/` do próprio Next.js app

O Yuri montou uma landing page estática (`pricify3d-landing.html` +
`logo_full.webp`/`logo_icon.webp`) pra servir de página de atração e
pediu pra colocar no lugar certo da estrutura do projeto.

### Onde ela mora: viu que `/` hoje é um redirect vazio, virou a home real

Antes desta mudança, `pricify3d.com/` (raiz do domínio, já configurada no
Nginx de produção apontando pro Next.js na porta 3000 - ver
`Contextos/Ambientes.md`) só rodava `frontend/src/app/page.tsx` com
`redirect("/dashboard")`, que por sua vez cai em `/login` se ninguém
estiver autenticado - ou seja, hoje um visitante novo bate na raiz do
domínio e nunca vê nada além da tela de login. Não fazia sentido hospedar
a landing como HTML estático separado (exigiria subdomínio novo ou rota
estática fora do Next, mais infra sem necessidade) quando o "lugar certo"
já existe e está sendo desperdiçado: virou o conteúdo real de
`frontend/src/app/page.tsx`, a landing renderizada por Next (Server
Component + `metadata` export pro title/description). URL final: só
`https://pricify3d.com/` - nenhuma mudança de DNS/Nginx necessária.

Pra não regredir o comportamento anterior (usuário já logado que bate na
raiz), `frontend/src/proxy.ts` ganhou uma checagem a mais: `/` agora
também redireciona pra `/dashboard` quando existe cookie de sessão válido
- só visitante sem sessão vê a landing.

### CSS scoped via CSS Modules em vez de reescrever em Tailwind

A landing original é CSS puro (custom properties, sem Tailwind), e o
resto do app usa Tailwind. Reescrever ~360 linhas de CSS pra utility
classes seria trabalho grande e arriscado (fácil perder fidelidade
visual numa peça que é justamente sobre design/primeira impressão).
Em vez disso: porta quase 1:1 pra `frontend/src/app/landing.module.css`,
deixando o CSS Modules (já suportado nativamente pelo Next, zero
dependência nova) hashear toda classe automaticamente - sem risco de
colisão com nomes genéricos já usados em outras telas (`.btn`, `.icon`,
`.title`, etc., muito comuns). As únicas 4 coisas que CSS Modules NÃO
escopa sozinho (seletores de tag pura - `a`, `img`, `ul`, `h1-h4` - e as
variáveis `:root`) foram movidas pra depender de `.landingRoot` (a div
que envolve a página inteira), pra garantir que nada delas vaze pro
restante do app (`/dashboard`, `/admin`, etc.) - ex.: sem isso, um
`img{max-width:100%}` genérico afetaria toda imagem do sistema.
`header`/`nav`/`section`/`footer`, que também eram seletores de tag no
original, ganharam classes próprias (`.siteHeader`, `.siteNav`,
`.section`, `.siteFooter`) em vez de reaproveitar o mesmo truque -
mais idiomático pra JSX (`<header className={styles.siteHeader}>`) do
que ficar dependendo de escopo implícito.

### Animação de scroll-reveal: `data-*` attributes, não nomes de classe

O JS original usa `document.querySelectorAll('.reveal')` e
`el.classList.add('in')` - ambos strings literais que não existem mais
depois que CSS Modules hasheia os nomes (`styles.reveal` vira algo tipo
`landing_reveal__a1b2c`, não `"reveal"`). Solução: um client component
(`frontend/src/components/landing/RevealOnScroll.tsx`) que seleciona via
`data-reveal`/`data-calc-anim` (atributos estáveis, não afetados por
hashing) e, ao invés de togglar uma classe, seta `opacity`/`transform`
inline diretamente - reproduz o efeito visual do `.reveal.in{}` original
sem precisar referenciar o nome hasheado.

### CTAs conectados ao fluxo real (não eram placeholders vazios)

No HTML original os botões "Começar grátis"/"Assinar Pro" apontavam pra
`href="#"` ou `#planos` (placeholders) e "Entrar" também ia pra
`#planos`. Como decisão de implementação (a landing só cumpre a função
de atração se os CTAs realmente levarem a algum lugar): "Entrar" →
`/login`; todo "Começar grátis"/"Assinar Pro" → `/register` (inclusive o
card Pro - o app não tem checkout público sem conta, plano é escolhido
depois de logado em `/dashboard/billing`). Âncoras internas
(`#funcionalidades`, `#como-funciona`, etc.) continuam apontando pra
seções da própria página, sem mudança.

### Achado, não corrigido: preços do plano Pro estão hardcoded na landing

`R$ 39,90/mês` na seção de planos é texto estático copiado do HTML
original, não vem da tabela `Plan` (que já é editável via
`/admin/plans` - o próprio Yuri mudou os preços reais nesta sessão, ver
`Notas/TODO.md`). Se o preço do plano Pro mudar de novo, essa landing
não atualiza sozinha. Não corrigido agora (buscar o preço via API
pública em cada carregamento da landing seria uma mudança de escopo -
hoje `GET /billing/plans` não é uma rota pública sem autenticação, teria
que virar uma, e adicionaria uma chamada de rede numa página que hoje é
100% estática/prerenderizada) - registrado em `Notas/TODO.md` pra
manter em mente na próxima vez que o preço mudar.

### Verificação

`npx tsc --noEmit`, `npm run lint` (limpo, só 1 warning esperado do
`@next/next/no-page-custom-font` - a landing carrega Google Fonts
próprios via `<link>`, intencionalmente só nesta página, não no layout
raiz) e `npm run build` (rota `/` aparece como estática/prerenderizada
no output). Testado ao vivo via `npm run dev` + inspeção de estilos
computados: cor de fundo/texto/fonte batendo exatamente com os tokens
do design (`rgb(10,12,17)`/`rgb(244,246,251)`/`Space Grotesk` no h1),
hrefs dos CTAs corretos (`/login`, `/register`), chunk CSS do módulo
carregando com 200, JS de scroll-reveal rodando sem erro (confirmado
indiretamente via `animationPlayState` do card de cálculo), `/login`
continua acessível normalmente depois da mudança no `proxy.ts`.

## 2026-08-19 - Log de e-mails visível em `/admin/email-templates`

Yuri perguntou se existia log do e-mail enviado na função "testar
e-mail" e pediu pra implementar se não houvesse.

### O log já existia — faltava só a tela

`EmailService.send()` (o método usado por **todo** disparo, incluindo
`sendTest()` por trás do botão "Testar e-mail") já gravava uma linha em
`EmailLog` desde a implementação original do sistema de e-mails
(2026-08-15) - status `SENT`/`FAILED`/`SKIPPED_INACTIVE`/
`SKIPPED_PREFERENCE`, `resendMessageId`, `errorMessage`. Só não existia
nenhuma rota admin nem tela pra ler essa tabela - os dados estavam sendo
salvos "no escuro". Confirmado por grep antes de escrever qualquer
código, pra não duplicar o que já existia.

### Onde mora: nova seção na mesma página, não uma rota admin separada

"Logs de envio" virou uma segunda `Card` na própria
`/admin/email-templates` (abaixo da tabela de templates), em vez de uma
tela nova no menu admin - é exatamente onde um admin já está quando
clica em "Testar e-mail" e quer saber se funcionou, sem precisar
navegar pra outro lugar. Backend: `GET /admin/email-logs`
(`emailLogService.list()`, paginado - `page`/`pageSize`/`status`,
mesmo formato de paginação já usado em `QuoteService.list()`), filtro
opcional por status. Sem create/update/delete - é só leitura, os dados
já são escritos automaticamente pelo `EmailService`.

### UX: log atualiza sozinho depois de mandar um teste

O botão "Testar e-mail" agora chama `loadLogs()` no `finally` do envio
(sucesso, falha ou erro de rede) - o admin vê a nova linha aparecer sem
precisar clicar em "Atualizar" manualmente. A seção também tem filtro
por status (Enviado/Falhou/Pulado-inativo/Pulado-preferência) e
paginação (20 por página, com botão anterior/próximo), já que a tabela
cresce rápido (cada teste manual + cada disparo real grava uma linha).

### Verificação

`tsc --noEmit`/`lint`/`build` limpos em shared/backend/frontend. 4
testes novos de integração (`backend/src/routes/email-log.routes.test.ts`
- não-admin bloqueado, listagem com paginação e ordenação por mais
recente primeiro, filtro por status, filtro inválido rejeitado com
`VALIDATION_ERROR`). Suite completa do backend: 105/105 passando.
Testado ao vivo: registrei uma empresa nova via UI, promovi a `ADMIN`
direto no banco (mesmo atalho dos testes de integração), cliquei em
"Testar e-mail" num template - a linha nova apareceu no topo da lista
automaticamente, com status `FAILED`/"RESEND_API_KEY not configured"
(esperado em dev sem a chave real do Resend - confirma que o mecanismo
inteiro funciona, incluindo o caminho de erro). Testei o filtro por
status (`Enviado` reduziu de 1172 pra 136 registros, paginação recalculou
de "1 de 59" pra "1 de 7" corretamente) e confirmei que um envio real
bem-sucedido (`SUBSCRIPTION_RENEWED` gravado pelos testes automatizados,
que mockam o Resend) aparece com status `Enviado`/tom verde. Empresa de
teste apagada do banco depois da verificação.

## 2026-08-19 - Status de entrega do e-mail via webhook do Resend

Yuri, depois de ver o log de envios: "quero mais informações, quero o
log do envio para saber se foi entregue ou se ele deu algum erro de
envio". O log anterior só mostrava se a **chamada à API** do Resend foi
aceita (`status: SENT`) - não se o e-mail realmente chegou. Essas são
coisas diferentes: a API aceita o envio de forma síncrona, mas
entrega/bounce/spam são resolvidos depois, de forma assíncrona, do lado
do Resend.

### Só dá pra saber via webhook - não existe API síncrona pra isso

Fui checar a documentação do Resend antes de supor o formato (
`resend.com/docs/webhooks/*`) em vez de adivinhar - importante numa
feature que verifica assinatura criptográfica em produção. Confirmado:
Resend manda eventos assíncronos (`email.delivered`, `email.bounced`,
`email.complained`, `email.delivery_delayed`, `email.failed`, entre
outros) via webhook, assinado com **svix** (mesmo protocolo usado por
Clerk, Svix mesmo, etc - não é assinatura própria do Resend). Payload
confirmado por tabela: `data.email_id` (bate com o `resendMessageId` já
salvo), `data.bounce.message` só em `email.bounced`, `data.failed.reason`
só em `email.failed` - `email.complained`/`email.delivery_delayed` não
trazem motivo estruturado, só o status em si.

### Segunda descoberta na documentação: Resend também tem API de gestão de webhook

Igual o Asaas, dá pra criar/listar/atualizar webhook via API
(`POST/GET/PATCH https://api.resend.com/webhooks`) - `resendClient`
ganhou `listWebhooks`/`createWebhook`/`updateWebhook` (fetch direto,
mesma forma que `asaas-client.ts` já fazia, já que o SDK `resend` não
cobre gestão de webhook, só envio). Novo script
`backend/scripts/register-resend-webhook.ts`, mesmo padrão do script do
Asaas: idempotente (atualiza em vez de duplicar se já existir um
webhook pra essa URL), recusa `APP_BASE_URL` que não seja `https://`.
**Diferença importante do Asaas**: o Resend só devolve o
`signing_secret` **uma vez**, na criação - o script imprime ele bem
destacado na primeira execução, instruindo colar em
`RESEND_WEBHOOK_SECRET` no `.env` real; reexecuções (pra atualizar a
lista de eventos, por exemplo) não imprimem segredo novo, só confirmam
que o existente continua valendo.

### Verificação de assinatura: pacote `svix`, corpo raw capturado via `verify` do `express.json`

Adicionada a dependência `svix` (recomendada pela própria documentação
do Resend pra verificar assinatura - não vale a pena reimplementar
HMAC+tolerância de timestamp na mão numa rotina de segurança). Testado
à mão via `require('svix')` + `Webhook.sign()`/`.verify()` (assinatura
boa aceita, assinatura errada rejeitada) antes de escrever qualquer
código de produção em cima disso - mesmo cuidado do aprendizado já
registrado sobre bug de ESM/CJS em `shared/src`
(`Contextos/Conhecimento.md`).

**Pin em `svix@1.99.1`, não a versão mais nova (`2.0.0`)**: a última
major (`2.0.0`, lançada há pouco) já roda em CommonJS via
`require()` graças à interop nativa do Node moderno (confirmado
funcionando aqui, que roda Node 24) - só que ela declara
`"engines": {"node": ">=22"}` no `package.json`, e o
`backend/Dockerfile` de produção usa `node:20-slim`
(`Contextos/Conhecimento.md` já documenta um bug real de produção
causado por diferença entre o Node local e o Node do container - não
ia repetir o mesmo tipo de erro sem poder testar contra o Docker de
verdade, que não está disponível neste ambiente). `1.99.1` (a última
da série 1.x) não declara `engines` nenhum e já é CommonJS nativo
(`"type":"commonjs"`, `main: dist/index.js`) - zero risco de
incompatibilidade com o Node 20 do container, mesma API pública
(`Webhook.sign`/`.verify`), sem nenhuma mudança de código necessária
depois da troca.

A verificação de assinatura do svix precisa dos **bytes exatos** que o
Resend assinou - reserializar `req.body` já parseado pelo
`express.json()` gera uma string ligeiramente diferente (ordem de
chaves, espaçamento) e quebra a verificação. Solução: `express.json()`
ganhou a opção `verify`, que captura o buffer bruto em `request.rawBody`
antes do parse - usado só pela rota `/webhooks/resend`, não afeta as
demais.

### Dados: 4 colunas novas em `EmailLog`, não uma tabela separada

`deliveryStatus`/`deliveryDetail`/`deliveryPayload`/`deliveryUpdatedAt`
adicionados na mesma tabela (migração
`20260819120000_add_email_log_delivery_status`) em vez de uma tabela de
eventos separada - o caso de uso é "1 e-mail, 1 status de entrega atual"
(o e-mail não é reenviado então não tem múltiplos eventos concorrentes
de verdade pra rastrear em uma tabela própria), e olhar `EmailLog` já
responde a pergunta do Yuri sem join nenhum. `deliveryPayload` guarda o
payload bruto do evento (JSON) mesmo já extraindo `deliveryDetail` -
rede de segurança caso um evento futuro tenha um formato que a extração
não previu (o dado bruto nunca se perde, só o texto amigável que pode
ficar incompleto).

### Endpoint tolerante quando não configurado - nunca vira dependência dura

Diferente do `ASAAS_WEBHOOK_TOKEN` (obrigatório em produção -
`Contextos/Decisoes.md` anterior sobre o webhook do Asaas),
`RESEND_WEBHOOK_SECRET` é opcional mesmo em produção. Se não estiver
configurada, a rota só confirma recebimento (200) sem processar nada -
decisão deliberada porque essa é uma feature 100% aditiva/informativa
(coluna "Entrega" mostra "Aguardando" pra sempre se o webhook nunca for
cadastrado), nunca deveria travar o boot do backend nem o envio de
e-mail de verdade. Reforça o texto do TODO: o Yuri ainda precisa rodar
`npm run resend:register-webhook` em produção pra essa parte realmente
funcionar.

### UI: coluna "Entrega" separada de "Status", com estado "Aguardando"

Adicionei a interpretação certa pro caso comum: `deliveryStatus === null`
não significa "sem informação" incondicionalmente - se `status === SENT`
(a chamada à API foi aceita) e ainda não chegou evento, é "Aguardando"
(neutro); se `status !== SENT` (falhou/pulado), a entrega nunca vai
acontecer, mostra "—". Só quando um evento realmente chega é que vira
Entregue/Devolvido/Marcado como spam/Atrasado/Falhou na entrega (com o
`deliveryDetail`, quando existe, abaixo do badge). Filtro por
`deliveryStatus` adicionado no mesmo padrão do filtro por `status` já
existente.

### Verificação

7 testes de integração novos
(`backend/src/routes/resend-webhook.routes.test.ts` - sem headers
rejeitado, assinatura inválida rejeitada, `email.bounced` extrai a
mensagem certa, `email.failed` extrai o motivo certo, `email.opened`
(não rastreado) é ignorado sem tocar o registro, mensagem desconhecida
não quebra nada). Segredo de teste fixo em `vitest.config.mts`
(mesmo padrão já usado pro `TRUST_PROXY_HOPS=1`), assinado de verdade
via `svix`'s `Webhook.sign()` em cada teste. Suite completa do backend:
**112/112 passando**. `tsc`/`lint`/`build` limpos em shared/backend/
frontend, incluindo checagem extra de que o `dist/` compilado sobe e
responde `/api/health` de verdade (não só `tsc --noEmit`) - repetida
depois de trocar pra `svix@1.99.1` também, pra confirmar que o pin de
versão não quebrou nada.

Testado ao vivo: criei uma linha de `EmailLog` direto no banco
(`status: SENT`, sem evento de entrega ainda) - UI mostrou "Aguardando"
corretamente; atualizei a mesma linha simulando um `BOUNCED` com detalhe
- UI mostrou "Devolvido" + a mensagem da suppression list; testei o
filtro por status de entrega (`BOUNCED` reduziu de 3 pra 1 registro
corretamente). Dados de teste apagados depois.

## 2026-08-20 - Prévia do conteúdo enviado (achado: HTML nunca era salvo)

Yuri, depois de conferir que o log mostra envios reais e de teste
juntos: pediu prévia do e-mail enviado pra caso um cliente com
problema no reset de senha não tenha recebido, poder ver o link/
informação e passar manualmente.

### Achado antes de implementar: o `EmailLog` nunca guardava o HTML de verdade

`EmailService.send()` sempre computou `html` (com as variáveis já
substituídas - inclusive o token real do link de reset) só pra mandar
pro Resend - nunca gravava esse HTML em lugar nenhum, só o `subject`.
Ou seja, o pedido do Yuri (ver o link que foi mandado de verdade pra um
cliente específico) **não era possível** com os dados que já existiam -
o token de reset é gerado uma vez, no momento do envio, e não dá pra
reconstruir depois só a partir do template (é aleatório). Precisou de
uma coluna nova, não só uma tela nova.

### `bodyHtml` na própria linha do `EmailLog`, não numa tabela separada

Coluna `body_html TEXT` nova (migração
`20260820090000_add_email_log_body_html`), preenchida no mesmo
`prisma.emailLog.create()` que já gravava status/assunto -
`EmailService.send()` só precisou passar `bodyHtml: html` a mais.
Guarda o HTML **exato** que foi de fato enviado (nome do cliente, link
com o token real, etc.), não uma reconstrução a partir do template
atual - importante porque o template pode ter sido editado depois, e o
token do link é único por envio.

### Endpoint de detalhe separado da listagem, por causa do tamanho

`bodyHtml` **não** entra na resposta paginada de `GET /admin/email-logs`
(list) - só a listagem já carrega até 20 linhas de uma vez, e HTML de
e-mail formatado facilmente passa de alguns KB por linha. Novo
`GET /admin/email-logs/:id` (`EmailLogDetailResource` no shared, estende
`EmailLogResource` só com `bodyHtml`) busca **uma** linha por vez,
chamado só quando o admin clica no botão de prévia - mesmo raciocínio
de "campo pesado só sob demanda" que outras APIs desse projeto já
seguem.

### Reusa o padrão de modal com iframe sandboxed que a prévia de template já tinha

`/admin/email-templates` já tinha um modal de prévia (pro **template**,
com dados de exemplo) usando `<iframe sandbox="" srcDoc={html}>` -
mesmo padrão pro **envio real** (modal novo, estado `logPreview`
separado, busca sob demanda via `GET /admin/email-logs/:id`, loading
spinner enquanto busca, mensagem de fallback se `bodyHtml` for `null` -
cobre linhas gravadas antes dessa migração, ou `SKIPPED_INACTIVE` onde
nada chegou a ser renderizado). `sandbox=""` sem `allow-same-origin`
também bloqueia o próprio parent de inspecionar o conteúdo via JS -
confirmado sem querer durante o teste ao vivo (script de verificação
não conseguiu ler `iframe.contentDocument`), o que é o comportamento de
segurança correto, não um bug.

### Achado nos testes, não relacionado à feature em si: corrida entre arquivos de teste

Ao adicionar os testes novos (que também usam `vi.spyOn(resendClient,
"send")`), a suite completa (`npm run test`) começou a falhar de vez em
quando com uma contagem de chamada errada num teste **sem relação**
nenhuma com essa mudança. Causa: `resendClient` é um singleton de
verdade, `vitest.config.mts` já usava `pool: "threads"` (threads
compartilham processo/module cache - decisão de 2026-08-13), e por
padrão o Vitest roda arquivos de teste em paralelo - com mais arquivos
mexendo no mesmo singleton ao mesmo tempo, a chance de um teste
"roubar" uma chamada do spy de outro arquivo ficou alta o bastante pra
reproduzir com frequência (risco que já existia, só que raro antes).
Corrigido com `fileParallelism: false` em `vitest.config.mts` -
confirmado com 6 rodadas seguidas da suite completa, sem nenhuma falha
de asserção depois da mudança. Detalhe à parte, não 100% resolvido: o
processo do `vitest` ainda crasha ocasionalmente com erro nativo do
Windows (mesma família do problema já documentado sobre Prisma +
threads) - não afeta o resultado dos testes em si (sempre bateram
certo nas 6 rodadas), só o exit code do processo às vezes. Ver
`Contextos/Conhecimento.md` (2026-08-20) para os dois achados
detalhados.

### Verificação

Novos testes: `email.service.test.ts` ganhou uma asserção confirmando
que `EmailLog.bodyHtml` bate exatamente com o HTML mandado pro Resend;
`email-log.routes.test.ts` ganhou uma descrição nova
(`GET /api/admin/email-logs/:id`) com casos de não-admin bloqueado,
404 pra id desconhecido, e conteúdo renderizado correto (sem
`{{variavel}}` sobrando) - mais um teste confirmando que a listagem
**não** inclui `bodyHtml`. `tsc`/`lint`/`build` limpos em
shared/backend/frontend. Testado ao vivo: mandei um teste do template
`PASSWORD_RESET`, abri a prévia pelo botão novo na linha do log,
confirmei via inspeção da resposta de rede (não do DOM do iframe, por
causa do sandbox) que `bodyHtml` chegou com o HTML completo, incluindo
o link `href="https://app.pricify3d.com/reset-password?token=..."` -
exatamente o cenário que o Yuri descreveu (cliente sem receber,
precisar ver o link pra passar manualmente). Dados de teste apagados
depois.

## 2026-08-20 - Origem teste/real no log + limpeza automática + plano Cortesia

### Coluna "Origem" no log de e-mails

`EmailLog` ganhou `isTest Boolean @default(false)` (migração
`20260820140000_add_email_log_is_test`). `EmailService.send()` já tinha
duas chamadas de `prisma.emailLog.create()` (caminho `SKIPPED_INACTIVE`
e o caminho principal SENT/FAILED) - as duas passaram a gravar
`isTest: options.isTest ?? false`. `sendTest()` (usado só pelo botão
"Testar e-mail") é o único ponto que chama `send()` com
`{ force: true, isTest: true }` - todo outro trigger (conta criada,
reset de senha, eventos de assinatura, resumo de orçamento) nunca passa
essa opção, então fica `false` por padrão. Coluna "Origem" nova na
tabela (badge "Teste"/"Real") e filtro próprio ("Teste e real"/"Só
reais"/"Só testes"), mesmo padrão dos filtros de status/entrega já
existentes.

Achado ao escrever o validator: `z.coerce.boolean()` do Zod trata a
**string** `"false"` (que é o que sempre chega numa query string) como
verdadeira - `Boolean("false") === true` em JS, pegadinha conhecida.
Usado em vez disso `z.enum(["true","false"]).transform(v => v ===
"true")`, que só existe porque fui conferir antes de assumir que
`coerce.boolean()` funcionava certo.

### Limpeza automática: só linhas de teste, 48h, novo job

Novo `backend/src/jobs/email-log-cleanup.job.ts`, espelhando
exatamente `subscription-expiring.job.ts` (função exportada testável +
`node-cron` agendando às 3h da manhã, horário de menor tráfego,
`timezone: "America/Sao_Paulo"`). `prisma.emailLog.deleteMany({ where:
{ isTest: true, createdAt: { lt: cutoff } } })` - só apaga o que tem
`isTest: true` E passou de 48h; linhas reais nunca são tocadas, não
importa a idade. Registrado em `server.ts` junto do job já existente.
Testado rodando a função direto contra o banco de dev (criei uma linha
de teste com `createdAt` forçado pra 50h atrás, rodei o job, confirmei
que sumiu; uma linha real "antiga" de propósito não foi tocada).

### Plano Cortesia: só uma linha nova no banco, zero código

Antes de escrever qualquer coisa, investiguei a arquitetura existente
de planos - achado importante: **tudo que esse pedido precisa já
existia, pronto, testado em produção**:
- `Plan.isPublic` (boolean) já existe, já filtra o que aparece na tela
  de cobrança do cliente (`planService.listPublic()`,
  `where: { isActive: true, isPublic: true }`) - um plano com
  `isPublic: false` já fica automaticamente invisível pra contratação,
  sem precisar mudar nada no código.
- Admin já consegue atribuir qualquer plano (público ou oculto) a
  qualquer empresa direto em `/admin/users` (seletor por linha, `PATCH
  /admin/users/:id` com `planId`) - `listAll()` (usado pra popular esse
  seletor) não filtra por `isPublic`, só `listPublic()` (usado na tela
  do cliente) filtra.
- `billingService.updateSubscription()` (chamado por esse PATCH) é
  **só um update no banco** (`prisma.company.update({ data: { planId,
  subscriptionStatus } })`) - nunca fala com o Asaas. Atribuir Cortesia
  não gera cobrança, checkout, nem qualquer chamada externa. Confirmado
  lendo o código antes de implementar, não assumido.

Dado isso, a única coisa que faltava de verdade era a **linha do plano
em si**. Nova migração (`20260820150000_add_courtesy_plan`) insere
`Cortesia` com os mesmos limites/recursos do Pro
(`max_machines_allowed/max_materials_allowed/max_quotes_per_month =
NULL` = ilimitado, `features: {"customFormulas":true,"pdfExport":true}`),
`price: 0`, `is_public: false`, `is_active: true` - mesmo formato/UUID
fixo que a migração original de Free/Pro/Enterprise já usava
(`20260813190000_asaas_plans_checkout_payment`), pra manter
consistência de como o catálogo de planos é semeado neste projeto (via
migração, não `seed.ts` - `seed.ts` só promove admin).

### Verificação

Testes novos: `email-log-cleanup.job.test.ts` (linha de teste com mais
de 48h é apagada, linha de teste recente e linha real antiga não são
tocadas) e um teste novo em `email-log.routes.test.ts` pro filtro
`isTest` (`?isTest=true`/`?isTest=false`, cada um só retornando o lado
certo). `tsc`/`lint`/`build` limpos em shared/backend/frontend. Suite
completa do backend: 118/118 (rodada 3x pra confirmar - 1 das 3 rodadas
crashou no meio pelo mesmo motivo nativo do Windows já documentado em
`Contextos/Conhecimento.md`, não uma falha de asserção real).

Testado ao vivo, de ponta a ponta: mandei um "Testar e-mail" (apareceu
"Teste" na coluna Origem) e disparei um reset de senha de verdade via
`POST /auth/forgot-password` (apareceu "Real"); filtro por origem
reduziu a lista corretamente nos dois sentidos (2597 registros só
reais / 28 só testes, no banco de dev cheio de dados de sessões
anteriores). Rodei o job de limpeza manualmente contra o banco real com
uma linha de teste forçada pra 50h atrás - confirmado que ela sumiu.
Plano Cortesia: confirmado aparecendo em `/admin/plans` com badge
"Oculto" e os mesmos limites/recursos do Pro; confirmado no seletor de
`/admin/users`; atribuí de verdade a uma empresa de teste e confirmei
via resposta de rede que virou `planId` da Cortesia, sem nenhuma
chamada ao Asaas nos logs do backend. Dados de teste apagados depois.

## 2026-08-20 - E-mail de pagamento atrasado, PDF bilíngue/traduzido e exportação resumida

Quatro pedidos na mesma rodada: confirmar o webhook do Asaas em
produção no TODO, um e-mail de "pagamento atrasado", tradução das
descrições de variáveis de fórmula e dos termos customizados do PDF, e
uma opção de exportar o orçamento em versão resumida (só o valor
total, sem detalhe por mesa).

### `PAYMENT_OVERDUE`: mesma guarda de idempotência que confirmada/renovada já usava

`webhook.controller.ts` já calculava `isNewPaymentRecord` (linha antes
do `payment.upsert`, comparando se já existia uma linha com aquele
`asaasPaymentId`) pra evitar reenvio de e-mail em reentrega do mesmo
webhook do Asaas (garantia "at least once" deles). Só adicionei um
`else if (isNewPaymentRecord && OVERDUE_EVENTS.has(event))` ao lado do
`if` que já existia pra `CONFIRMED_EVENTS`, chamando
`emailService.sendPaymentOverdue(company.id, paymentRow.id)` do mesmo
jeito fire-and-forget (`void`) que os outros 6 e-mails do sistema. Novo
template (`EMAIL_TEMPLATE_KEYS`/migração `..._add_payment_overdue_template`),
mesmo layout genérico dos outros, variável `invoiceUrl` cai pro link do
painel de cobrança (`/dashboard/billing`) quando o Asaas não manda um
link de fatura no payload do webhook.

### Termos customizados agora bilíngues - decisão deliberada: sem fallback cruzado entre idiomas

Até aqui `Company.customTerms` era só português, decisão documentada
como "não vale a pena" (ver entrada anterior no TODO). O Yuri pediu
pra reverter isso. Nova coluna `customTermsEn` (migração
`..._add_company_custom_terms_en`), campo próprio na aba Perfil,
completamente independente do campo em português - **sem fallback de
um pro outro**: se a empresa só preencheu o campo em português e gera
um PDF em inglês, o PDF usa os termos **padrão em inglês** do sistema,
nunca o texto em português digitado pelo usuário. A alternativa
(cair pro campo preenchido, seja qual for o idioma) foi descartada de
propósito - vazar texto em português num PDF que o cliente lê em
inglês (ou vice-versa) é pior do que simplesmente usar o termo padrão
localizado. `resolveTerms()` em `quote-pdf.service.ts` decide o campo
pelo idioma do PDF (`quote.company.user.language`), não pelo idioma de
quem está exportando.

### Descrições de variáveis de fórmula: só a descrição traduz, o nome (identificador) não

`systemVariableMeta` em `formula.service.ts` guardava só uma string em
português por variável - virou `Record<SupportedLanguage, string>`.
Mesma coisa pra `customVariableDescriptions` (o texto genérico mostrado
pras variáveis que a própria empresa cria em Custos Fixos).
`GET /formulas/variables` agora lê o idioma do usuário logado
(`User.language`) e devolve a descrição já traduzida. Decisão
importante: o **nome** da variável (`peso`, `tempo`,
`taxa_administrativa`, etc.) continua sempre em português, mesmo com a
UI em inglês - é o identificador que o usuário efetivamente digita
dentro da fórmula (`peso * 2 + tempo`), não um rótulo decorativo;
traduzir o nome quebraria fórmulas já salvas ou obrigaria o usuário a
decorar dois vocabulários pro mesmo conceito.

### Exportação resumida: mesmo `renderQuotePdf`, só troca o miolo da página

`GET /quotes/:id/pdf?format=FULL|SUMMARY` (novo query param, Zod
`z.enum(["FULL","SUMMARY"]).default("FULL")` em
`quotePdfExportQuerySchema`). `FULL` é o comportamento de sempre
(tabela de mesas + subtotal/descontos/total). `SUMMARY` pula a tabela
inteira e desenha só uma caixa compacta com o valor total
(`drawFinancialSummarySimple`) - sem material, sem máquina, sem
peso/tempo, sem o preço de cada mesa individual, só o número final que
o cliente precisa saber. Motivo do pedido: o Yuri quer poder mandar
uma versão pro cliente final sem expor o detalhamento interno de custo
por mesa (informação que pode revelar margem por item). O nome do
arquivo ganha sufixo (`_Resumido`/`_Summary`) pra quem baixa saber
qual versão é qual sem abrir. UI: toggle Completo/Resumido no topo do
`QuotePdfPreviewModal.tsx`, mesmo modal usado nos dois lugares que já
geravam PDF.

### Verificação

Testes novos: 2 em `email.service.test.ts` (pagamento atrasado
respeita preferência de e-mails financeiros; fallback do link de
fatura), `asaas-webhook.routes.test.ts` (dispara no evento novo, não
duplica em reentrega), `quote-pdf.routes.test.ts` (default é FULL,
SUMMARY gera arquivo menor e nomeado direito, formato inválido rejeita
com 400), `formula-variables.routes.test.ts` (descrição pt-BR por
padrão, inglês depois de trocar o idioma do usuário). Um teste novo
tinha corrida de verdade (`sendPaymentOverdue` contando 2 chamadas em
vez de 1 porque o e-mail de boas-vindas do próprio `registerTestCompany`
ainda estava em voo) - corrigido esperando esse e-mail de fundo
terminar antes de instalar o spy, mesmo padrão já usado antes nesta
sessão pra corrida parecida no teste do webhook. Suíte completa: os 16
arquivos / 127 testes passam limpo quando rodados em 2 lotes de 8
arquivos cada (processo único trava com o crash nativo Windows/Prisma
já documentado em `Contextos/Conhecimento.md` - dessa vez com
frequência bem mais alta que o normal, 7 tentativas seguidas travando
sozinhas antes de eu trocar pra rodar em lotes; vale investigar depois
se isso está piorando com o tamanho do banco de dev). `tsc`/`lint`/
`build` limpos em shared/backend/frontend.

Verificado ao vivo: registrei uma empresa de teste, promovi pro plano
Pro e preenchi os dois campos de termos via Prisma direto (pra não
precisar navegar o dropdown gigante de país da tela de Perfil), criei
um orçamento de uma mesa e baixei os 4 PDFs (FULL/SUMMARY × pt-BR/en)
via chamada direta à API. Confirmado nos PDFs: SUMMARY realmente omite
a tabela e mostra só "Valor total"; o PDF em português mostra o termo
em português digitado; o PDF em inglês mostra o termo em inglês
digitado (nenhum vazou pro idioma errado); `GET /formulas/variables`
com o usuário em inglês devolveu a descrição de `peso` traduzida,
mantendo o nome `peso` intacto. Dados de teste apagados depois.

## 2026-08-21 - Bug: fórmula do sistema selecionada num orçamento "esquecia" ao editar

O Yuri reportou: ao entrar pra editar um orçamento, a fórmula
selecionada voltava pra padrão, mesmo tendo escolhido outra
explicitamente na criação.

### Causa raiz: `Quote.formulaId` só sabia apontar pra fórmula da própria empresa

`GET /formulas` mistura dois tipos de fórmula na mesma lista pro
usuário: as próprias da empresa (tabela `formulas`, editáveis) e as
globais do sistema (tabela `system_formulas`, biblioteca somente
leitura administrada pelo admin - ver `FormulaResource.isSystem`).
Ambas aparecem no mesmo `<select>` do formulário de orçamento, cada
uma com seu próprio `id` real.

O problema estava em `formula.service.ts#getFormulaForCalculation`:
quando o `formulaId` resolvido era de uma fórmula do **sistema**, a
função devolvia `id: null` de propósito - comentário no código dizia
isso era necessário porque `Quote.formulaId` só tem FK pra `formulas`
(tabela da empresa), então gravar o id de uma `system_formula` ali
violaria a constraint. Era uma decisão deliberada documentada, não um
descuido - só que o efeito colateral (perder a escolha específica) não
tinha sido percebido/aceito como problema até agora.

`quote.service.ts` então gravava `Quote.formulaId = null` sempre que a
fórmula usada era do sistema. Na próxima vez que o orçamento era
carregado pra editar, `quote.formulaId` vinha `null`, e o frontend
(`useQuoteForm.ts`) cai de volta pro `defaultFormulaId` - daí a
sensação de "esqueceu a fórmula".

### Fix: coluna nova `Quote.systemFormulaId`, mutuamente exclusiva com `formulaId`

Migração `20260820180000_add_quote_system_formula_id` adiciona
`system_formula_id UUID` em `quotes`, com FK própria pra
`system_formulas` (`onDelete: SetNull`, mesmo padrão de `formulaId`).
Exatamente um dos dois fica preenchido por orçamento (ou nenhum, no
caso raríssimo do fallback hardcoded `SYSTEM_DEFAULT_FORMULA` quando
nem `system_formulas` tem linha nenhuma - bootstrap).

Mudanças em cadeia pra carregar essa informação até o ponto de
persistir:
- `getFormulaForCalculation` agora devolve `isSystem: boolean` junto
  com o resultado, e o `id` de uma fórmula do sistema deixou de ser
  forçado pra `null` - passa a ser o id real da linha em
  `system_formulas`.
- `AggregateCalculationResult.formula`/`CalculationFormulaInput.formula`
  (`CalculationService.ts`) ganharam o mesmo campo `isSystem`, só
  repassando o valor adiante.
- `quote.service.ts#create`/`update`: `formulaId`/`systemFormulaId`
  gravados como um par mutuamente exclusivo baseado em
  `result.formula.isSystem` (nunca os dois preenchidos ao mesmo
  tempo).
- `update()` também ganhou um fallback que faltava: ao recalcular por
  causa de outro campo (`items`/horas) sem reenviar `formulaId`
  explicitamente, a fórmula ativa agora resolve pra
  `existing.formulaId ?? existing.systemFormulaId` (antes só olhava
  `existing.formulaId`, perdendo a fórmula do sistema numa edição
  parcial via API mesmo sem esse ser o caminho que o frontend atual
  usa - o formulário sempre reenvia `formulaId` no save completo).
- `toQuoteResource`/`toQuoteListItem`: `formulaId`/`formulaName` agora
  resolvem por `quote.formulaId ?? quote.systemFormulaId` e
  `quote.formula?.name ?? quote.systemFormula?.name`, então o
  `<select>` do frontend recebe o id certo pra pré-selecionar,
  qualquer que seja a origem. Nenhuma mudança necessária no frontend -
  o `<select>` já era controlado corretamente por `form.formulaId`,
  só recebia o valor errado (sempre `null`) vindo do backend.
- `quote-pdf.service.ts`: o mesmo problema afetava o texto "Fórmula
  aplicada" no PDF - sempre mostrava o texto genérico de fallback em
  vez do nome real da fórmula do sistema escolhida (relevante quando
  existe mais de uma fórmula na biblioteca). Corrigido junto,
  incluindo `systemFormula` no include e usando o mesmo fallback
  encadeado.

### Verificação

Teste de regressão novo em `system-formula.routes.test.ts` (describe
"Quote formulaId persistence across a system formula"): cria uma
fórmula do sistema não-padrão, cria um orçamento explicitamente com
ela, recarrega e confirma que `formulaId`/`formulaName` continuam
apontando pra ela (não pro padrão); em seguida faz um PATCH que força
recálculo (`paintingHours`) sem reenviar `formulaId`, confirma que a
escolha sobrevive - exercita exatamente o fallback que faltava em
`update()`. Suíte completa: 128/128 (16 arquivos + o teste novo, 2
lotes de 8). `tsc --noEmit`, `lint` e `build` limpos.

Verificado ao vivo na UI de verdade (não só via API): logado como
admin, criei uma fórmula alternativa em `/admin/system-formulas`,
criei um orçamento em `/dashboard/quotes/new` selecionando
explicitamente essa fórmula no dropdown, salvei, abri a listagem,
cliquei "Editar" - o dropdown de fórmula reabriu já com "Formula
Alternativa Verificacao" selecionada, não a padrão. Dados de teste
apagados depois (empresa, usuário, máquina, material, fórmula do
sistema).

## 2026-08-21 - Taxa de cartão opcional por orçamento ("Pagamento Cartão")

Pedido: a taxa de cartão deixar de ser sempre embutida no preço e virar
condicional a um campo novo no orçamento - um checkbox "Pagamento
Cartão" logo abaixo do bloco de valor acumulado; quando marcado, soma
a taxa configurada em Configurações por cima do preço, mostrando uma
linha nova "Taxa Cartão" acima de "Valor salvo" com o valor real
acrescido.

### Achado antes de implementar: a taxa de cartão já era aplicada sempre, escondida dentro da fórmula

`taxas_percentuais` (variável disponível pra qualquer fórmula,
inclusive a padrão do sistema) já somava `taxa_cartao + taxa_administrativa`,
e a fórmula padrão do sistema já multiplica o preço por
`(1 + taxas_percentuais + margem_lucro)` - ou seja, a taxa de cartão
**já entrava automaticamente em todo orçamento**, sem opção de
desligar. Pra atender o pedido, isso teve que mudar de verdade, não só
adicionar uma soma por cima: `taxas_percentuais` passou a ser só
`taxa_administrativa` (a taxa administrativa continua sempre embutida,
sem checkbox - só a de cartão virou opt-in). `taxa_cartao` continua
disponível como variável isolada pra quem quiser referenciá-la direto
numa fórmula customizada, fora do mecanismo do checkbox.

### `Quote.cardPayment` + `Quote.cardFeeAmount` (snapshot, não recalculado)

Migração `20260821140000_add_quote_card_payment` adiciona as duas
colunas. `cardFeeAmount` é o valor em dinheiro real (não estimativa)
que o checkbox acrescentou - grava um snapshot no momento do
save, igual já acontecia com `appliedCardFeePercent` por item; não
recalcula sozinho se a taxa mudar depois em Configurações.

`calculateAggregate` (`CalculationService.ts`) agora separa em duas
etapas: primeiro a fórmula calcula `formulaPrice` normalmente (sem
taxa de cartão), depois - só se `cardPayment` for true -
`cardFeeAmount = formulaPrice * taxa_cartao` é somado por cima,
virando o `finalPrice` definitivo. Se a taxa estiver zerada,
`cardFeeAmount` é matematicamente zero de qualquer forma, marcado ou
não - não precisou de tratamento especial pra isso.

### Threaded por 3 caminhos de cálculo diferentes

`cardPayment` precisou entrar em `QuoteCalculationInput`
(create/update/preview de orçamento), `CalculationRequest`
(calculadora standalone em `/dashboard/calculator` e
`POST /api/calculate`) e a nova flag `isSystem` que já tinha sido
adicionada ao resultado da fórmula (rodada anterior). A calculadora
standalone também ganhou o mesmo checkbox - sem isso, ela ficaria
mostrando "Taxa de cartão: R$ 0,00" fixo pra sempre (regressão
silenciosa que só percebi revisando quem mais lia `cardFeeAmount` do
breakdown antes de considerar a mudança concluída).

### Verificação

Testes existentes em `CalculationService.test.ts` recalculados à mão e
re-pinados (a fórmula padrão do sistema agora produz um preço menor
com as mesmas configurações de teste, já que a taxa de cartão de 5%
saiu do meio do cálculo) - confirmados rodando a suíte, não só
recalculados no papel. Teste novo dedicado,
`quote-card-payment.routes.test.ts`: não soma taxa quando o campo não
é enviado; soma o valor certo quando marcado (comparado contra um
orçamento gêmeo sem a marcação); não aumenta quando a taxa configurada
é 0%; sobrevive a uma edição que recalcula por outro motivo
(`paintingHours`) sem reenviar `cardPayment`; remove a taxa quando
desmarcado explicitamente. Suíte completa: 133/133 (17 arquivos, 2
lotes de 8/9). `tsc`/`lint`/`build` limpos em shared/backend/frontend.

Verificado ao vivo na UI: criei orçamento com taxa de cartão 5%
configurada, sem marcar o checkbox (R$ 15,42), marquei "Pagamento
Cartão" - valor acumulado subiu pra R$ 16,19 e apareceu a linha "Taxa
Cartão: R$ 0,77" (5% de 15,42) acima de "Valor salvo", exatamente como
pedido. Salvei, reabri pra editar - checkbox e linha continuaram lá,
`Valor salvo` batendo com o total gravado. Testado também
`POST /api/calculate` (calculadora) direto por API, mesmo resultado
(R$ 15,42 sem a marcação, R$ 16,19 com). Dados de teste apagados
depois (duas empresas de teste).

## 2026-08-22 - Cupons de desconto para assinaturas

Pedido: cupons de desconto pra assinatura - tela admin com código,
percentual e status (ativo/inativo); quem assinar com um cupom paga o
valor com desconto, e esse desconto continua valendo em todas as
cobranças seguintes da assinatura.

### Como a recorrência "roda sempre com o valor descontado" - sem nenhum código novo pra isso

Achado-chave, antes de implementar: o checkout de assinatura (Checkout
Asaas, `chargeTypes: RECURRENT`) já manda um `value` fixo por item
(`asaas.service.ts#createSubscriptionCheckout`) - o Asaas cria uma
assinatura de verdade com esse valor e cobra o **mesmo valor fixo**
em todo ciclo futuro, sozinho, sem o backend precisar reenviar nada a
cada renovação (é assim que já funciona hoje pra qualquer plano, com
ou sem cupom). Ou seja: a exigência "a recorrência vai rolar sempre
com este valor aplicado" já é satisfeita de graça, só bastando calcular
o `value` com desconto **uma única vez**, no momento do checkout, em
vez do preço cheio do plano. Nenhuma lógica de "reaplicar cupom todo
mês" foi necessária - seria reinventar o que o Asaas já faz.

### Coluna nova em `Checkout`/`Company`, não em `Payment`

`Coupon` (código, `discountPercent`, `isActive`) é uma tabela nova e
simples, só isso. `Checkout.couponId` grava qual cupom (se algum) foi
usado ao criar aquele checkout específico. `Company.couponId` só é
setado quando o webhook confirma o **primeiro pagamento** daquele
checkout (mesmo momento em que `Company.planId` também é commitado,
em `webhook.controller.ts`) - é só pra exibição (mostrar "Cupom
PROMO20 aplicado: -20%" na tela de billing), nunca entra em nenhum
cálculo daí pra frente. Qualquer novo checkout (trocar de plano,
reassinar) substitui ou limpa esse valor automaticamente, do mesmo
jeito que já acontecia com `planId`. `applyPlan`/`updateSubscription`
(plano grátis, cancelamento, override de admin) sempre limpam
`couponId` - nenhum desses caminhos passa pelo checkout com cupom, um
cupom de uma assinatura paga anterior não deveria sobrar depois de
cancelar ou um admin trocar o plano manualmente.

### `GET /billing/coupons/:code`: preview sem gravar nada, revalidado de verdade no checkout

Pra mostrar o desconto pro usuário antes de clicar "Assinar" (preço
riscado + preço com desconto nos cards de plano), criei um endpoint de
preview que só lê o cupom e devolve o percentual - não cria `Checkout`,
não toca no banco além do `SELECT`. O `POST /billing/checkout` sempre
revalida o código de novo do zero (não confia no preview) - um cupom
pode ter sido desativado nos segundos entre o preview e o clique real
em "Assinar".

### Admin: `/admin/coupons`, mesmo padrão de `/admin/plans`

Tela nova espelhando a estrutura de `/admin/plans` (tabela + modal de
criar/editar), só com os 3 campos pedidos (código, percentual, status)
mais um contador de "em uso" (`_count` de `Company` com aquele
`couponId` - útil pro admin saber se um cupom já tem gente assinada
antes de mexer nele, mesmo não tendo sido pedido explicitamente).
Coupon não tem endpoint de exclusão de propósito - mesmo raciocínio já
usado em Plan/SystemFormula: desativar em vez de apagar, evita quebrar
o histórico de quem já usou.

### Verificação

Testes novos em `coupon.routes.test.ts` (11 testes): CRUD admin
(criar/listar/editar, código duplicado rejeitado mesmo com case
diferente), preview do cupom (válido, inativo, inexistente), checkout
com cupom (`asaasClient.createCheckout` mockado via `vi.spyOn` - sem
chamada de rede de verdade - confirma que o `value` enviado é o preço
do plano já com desconto aplicado, e que o `Checkout.couponId` é
gravado), checkout sem cupom cobra o preço cheio, código inválido é
rejeitado **antes** de chamar o Asaas, e o fluxo completo via webhook
(checkout com cupom → webhook confirma → `Company.couponId` aparece em
`GET /billing`; cancelar a assinatura limpa esse campo de novo). Suíte
completa: 144/144 (18 arquivos, 2 lotes de 9). `tsc`/`lint`/`build`
limpos em shared/backend/frontend.

Verificado ao vivo na UI: criei um cupom de 15% em `/admin/coupons`
pela tela de verdade, apliquei no campo de cupom em
`/dashboard/billing` - apareceu "Cupom VERIFICACAO15 aplicado: -15%" e
os cards de plano passaram a mostrar o preço riscado ao lado do preço
com desconto (Pro: R$ 49,90 → R$ 42,42; Enterprise: R$ 199,90 →
R$ 169,92, ambos batendo com a conta manual). Cliquei "Assinar" - a
chamada chegou até o Asaas sandbox com o payload certo (confirmado no
log do backend), mas o Asaas rejeitou por causa de
`successUrl`/`cancelUrl`/`expiredUrl` apontarem pra `localhost` (URL de
callback pública é exigida) - **limitação de ambiente de dev local, não
um bug do cupom**, documentada em `Contextos/Conhecimento.md`; o mesmo
aconteceria clicando "Assinar" em qualquer plano, com ou sem cupom.
Dados de teste apagados depois (empresa, usuário, cupom criado na
verificação - os cupons gerados pelos testes automatizados continuam
no banco de dev, como já é padrão nesta sessão).

## 2026-08-22 (mesmo dia) - Dois tipos de cupom: recorrente e uso único (só primeiro mês)

Pergunta do Yuri, logo depois da rodada de cupons acima: dava pra ter
um cupom que só desconta no primeiro mês, voltando pro preço cheio
depois? Respondi que sim, com o trade-off de precisar de uma chamada
extra ao Asaas (explicado antes de implementar) - ele confirmou e
implementei.

### O mecanismo "de graça" do cupom recorrente não serve pra isso - precisa reverter o valor depois

Cupom recorrente funciona sem nenhum código extra porque o valor
mandado na criação da assinatura no Asaas vira o valor fixo cobrado
pra sempre (ver entrada anterior). Pra "só primeiro mês", esse mesmo
mecanismo já cobra certo a PRIMEIRA cobrança (criada com o valor
descontado), mas cobraria esse mesmo valor descontado pra sempre se eu
não fizesse nada a mais - não existe um "desconto de uma cobrança só"
nativo no Checkout Asaas pra esse fluxo. A solução: assim que o
webhook confirma essa primeira cobrança, chamar
`PUT /v3/subscriptions/{id}` (novo `asaasClient.updateSubscriptionValue`)
pra atualizar o valor da assinatura de volta pro preço cheio do plano -
como o Asaas só gera a cobrança do próximo ciclo depois que a atual
liquida (mesmo comportamento já documentado no job de
`subscription-expiring`), essa atualização acontece a tempo de valer
pra segunda cobrança em diante.

### `Coupon.type` (`RECURRING` | `ONE_TIME`), reversão é best-effort mas logada como erro, não aviso

`type` novo no cupom, default `RECURRING` (mantém o comportamento
anterior pra quem não escolher). A chamada de reversão
(`asaas.service.ts#revertSubscriptionToFullPrice`) segue o mesmo
padrão *best-effort* de `cancelSubscription` (nunca lança, o webhook
sempre confirma 2xx pro Asaas independente do resultado) - mas com uma
diferença deliberada: `logger.error` em vez de `logger.warn`. Falhar
aqui não é um detalhe cosmético como "assinatura já tinha sido
cancelada direto no painel" - é a empresa continuando a pagar o valor
com desconto pra sempre por engano, um vazamento de receita de
verdade. Ainda não existe alerta automático pra esse log (só fica no
stdout do backend) - registrado como pendência em `Notas/TODO.md`.

A reversão roda dentro do mesmo bloco de "primeira ativação" que já
existia (`isFirstActivation && checkout`), então herda de graça a
mesma garantia de idempotência: reentrega do mesmo webhook ou uma
renovação de rotina depois não disparam a chamada de novo (o checkout
já não está mais `PENDING` na segunda vez).

### Verificação

4 testes novos em `coupon.routes.test.ts` (total do arquivo: 15):
cupom `ONE_TIME` dispara a chamada de reversão com o subscriptionId e
o preço cheio certos assim que o webhook confirma; uma renovação de
rotina da mesma assinatura não dispara de novo; se a chamada de
reversão falhar (mockada rejeitando), o webhook ainda confirma 200 e a
empresa ainda é ativada normalmente (a falha nunca bloqueia nada);
cupom `RECURRING` nunca chama a reversão. Suíte completa: 148/148 (18
arquivos, 2 lotes). `tsc`/`lint`/`build` limpos em
shared/backend/frontend.

Verificado ao vivo: criei um cupom `ONE_TIME` de 10% via API, apliquei
em `/dashboard/billing` - a UI mostrou "Cupom VERUNICO10 aplicado:
-10%" com a nota "Desconto válido só na primeira cobrança..."
logo abaixo, e os cards de plano mostraram tanto o preço com desconto
quanto uma segunda linha "Depois volta para R$ 49,90/mes" /
"R$ 199,90/mes" (batendo com o preço cheio de cada plano). Tela
`/admin/coupons` mostrando a coluna "Tipo" nova, com "Uso único (1º
mês)" e "Recorrente (sempre)" corretos pros cupons de teste e pros já
existentes do banco de dev. Não repeti o clique em "Assinar" até o
fim - já sabia, da verificação anterior no mesmo dia, que isso esbarra
na limitação de `localhost` no Asaas, não relacionada a este tipo de
cupom. Dados de teste apagados depois.

## 2026-08-22 (mesmo dia) - Alerta por e-mail quando a reversão de preço do cupom `ONE_TIME` falha

Seguimento direto da entrada anterior: o Yuri pediu um e-mail pro admin
quando `revertSubscriptionToFullPrice` falhar, indicando o cliente, o
valor que precisa ser corrigido no Asaas, e o caminho no painel se
possível - o item que já estava registrado como pendência no
`Notas/TODO.md`.

### Pra quem manda: todo admin ativo, não um endereço fixo

Não existe nenhuma configuração de "e-mail do admin"/"e-mail de
operações" neste sistema. Em vez de inventar uma variável de ambiente
nova só pra isso, `emailService.sendCouponRevertFailed` busca
`prisma.user.findMany({ where: { role: "ADMIN", isActive: true } })`
e manda pra cada um via `Promise.all` - garante que todo admin ativo
saiba, não só quem estiver de plantão numa caixa fixa. Cada envio tem
seu próprio `dedupeKey` (`COUPON_REVERT_FAILED:{paymentId}:
{admin.email}`) pra nenhum admin ser notificado duas vezes se o mesmo
evento for reprocessado, mas todos ainda serem alcançados.

Achado ao implementar (não é bug novo, é acúmulo de dados de teste):
o banco de dev tem **902 usuários `ADMIN` ativos** hoje, resultado de
`promoteToAdmin()` chamado em vários testes desta sessão inteira sem
nenhuma limpeza depois. Isso não travou nada (suíte inteira ainda roda
em segundos), mas é a primeira feature que realmente *age* sobre "todo
admin" em escala - registrado em `Contextos/Conhecimento.md`. Não apaguei
esses registros (decisão de mexer em massa no banco de dev é do Yuri,
fora do que foi pedido aqui).

### `revertSubscriptionToFullPrice` virou parâmetro objeto

Precisava de mais contexto (nome da empresa, código do cupom, id do
`Payment`) só pra montar o e-mail, sem mudar a lógica de reversão em
si - trocar os 2 parâmetros posicionais por um objeto único evita uma
assinatura de 5 argumentos posicionais confusa. O client de baixo
nível (`asaasClient.updateSubscriptionValue`) manteve a assinatura
original, só o método de serviço mudou.

### Template só em pt-BR (quebra deliberada do padrão bilíngue)

Todo template de e-mail até hoje tinha sempre um par pt-BR/en. Este é
o primeiro só pt-BR - decisão deliberada, não esquecimento: é um alerta
interno de operação, não algo que um cliente final vê, e "painel Admin
fica só em português" já é convenção documentada no projeto (ver
entrada de 2026-08-17 acima). Conferido que a tela
`/admin/email-templates` não assume estruturalmente que todo `key` tem
as duas linhas (é só uma lista plana com badge PT/EN por linha) - não
quebra nada.

### Link do painel Asaas: melhor esforço, não um deep-link confirmado

`subscriptionsUrl` aponta pra lista de assinaturas
(`asaas.com/subscriptions` ou `sandbox.asaas.com/subscriptions`
conforme `ASAAS_ENV`), não pro registro específico - não existe
confirmação do formato exato de deep-link pra uma assinatura
individual no Asaas, e apresentar um link não verificado como se fosse
preciso, num alerta financeiro real, seria pior que não ter link
nenhum. O e-mail instrui explicitamente a pesquisar pelo
`asaasSubscriptionId` (mostrado na própria mensagem) depois de abrir a
tela. Comentário no código deixa essa limitação explícita.

### Verificação

2 testes em `coupon.routes.test.ts` (mesmo arquivo da entrada
anterior, total continua 15): o caminho de sucesso confirma que
nenhum alerta é disparado; o caminho de falha (reversão mockada
rejeitando) confirma que o alerta é chamado exatamente uma vez com os
dados certos (empresa, cupom, id da assinatura, preço cheio, mensagem
de erro) e que chega em um segundo admin não relacionado ao teste -
usando `toEmail` específico do teste em vez de `dedupeKey`/"últimas
linhas", justamente por causa do achado dos 902 admins acima (ver
`Contextos/Conhecimento.md`).

Suíte completa: 148/148 (18 arquivos) - mas desta vez precisou ser
dividida em lotes menores de 4-5 arquivos (em vez dos lotes de 9 que
vinham funcionando) pra evitar o crash nativo do Vitest no Windows já
documentado nesta sessão; registrado em `Contextos/Conhecimento.md`
como achado à parte, ainda não confirmado se é causado pela carga
extra do fan-out de e-mail ou só variação normal do problema
pré-existente. `tsc`/`lint`/`build` limpos em shared/backend.

Verificado ao vivo: usei a função já existente "Testar e-mail" da
tela `/admin/email-templates` (em vez de forçar uma falha real do
Asaas) e conferi o `EmailLog.bodyHtml` gravado - cabeçalho vermelho,
as 6 variáveis substituídas corretamente com os dados de exemplo,
botão "Abrir assinaturas no Asaas" e rodapé corretos. Dados de teste
apagados depois.

Migração nova precisa ser aplicada em produção
(`20260822200000_add_coupon_revert_failed_template`).

## 2026-08-22 (mesmo dia) - Ocultar exportação de PDF e campos de perfil para o plano Free

O Yuri pediu pra esconder o botão de exportar PDF e os campos de
perfil usados só pelo PDF (CNPJ/telefone/endereço/termos
customizados) de quem está no plano Free - já que
`billing.service.ts#ensureFeature("PDF_EXPORT")` já bloqueia a
chamada no backend (`requirePlanFeature("PDF_EXPORT")` em
`quote.routes.ts`), mas a UI continuava mostrando os dois pra todo
mundo, resultando num botão que sempre falhava com 403 pra quem
estava no Free.

### Fonte da verdade: a entitlement do plano, não o código do plano

Cogitei checar `company.planCode === "FREE"` direto no frontend, mas
isso ficaria dessincronizado do que o backend realmente aplica -
`Plan.features` é editável pelo admin em `/admin/plans` (JSONB, sem
migração pra mudar), e outros planos sem custo (ex. o Cortesia, ver
entrada de 2026-08-20) têm `pdfExport: true` mesmo não sendo "Free".
Em vez disso, `AuthCompany.pdfExport` (novo campo em `shared/src/
index.ts`) é populado em `auth.service.ts#toAuthUser` a partir da
mesma função `toEntitlements()` que `plan.service.ts` já usa pra
calcular a entitlement de verdade (exportada de lá pra reuso) - o
frontend só lê esse boolean, nunca reimplementa a regra. Efeito
colateral aceito: como `AuthUser` vem no JWT/sessão, uma mudança de
plano só reflete na UI no próximo login/refresh de sessão - aceitável
porque isso é só cosmético (esconder um botão que falharia mesmo);
o backend continua sendo a autoridade em toda chamada real.

### Onde foi escondido

- `frontend/src/app/dashboard/quotes/page.tsx` - ícone de download por
  linha na listagem.
- `frontend/src/components/quotes/QuoteSummary.tsx` (usado por
  `QuoteForm.tsx`, tanto criar quanto editar orçamento) - botão
  "Gerar PDF" que aparece depois de salvar, agora só quando
  `canExportPdf` também é `true`.
- `frontend/src/app/dashboard/settings/page.tsx` - bloco inteiro
  "Dados para o PDF de orçamento" (CNPJ/telefone/endereço + os dois
  campos de termos customizados PT/EN) na aba Perfil. Os campos
  continuam existindo no estado do formulário mesmo escondidos (só a
  UI some) - salvar o perfil sem essa seção reenvia os valores já
  carregados sem alterá-los, não apaga nada.

### Verificação

`tsc`/`lint`/`build` limpos em shared/backend/frontend. Suíte
completa do backend: 147/147 (17 arquivos, 4 lotes menores - ver
achado de crash nativo na entrada anterior). Nenhum teste automatizado
novo (mudança é só condicional de renderização no frontend, sem lógica
nova pra testar - o gate de verdade já era testado no backend antes
desta sessão).

Verificado ao vivo, ponta a ponta: criei uma conta nova (plano Free
por padrão), confirmei que a seção de PDF sumiu do Perfil, cadastrei
uma máquina/material e criei um orçamento - nem a listagem nem a tela
de editar mostraram o botão de PDF. Promovi a mesma empresa pro plano
Pro direto no banco (mudança de teste, revertida junto com a limpeza)
e logei de novo - a seção do Perfil e os dois botões de PDF
reapareceram. Conta e dados de teste apagados depois.

## 2026-08-22 (mesmo dia) - Desconto/Acréscimo no orçamento

O Yuri pediu um campo de "Desconto/Acréscimo" no bloco de valor
acumulado (criação/edição de orçamento), logo abaixo de "Pagamento
Cartão": ao escolher um dos dois, um campo de percentual aparece, e
esse percentual é aplicado em cima do valor final do orçamento.

### Onde entra no pipeline de cálculo

Segue exatamente o mesmo padrão de `cardPayment`/`cardFeeAmount`
(entrada de 2026-08-21): aplicado por último, depois de tudo (fórmula
+ taxa de cartão), como um percentual sobre esse valor - não é uma
estimativa de exibição como `administrativeFeeAmount`/`marginAmount`,
é o valor real, com sinal (negativo pra `DISCOUNT`, positivo pra
`SURCHARGE`) já somado em `finalPrice`/`totalAmount`. `Quote.
adjustmentType` (`DISCOUNT`/`SURCHARGE`/nulo - nulo é "Nenhum"),
`adjustmentPercent` (o que o usuário digitou) e `adjustmentAmount`
(snapshot em R$, não recalculado se o orçamento for reaberto sem
mudar nada) - mesmo trio de campos que `cardPayment`/`cardFeeAmount`
já usava, só que com um terceiro estado (nenhum/desconto/acréscimo)
em vez de um boolean.

`calculateAggregate` ganhou `adjustmentType`/`adjustmentPercent`
como parâmetros **opcionais** (default `null`/`0`) - a calculadora
standalone (`calculateQuoteBreakdown`, `/dashboard/calculator`) não
ganhou essa feature nesta rodada (fora do que foi pedido, é uma tela
de cálculo avulso, não de orçamento salvo) e continua chamando a
função sem informar nada, caindo no default de "sem ajuste" de graça.

### PDF: um placeholder de "Descontos" que já existia, sempre R$0,00

Achado ao implementar: o financial summary do PDF
(`quote-pdf.service.ts#drawFinancialSummary`) já tinha uma linha
"Descontos" - mas hardcoded em `formatMoney(0, ...)`, porque não
existia nenhum mecanismo de desconto de verdade até agora. Agora essa
linha usa `quote.adjustmentAmount` de verdade, com o rótulo trocando
pra "Acrescimo"/"Surcharge" quando `adjustmentType === "SURCHARGE"`
(string nova `strings.surcharge`). `subtotal` (a linha de cima) virou
`totalAmount - adjustmentAmount`, já que `totalAmount` gravado já
inclui o ajuste - antes `subtotal` e `total` eram sempre o mesmo
número. O modo SUMMARY do PDF (`drawFinancialSummarySimple`, cliente
não vê o detalhamento) continua mostrando só o total final, sem
mudança de comportamento, só o comentário que citava "não existe
desconto de verdade" foi corrigido por estar desatualizado.

### Verificação

`tsc`/`lint`/`build` limpos em shared/backend/frontend. Suíte
completa do backend: 147/147 (17 arquivos, 5 lotes menores por causa
do crash nativo já documentado - `CalculationService.test.ts`
especificamente rodou limpo em lote próprio, 48/48, sem nenhuma
asserção existente quebrar mesmo com os campos novos no breakdown).
Nenhum teste automatizado novo (as asserções existentes já cobrem
`calculateAggregate` com o comportamento padrão preservado quando
`adjustmentType` não é informado).

Verificado ao vivo, ponta a ponta: criei conta nova, promovida pro
plano Pro (só pra também conferir o PDF), cadastrei máquina/material,
criei orçamento sem ajuste (Valor acumulado R$ 12,27) - selecionei
"Desconto" 10% e o valor caiu pra R$ 11,04 com a linha "Desconto/
Acréscimo aplicado: -R$ 1,23"; troquei pra "Acréscimo" mantendo os
10% e o valor subiu pra R$ 13,50 com "+R$ 1,23" (percentual não reseta
ao trocar de tipo). Salvei com Acréscimo 10%, reabri pra editar - tipo
e percentual persistiram corretos. Gerei o PDF e conferi o conteúdo
real (via download direto da API): "Subtotal R$ 12,27 / Acrescimo
R$ 1,23 / Valor total R$ 13,50", batendo exatamente com o esperado.
Conta e dados de teste apagados depois.

Migração nova precisa ser aplicada em produção
(`20260822210000_add_quote_price_adjustment`).

## 2026-08-22 (mesmo dia) - Ambiente de dev/staging: mesma VPS, Postgres local

O Yuri perguntou como criar um ambiente de dev/staging e se dava pra usar a
mesma VPS de produção ou precisaria contratar uma nova. Expliquei o
trade-off (mesma VPS é mais barato e simples, mas compartilha blast radius
de incidente; VPS separada isola de verdade mas custa mais e é mais um
servidor pra manter) e recomendei mesma VPS, dado o tamanho atual do
projeto - ele confirmou.

### Por que mesma VPS

2 vCPU / 4 GB RAM tem folga pra um segundo stack pequeno (backend + frontend
Node + Postgres leve). O motivo real pra existir esse ambiente não é
performance, é ter um domínio HTTPS de verdade pra testar o que dev local
não consegue - o Asaas rejeita `successUrl`/`cancelUrl`/`expiredUrl` que não
sejam `https://` (limitação já documentada em `Contextos/Ambientes.md`),
então o clique real em "Assinar" até a página hospedada do Asaas nunca pôde
ser testado localmente, só via chamada de API direta.

### Por que Postgres local em Docker, não um segundo Supabase

Pergunta feita ao Yuri (`AskUserQuestion`) antes de desenhar o resto:
Postgres local (container Docker, zero custo, zero dependência de rede,
fácil resetar) vs. segundo projeto Supabase (free tier, mesmo motor/versão
de produção, mas mais uma conta pra gerenciar e o free tier pausa após uma
semana sem uso). Escolhido Postgres local.

### Isolamento (o que evita misturar dev com produção)

- **Pasta separada na VPS** (clone irmão do de produção, não a mesma pasta
  com flags diferentes) - o nome do diretório vira o "project name" do
  Docker Compose automaticamente, então networks/volumes nunca colidem sem
  precisar de `-p` manual.
- **Subdomínio próprio** (`dev.pricify3d.com`) e **portas de host
  diferentes** (`3011`/`3010`/`5433` em vez de `3001`/`3000`), tudo
  amarrado a `127.0.0.1` - mesmo padrão de segurança que produção já usa
  (nunca exposto direto pra internet, `ufw` não precisa mudar).
- **Segredos sempre diferentes**: `JWT_SECRET`, `ASAAS_WEBHOOK_TOKEN`,
  `POSTGRES_PASSWORD` gerados do zero pra esse ambiente - nunca copiados do
  `.env` de produção.
- **`ASAAS_ENV=sandbox` sempre** nesse ambiente (nunca a chave de
  produção) - é justamente isso que resolve a limitação do checkout.
- **`RESEND_API_KEY` em branco por padrão** no `.env.dev.example` - sem
  chave, `resend-client.ts` já loga e não manda nada (mesmo comportamento
  do dev local hoje), evitando disparar e-mail de teste real sem querer.
  Pode preencher se quiser testar envio de verdade a partir de lá.

### Arquivos novos (mesmo padrão dos equivalentes de produção)

`docker-compose.dev.yml` (raiz) - igual ao `docker-compose.yml` de
produção, com um serviço `postgres` a mais (Postgres 16, volume nomeado)
em vez de apontar pro Supabase. `.env.dev.example` (raiz) - mesmo formato
do `.env.example` de produção, com `POSTGRES_PASSWORD` no lugar de uma
`DATABASE_URL` externa. `deploy/nginx-dev.conf.example` - cópia do
`deploy/nginx.conf.example` com o hostname/portas trocados. Nenhum arquivo
de produção foi tocado.

### Verificação

`npx js-yaml docker-compose.dev.yml` validado sintaticamente (mesma técnica
já usada pro compose de produção em 2026-08-13 - Docker não está disponível
neste ambiente de dev pra testar `docker compose config`/`up` de verdade).
O runbook em si (DNS, clone na VPS, `docker compose up`, Nginx, Certbot)
**ainda não foi executado** - só o desenho e os arquivos-base ficaram
prontos nesta sessão; a execução na VPS depende do Yuri (acesso SSH, DNS,
decisão de quando fazer). Ver `Contextos/Ambientes.md` ("Ambiente de
dev/staging") pro runbook completo e `Notas/TODO.md` pro item de
acompanhamento.

## 2026-08-24 - Bug real no ambiente de dev: RESEND_API_KEY obrigatória mesmo em sandbox

O Yuri começou a executar o runbook de dev/staging (entrada de 2026-08-22
acima) na VPS. Clone via SSH funcionou de primeira (a produção já usa
`git@github.com:...` nesse mesmo usuário, então a chave já existente
autenticou o clone novo sem nenhuma configuração extra). Postgres e
frontend subiram certos; o backend entrou em crash loop.

### Causa

`docker-compose.dev.yml` seta `NODE_ENV=production` de propósito (mesmo
raciocínio de produção: `auth.controller.ts` só marca o cookie de refresh
como `secure` quando `NODE_ENV=production`, e `error-handler.ts`/
`health.service.ts` só escondem detalhe de erro/health nesse modo -
comportamento correto pra um domínio HTTPS público de verdade, que é
exatamente o caso do `dev.pricify3d.com`). Só que
`resolveResendApiKey()` em `backend/src/config/env.ts` trava o boot sem
`RESEND_API_KEY` sempre que `NODE_ENV=production` - **sem olhar pro
`ASAAS_ENV`**. A orientação original de deixar essa variável em branco no
`.env.dev` (pra não mandar e-mail de teste real por engano) estava errada
- não é uma opção nesse ambiente, é obrigatória.

Considerei mudar `NODE_ENV` do stack de dev pra algo diferente de
`production` só pra contornar essa checagem, mas isso teria efeito
colateral real: desligaria `secure` no cookie de refresh e deixaria
erro/health mais verbosos num domínio HTTPS público de verdade -
regressão de segurança pior que o problema que resolveria. Correção
certa: `RESEND_API_KEY` é obrigatória mesmo em dev, ponto - reusar a
mesma chave de produção (o Resend não tem modo sandbox, não existe uma
chave "de teste" separada; quem testa cadastro/reset de senha nesse
ambiente é o próprio Yuri, não um cliente real).

### Correção

`.env.dev.example`, `Contextos/Ambientes.md` e o runbook publicado (ver
`Notas/TODO.md`) atualizados pra marcar `RESEND_API_KEY` como
obrigatória, com a explicação do porquê. Nenhuma mudança de código - é
um ajuste de documentação/orientação, o comportamento do backend
(`env.ts`) está correto como está.

## 2026-08-24 - BUG CRÍTICO: webhook do Asaas nunca ativava o primeiro pagamento de verdade

Achado testando o checkout de ponta a ponta pela primeira vez de verdade
(exatamente o que o ambiente de dev existe pra viabilizar - ver entrada de
2026-08-22 acima): pagamento confirmado no sandbox do Asaas, mas o plano
continuava Free mesmo depois de recarregar/relogar.

### Causa raiz

`webhook.controller.ts` correlacionava o **primeiro** pagamento de uma
assinatura nova (antes de `Company.asaasSubscriptionId` existir) usando
`payment.externalReference`, comparado contra `Checkout.id` - baseado na
suposição de que o `externalReference` mandado na criação do checkout
(`asaas.service.ts`, `externalReference: input.checkoutId`) voltaria
no payload do pagamento gerado. **Essa suposição está errada**: confirmado
contra um pagamento real do sandbox, o Checkout Asaas nunca propaga
`externalReference` pro pagamento individual - vem sempre `null`. O
payload real trouxe, em vez disso, `checkoutSession` (o id da sessão de
Checkout do próprio Asaas) e `subscription` (o id da assinatura). Como
`payment.externalReference` era sempre `null`, o bloco de correlação
inteiro nunca executava, `company` ficava `null`, e o handler só logava
"no matching company for this payment" e confirmava 200 sem ativar nada -
silenciosamente, sem nenhum erro visível pro usuário nem pro Asaas.

**Isso nunca foi pego antes porque o único teste de ponta a ponta contra
o sandbox real usado nesta sessão testava só a criação do checkout e o
redirecionamento (nunca completou um pagamento de verdade - o
`localhost` não aceita `successUrl` não-`https`, ver limitação já
documentada), e os testes automatizados simulavam o webhook manualmente
com `externalReference: checkoutId` - reproduzindo a suposição errada do
próprio código em vez de validar contra o formato real do Asaas.** O
ambiente de dev com HTTPS de verdade (2026-08-22/24) é o que finalmente
permitiu um pagamento real de ponta a ponta e expôs isso.

**Impacto em produção**: como essa é a mesma lógica que roda em
produção, é bem provável que **todo primeiro pagamento de assinatura
paga em produção até hoje tenha caído no mesmo silêncio** - o cliente
paga de verdade no Asaas, mas o plano nunca vira `ACTIVE` no sistema.
Renovações (segundo pagamento em diante) não são afetadas - essas usam
`payment.subscription` contra `Company.asaasSubscriptionId`, que só
existe depois que a primeira ativação funciona, então esse caminho nunca
foi exercitado organicamente até agora. **Recomendo ao Yuri auditar
produção**: qualquer `Company` com `subscriptionStatus = ACTIVE` hoje
provavelmente foi ativada manualmente (ex. via `/admin/users`, como o
plano Cortesia), não pelo fluxo de pagamento real - vale checar
`Payment`/`Checkout` órfãos (pagamento `CONFIRMED` sem `Company`
correspondente ativada) direto no Supabase de produção.

### Correção

`webhook.controller.ts`: correlação do primeiro pagamento agora usa
`payment.checkoutSession` contra `Checkout.asaasCheckoutId` (já existia,
gravado na criação do checkout - `billing.controller.ts`) em vez de
`payment.externalReference` contra `Checkout.id`. `webhook.validator.ts`
ganhou o campo `checkoutSession` no schema (com `.passthrough()` o dado
já chegava, só não estava tipado). O envio de `externalReference` na
criação do checkout (`asaas.service.ts`) foi mantido - inofensivo, só
deixou de ser útil pra correlação.

Os 6 testes em `coupon.routes.test.ts` que simulavam o webhook com
`externalReference: checkoutId` foram todos corrigidos pra capturar o
`id` mockado de `createCheckout` numa variável e simular
`checkoutSession` com esse valor - reproduzindo o payload real do Asaas
em vez da suposição antiga.

### Verificação

`tsc`/lint limpos. Suíte completa: 147/147 (17 arquivos, 4 lotes).
Verificado ao vivo no ambiente de dev: log de diagnóstico temporário
(depois revertido pro formato definitivo) confirmou `externalReference:
null` / `checkoutSession: "d6a5b5de-..."` num pagamento real do sandbox -
exatamente a causa. Falta confirmar com um novo teste de assinatura
completo no dev, agora com a correção aplicada, que o plano ativa de
verdade - e decidir com o Yuri quando aplicar essa mesma correção em
produção (urgente, dado o impacto).

## 2026-08-24 (mesmo dia) - Prefixo "[DESENVOLVIMENTO]" no assunto dos e-mails do ambiente de dev

O Yuri pediu pra todo e-mail enviado pelo ambiente de dev sair com
`[DESENVOLVIMENTO]` antes do assunto - pra nunca confundir um e-mail de
teste com um real na caixa de entrada (mais relevante ainda depois da
decisão de reusar a mesma `RESEND_API_KEY` de produção nesse ambiente,
ver entrada de 2026-08-24 acima sobre `RESEND_API_KEY`).

### Por que uma variável de ambiente, não uma checagem de `NODE_ENV`

`NODE_ENV` já é `production` nos dois ambientes de propósito (cookies
seguros, erro/health discretos - ver decisão do `RESEND_API_KEY`
obrigatório), então não dá pra usá-lo aqui pra diferenciar dev de
produção. Nova variável opcional `EMAIL_SUBJECT_PREFIX` (`env.ts`) -
vazia por padrão (produção nunca define), `docker-compose.dev.yml`
passa `"[DESENVOLVIMENTO]"` via `.env.dev.example`. Aplicado num único
lugar (`email.service.ts#send`, logo após renderizar o assunto do
template) - todo envio passa por ali, incluindo `sendTest()`
("Testar e-mail" no admin), então nada precisa saber sobre o prefixo
individualmente. `EmailLog.subject` grava o assunto já com o prefixo
(reflete o que foi realmente enviado).

### Verificação

`tsc`/lint limpos. Suíte de e-mail (22 testes) passou sem alteração -
ambiente de teste não define `EMAIL_SUBJECT_PREFIX`, então o
comportamento observado é idêntico a antes (confirma que produção não é
afetada por padrão). Falta o Yuri fazer o deploy no ambiente de dev e
conferir um e-mail de teste chegando com o prefixo.
