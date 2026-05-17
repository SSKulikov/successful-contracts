# API pdf-parser: Express + Prisma + OCR/parse зависимостей (GraphicsMagick для pdf2pic)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    graphicsmagick \
    ghostscript \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV npm_config_audit=false \
    npm_config_fund=false \
    npm_config_progress=false \
    npm_config_update_notifier=false \
    npm_config_cache=/tmp/.npm \
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node \
    PRISMA_SCHEMA_ENGINE_BINARY=/app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 \
  && npm cache clean --force

ARG CACHE_BUST=1
RUN echo "cache bust: ${CACHE_BUST}"

COPY . .

RUN engine_version="$(node -e "console.log(require('@prisma/engines-version').enginesVersion)")" \
  && engine_base_url="https://binaries.prisma.sh/all_commits/${engine_version}/debian-openssl-3.0.x" \
  && curl -fsSL --retry 10 --retry-all-errors --retry-delay 10 --connect-timeout 30 \
      "${engine_base_url}/libquery_engine.so.node.gz" \
      | gunzip > "${PRISMA_QUERY_ENGINE_LIBRARY}" \
  && curl -fsSL --retry 10 --retry-all-errors --retry-delay 10 --connect-timeout 30 \
      "${engine_base_url}/schema-engine.gz" \
      | gunzip > "${PRISMA_SCHEMA_ENGINE_BINARY}" \
  && chmod +x "${PRISMA_SCHEMA_ENGINE_BINARY}" \
  && for attempt in 1 2 3 4 5; do \
      npx prisma generate --schema=src/prisma/schema.prisma && break; \
      if [ "$attempt" = "5" ]; then exit 1; fi; \
      sleep $((attempt * 10)); \
    done \
  && npm run build

ENV NODE_ENV=production
EXPOSE 3003

# При старте применяем миграции Prisma (см. docs/DEPLOY.md — migrate:deploy), затем поднимаем HTTP-сервер
CMD ["sh", "-c", "npm run migrate:deploy && node dist/index.js"]
