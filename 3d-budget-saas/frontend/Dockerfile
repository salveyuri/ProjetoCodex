# syntax=docker/dockerfile:1
#
# Build context MUST be the repo root (3d-budget-saas/), not frontend/,
# because this is an npm-workspaces monorepo — @3d-budget/frontend depends
# on @3d-budget/shared via "file:../shared", and npm needs to see the root
# package.json + package-lock.json to resolve the workspace correctly.
#
#   docker build -f frontend/Dockerfile -t 3d-budget-frontend .
#
# (docker-compose.yml at the repo root already sets this up.)

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm needs every workspace's package.json present to resolve the
# workspace graph against package-lock.json, even the ones this image
# doesn't actually run (backend). --ignore-scripts skips backend's
# "postinstall": "prisma generate" — irrelevant here, but keeps this
# stage's behavior identical/predictable between both Dockerfiles.
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
COPY shared ./shared
COPY frontend ./frontend
RUN npm run build --workspace @3d-budget/shared

# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time,
# not read at container startup — must be passed as a build arg (see
# docker-compose.yml's `build.args`), not just a runtime `environment:`.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace @3d-budget/frontend

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Next's `output: "standalone"` traces only the files actually needed at
# runtime — but in an npm-workspaces monorepo it mirrors the layout from
# the detected workspace root (this repo's package-lock.json), so the
# server entry point ends up nested at frontend/server.js, not server.js
# directly at the standalone root. `.next/static` and `public/` are NOT
# included in standalone output and must be copied in separately.
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public

EXPOSE 3000
CMD ["node", "frontend/server.js"]
