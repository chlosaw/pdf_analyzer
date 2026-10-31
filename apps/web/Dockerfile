# Build context is the repo root (see docker-compose.yml).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace packages/shared --workspace apps/web --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace apps/web

FROM nginx:1.27-alpine
# Where /api is proxied to; override on Render with the API service's URL.
ENV API_UPSTREAM=http://api:4000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
