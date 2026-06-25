# ============================================================
# Stage 1: Build the React Application
# ============================================================
FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_KEYCLOAK_URL=
ARG VITE_API_BASE_URL=
ARG VITE_SIGNALR_HUB_URL=/hubs/alarms
ARG VITE_DEMO_MODE=false
# Phase 5/6: MQTT + Historian BFF
ARG VITE_MQTT_WS_URL=/mqtt-ws
ARG VITE_SNAPSHOT_URL=/api/hist/snapshot
ARG VITE_HIST_URL=/api/hist
ARG VITE_SPARKPLUG_GROUP=ams_site1
ARG VITE_SPARKPLUG_EDGE=ams_edge1

ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SIGNALR_HUB_URL=$VITE_SIGNALR_HUB_URL
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
ENV VITE_MQTT_WS_URL=$VITE_MQTT_WS_URL
ENV VITE_SNAPSHOT_URL=$VITE_SNAPSHOT_URL
ENV VITE_HIST_URL=$VITE_HIST_URL
ENV VITE_SPARKPLUG_GROUP=$VITE_SPARKPLUG_GROUP
ENV VITE_SPARKPLUG_EDGE=$VITE_SPARKPLUG_EDGE

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Serve using Nginx (proxies /api and /hubs to ams-api)
# ============================================================
FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
