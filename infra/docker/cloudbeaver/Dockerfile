# AMS CloudBeaver CE with Apache IoTDB driver enabled.
# Upstream CE already ships org.jkiss.dbeaver.ext.iotdb but does not enable it.
# This image enables iotdb:iotdb and bundles JDBC matching our IoTDB server (1.3.2).
#
# Build:
#   docker compose -f infra/docker/docker-compose.yml build cloudbeaver
#   # or:
#   docker build -t ams-cloudbeaver:iotdb infra/docker/cloudbeaver
#
# UI: http://localhost:8978
# IoTDB (from this container): host=iotdb port=6667 user=root password=root dialect=Tree

ARG CLOUDBEAVER_TAG=25.3.5
ARG IOTDB_JDBC_VERSION=1.3.2

FROM dbeaver/cloudbeaver:${CLOUDBEAVER_TAG} AS upstream

FROM eclipse-temurin:21-jdk-jammy AS patcher
ARG IOTDB_JDBC_VERSION
ENV IOTDB_JDBC_VERSION=${IOTDB_JDBC_VERSION}

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=upstream /opt/cloudbeaver /opt/cloudbeaver
COPY patch-iotdb.sh /tmp/patch-iotdb.sh
RUN sed -i 's/\r$//' /tmp/patch-iotdb.sh \
 && chmod +x /tmp/patch-iotdb.sh \
 && /tmp/patch-iotdb.sh \
 && rm -f /tmp/patch-iotdb.sh

FROM dbeaver/cloudbeaver:${CLOUDBEAVER_TAG}
LABEL org.opencontainers.image.title="AMS CloudBeaver + IoTDB" \
      org.opencontainers.image.description="CloudBeaver CE with Apache IoTDB JDBC enabled for AMS historian"

COPY --from=patcher /opt/cloudbeaver/server/plugins/org.jkiss.dbeaver.ext.iotdb_*.jar /opt/cloudbeaver/server/plugins/
COPY --from=patcher /opt/cloudbeaver/server/plugins/io.cloudbeaver.resources.drivers.base_*.jar /opt/cloudbeaver/server/plugins/
COPY --from=patcher /opt/cloudbeaver/drivers/iotdb /opt/cloudbeaver/drivers/iotdb
