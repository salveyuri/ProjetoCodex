# syntax=docker/dockerfile:1
#
# Build context MUST be the repo root (3d-budget-saas/), not backend/,
# because this is an npm-workspaces monorepo — @3d-budget/backend depends
# on @3d-budget/shared via "file:../shared", and npm needs to see the root
# package.json + package-lock.json to resolve the workspace correctly.
#
#   docker build -f backend/Dockerfile -t 3d-budget-backend .
#
# (docker-compose.yml at the repo root already sets this up.)
#
# Uses node:20-slim (Debian glibc), not an Alpine base — avoids Prisma's
# musl-vs-glibc native query engine binary mismatches. `prisma generate`
# runs during the Docker build itself (a Linux step, even when the image
# is built from a Windows/Mac host via Docker Desktop), so it correctly
# produces a Linux engine binary automatically; no explicit `binaryTargets`
# needed unless you later cross-build for a different CPU architecture
# (`docker buildx --platform`).

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm needs every workspace's package.json present to resolve the
# workspace graph against package-lock.json, even the ones this image
# doesn't actually run (frontend). --ignore-scripts skips backend's
# "postinstall": "prisma generate" here on purpose — schema.prisma isn't
# copied in yet at this point; the build stage runs `prisma generate`
# explicitly via backend's own build script instead.
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY shared ./shared
COPY backend ./backend
RUN npm run build --workspace @3d-budget/shared
# backend's build script runs: prisma generate && tsc && tsc-alias
RUN npm run build --workspace @3d-budget/backend

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Full node_modules from the build stage, not a pruned subset: with npm
# workspaces, @prisma/client's generated query engine lands in the
# hoisted ROOT node_modules/.prisma, and the `prisma` CLI (a devDependency,
# needed at runtime for `prisma migrate deploy`/`db seed`) needs to be
# reachable too. Node's module resolution walks up from backend/dist/, so
# a single root-level node_modules is enough — no per-package copy needed.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/prisma ./backend/prisma

WORKDIR /app/backend

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
