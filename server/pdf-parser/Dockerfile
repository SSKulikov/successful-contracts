# API pdf-parser: Express + Prisma + OCR/parse зависимостей (GraphicsMagick для pdf2pic)
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    graphicsmagick \
    ghostscript \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate --schema=src/prisma/schema.prisma \
  && npm run build

ENV NODE_ENV=production
EXPOSE 3003

# При старте применяем миграции Prisma, затем поднимаем HTTP-сервер
CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node dist/index.js"]
