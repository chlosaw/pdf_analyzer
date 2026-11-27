# Build context is the repo root (see docker-compose.yml).
FROM node:25-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --workspace packages/shared --workspace apps/api --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace apps/api

FROM node:25-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma apps/api/prisma
# Production dependencies only; postinstall runs `prisma generate` (prisma is a runtime dependency).
RUN npm ci --workspace apps/api --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Apply migrations, optionally seed the demo account, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO\" = \"true\" ]; then node dist/seed.js; fi && node dist/index.js"]
