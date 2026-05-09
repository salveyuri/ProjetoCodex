# CONTEXT.md

## Estado Atual

- Monorepo `3d-budget-saas` inicializado com tres areas principais:
  - `frontend`: aplicacao Next.js com App Router, Tailwind CSS, Lucide React e dashboard em `/dashboard`.
  - `backend`: API Node.js + Express em TypeScript com separacao `app.ts`/`server.ts`.
  - `shared`: pacote TypeScript para contratos comuns entre frontend e backend.
- Backend possui endpoint `GET /api/health` com retorno de status do servidor e latencia de consulta ao PostgreSQL via Prisma.
- Prisma configurado com modelos iniciais `User` e `SystemConfig`.
- Frontend possui `MainLayout` com Header e Sidebar persistentes, alem de card de status que consulta o backend.

## Decisoes de Arquitetura

- A estrutura segue um Modular Monolith em monorepo simples: frontend, backend e contratos compartilhados ficam separados por responsabilidade, mas evoluem juntos.
- O backend usa Service Layer Pattern: controllers lidam com HTTP, services concentram regras de negocio e Prisma fica encapsulado no singleton `src/config/database.ts`.
- O Express foi dividido entre `app.ts` e `server.ts` para facilitar testes unitarios futuros sem subir uma porta real.
- O `shared` foi criado para reduzir divergencia de tipos em payloads comuns, com `HealthCheckResponse` ja compartilhado.
- As dependencias internas usam `file:../shared` para compatibilidade com npm puro no ambiente Windows atual.
- O frontend usa Next.js 16+ com App Router e `src/` para manter compatibilidade com padroes atuais e evitar faixas vulneraveis anteriores.
- O monorepo usa `overrides` para manter `postcss` em faixa segura quando dependencias transitivas puxarem versoes antigas.
- ESLint foi configurado em flat config para acompanhar Next 16 e manter lint consistente entre frontend e backend.
- A paleta visual prioriza uma interface Tech/Nerd Culture operacional: base escura neutra, acentos em ciano, verde terminal e amber para estados de atencao.

## Pendencias (Tech Debt/Next Steps)

- Implementar a estrutura de Budgeting Logic como proxima prioridade:
  - entidades de orcamento, materiais, impressoras e perfis de custo;
  - service de calculo de preco;
  - rotas e validacao de entrada;
  - telas de cadastro e simulacao no dashboard.
- Adicionar validacao com Zod ou biblioteca equivalente nas entradas do backend.
- Criar testes unitarios para services e testes de integracao para rotas Express.
- Configurar migracoes Prisma reais quando o PostgreSQL estiver disponivel.
- Adicionar autenticacao, tenant/account model e RBAC antes de expor recursos SaaS sensiveis.
- Monitorar o aviso moderado do `npm audit --omit=dev` em `next -> postcss`: o projeto usa Next `16.2.6`, que e a versao mais recente consultada, mas ainda empacota `postcss@8.4.31`; o fix automatico sugerido pelo npm faria downgrade inadequado para Next 9.

## Validacao

- `npm install` executado com sucesso e `package-lock.json` gerado.
- `npm run lint` executado com sucesso para `shared`, `backend` e `frontend`.
- `npm run build` executado com sucesso para `shared`, `backend` e `frontend`.
- `GET /api/health` validado: retorna `503 degraded` quando o PostgreSQL local recusa as credenciais de exemplo, mantendo `server.status = online`.
- `/dashboard` validado no navegador local: layout renderiza e o card de API mostra `degradado` com PostgreSQL `sem sinal`.

## Mapa de Dependencias

- `frontend` depende de:
  - `backend` via HTTP em `NEXT_PUBLIC_API_URL` ou no host atual do navegador na porta `3001`.
  - `shared` para tipos TypeScript compartilhados.
- `backend` depende de:
  - PostgreSQL via Prisma usando `DATABASE_URL`.
  - `shared` para contratos de resposta comuns.
- `shared` nao depende de frontend, backend ou banco; ele deve permanecer livre de runtime especifico.

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
- ATUALIZADO: este `CONTEXT.md` com estado, decisoes, pendencias e mapa de dependencias.
