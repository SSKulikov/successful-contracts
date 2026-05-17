# API pdf-parser: Express + Prisma + OCR/parse зависимостей (GraphicsMagick для pdf2pic)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    graphicsmagick \
    ghostscript \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG CACHE_BUST=1
RUN echo "cache bust: ${CACHE_BUST}"

COPY . .

RUN npx prisma generate --schema=src/prisma/schema.prisma \
  && npm run build

ENV NODE_ENV=production
EXPOSE 3003

# При старте применяем миграции Prisma (см. docs/DEPLOY.md — migrate:deploy), затем поднимаем HTTP-сервер
CMD ["sh", "-c", "npm run migrate:deploy && node dist/index.js"]
