# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Multi-stage build for ChargeTrail.
#
# Targets:
#   backend-runtime   Node.js image running `node dist/index.js`
#   frontend-runtime  nginx serving the static SPA + reverse-proxying /api/
#
# Build context: repository root (so we can COPY backend/ and frontend/).
# ---------------------------------------------------------------------------

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.27-alpine


# Shared base with native-build toolchain for better-sqlite3 et al.
FROM ${NODE_IMAGE} AS base-deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# ---------- Backend ----------

FROM base-deps AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM backend-deps AS backend-build
COPY backend/ ./
RUN npm run build

FROM base-deps AS backend-prod-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE} AS backend-runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=backend-prod-deps /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./package.json
RUN useradd --system --uid 10001 --create-home app \
    && mkdir -p /app/backend/data \
    && chown -R app:app /app
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]


# ---------- Frontend ----------

FROM base-deps AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM frontend-deps AS frontend-build
# Empty VITE_API_ORIGIN -> the SPA uses relative /api/* paths, which nginx
# in the frontend-runtime image proxies to the backend service.
ARG VITE_API_ORIGIN=""
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
COPY frontend/ ./
RUN npm run build

FROM ${NGINX_IMAGE} AS frontend-runtime
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
