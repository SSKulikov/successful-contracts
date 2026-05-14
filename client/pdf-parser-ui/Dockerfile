# Vite SPA build + nginx static hosting.
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The nginx container proxies /api to the API service, so the SPA can use a same-origin API URL.
ARG VITE_API_URL=/api
ARG VITE_USE_MOCK_API=false
ARG VITE_USE_MOCK_ADMIN_API=false
ARG VITE_USE_MOCK_PROFILE_API=false

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_USE_MOCK_API=${VITE_USE_MOCK_API}
ENV VITE_USE_MOCK_ADMIN_API=${VITE_USE_MOCK_ADMIN_API}
ENV VITE_USE_MOCK_PROFILE_API=${VITE_USE_MOCK_PROFILE_API}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

