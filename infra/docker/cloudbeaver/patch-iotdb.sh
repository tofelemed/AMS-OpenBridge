#!/usr/bin/env bash
# Enable Apache IoTDB in CloudBeaver CE and ship JDBC jars matching AMS IoTDB 1.3.2.
set -euo pipefail

IOTDB_JDBC_VERSION="${IOTDB_JDBC_VERSION:-1.3.2}"
CB_ROOT="${CB_ROOT:-/opt/cloudbeaver}"
PLUGINS_DIR="${CB_ROOT}/server/plugins"
DRIVERS_DIR="${CB_ROOT}/drivers/iotdb"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo "==> Locating CloudBeaver plugins"
IOTDB_JAR="$(find "${PLUGINS_DIR}" -maxdepth 1 -name 'org.jkiss.dbeaver.ext.iotdb_*.jar' ! -name '*ui*' | head -n1)"
BASE_JAR="$(find "${PLUGINS_DIR}" -maxdepth 1 -name 'io.cloudbeaver.resources.drivers.base_*.jar' | head -n1)"

if [[ -z "${IOTDB_JAR}" || -z "${BASE_JAR}" ]]; then
  echo "ERROR: required plugins not found under ${PLUGINS_DIR}" >&2
  ls -la "${PLUGINS_DIR}" >&2 || true
  exit 1
fi

echo "    IoTDB plugin: ${IOTDB_JAR}"
echo "    Drivers base: ${BASE_JAR}"

echo "==> Downloading IoTDB JDBC ${IOTDB_JDBC_VERSION} (jar-with-dependencies)"
mkdir -p "${DRIVERS_DIR}"
JAR_NAME="iotdb-jdbc-${IOTDB_JDBC_VERSION}-jar-with-dependencies.jar"
JAR_URL="https://repo1.maven.org/maven2/org/apache/iotdb/iotdb-jdbc/${IOTDB_JDBC_VERSION}/${JAR_NAME}"
curl -fL --retry 3 -o "${DRIVERS_DIR}/${JAR_NAME}" "${JAR_URL}"
find "${DRIVERS_DIR}" -type f ! -name "${JAR_NAME}" -delete || true
ls -lh "${DRIVERS_DIR}"

echo "==> Patching IoTDB plugin.xml (bundle jars + pin JDBC ${IOTDB_JDBC_VERSION})"
mkdir -p "${WORK}/iotdb"
(
  cd "${WORK}/iotdb"
  jar xf "${IOTDB_JAR}" plugin.xml
  if ! grep -q 'iotdb-jdbc' plugin.xml; then
    echo "ERROR: iotdb-jdbc entry missing in IoTDB plugin.xml" >&2
    exit 1
  fi
  # Replace every maven-only iotdb-jdbc file entry with maven + bundled drivers/iotdb
  sed -i -E \
    "s#<file type=\"jar\" path=\"maven:/org\\.apache\\.iotdb:iotdb-jdbc:[^\"]+\"/>#<file type=\"jar\" path=\"maven:/org.apache.iotdb:iotdb-jdbc:${IOTDB_JDBC_VERSION}\" bundle=\"!drivers.iotdb\"/>\n                <file type=\"jar\" path=\"drivers/iotdb\" bundle=\"drivers.iotdb\"/>#g" \
    plugin.xml
  # IoTDB 1.3.x rejects ?sql_dialect= (2.x table-model). Force classic Session URL.
  sed -i -E \
    's#sampleURL="jdbc:iotdb://\{host\}:\{port\}/\?sql_dialect=\{sqlDialect\}"#sampleURL="jdbc:iotdb://{host}:{port}/"#g' \
    plugin.xml
  sed -i -E \
    's#supportedPageFields="host,port,sqlDialect"#supportedPageFields="host,port"#g' \
    plugin.xml
  grep -q 'drivers/iotdb' plugin.xml
  grep -q 'sampleURL="jdbc:iotdb://{host}:{port}/"' plugin.xml
  jar uf "${IOTDB_JAR}" plugin.xml
)

echo "==> Patching drivers.base plugin.xml (enable iotdb:iotdb)"
mkdir -p "${WORK}/base"
(
  cd "${WORK}/base"
  jar xf "${BASE_JAR}" plugin.xml

  # Use fixed-string matches — grep '.' otherwise matches '/' in drivers/iotdb
  if ! grep -qF 'name="drivers/iotdb"' plugin.xml; then
    sed -i 's#        <resource name="drivers/trino"/>#        <resource name="drivers/iotdb"/>\n        <resource name="drivers/trino"/>#' plugin.xml
  fi
  if ! grep -qF 'id="drivers.iotdb"' plugin.xml; then
    sed -i 's#        <bundle id="drivers.trino" label="Trino drivers"/>#        <bundle id="drivers.iotdb" label="Apache IoTDB drivers"/>\n        <bundle id="drivers.trino" label="Trino drivers"/>#' plugin.xml
  fi
  if ! grep -qF 'id="iotdb:iotdb"' plugin.xml; then
    sed -i 's#        <driver id="generic:trino_jdbc"/>#        <driver id="iotdb:iotdb"/>\n        <driver id="generic:trino_jdbc"/>#' plugin.xml
  fi

  grep -qF 'id="iotdb:iotdb"' plugin.xml
  grep -qF 'name="drivers/iotdb"' plugin.xml
  grep -qF 'id="drivers.iotdb"' plugin.xml
  echo "---- drivers.base iotdb lines ----"
  grep -n 'iotdb' plugin.xml || true
  jar uf "${BASE_JAR}" plugin.xml
)

chmod -R a+rX "${DRIVERS_DIR}" "${IOTDB_JAR}" "${BASE_JAR}" 2>/dev/null || true

echo "==> IoTDB enablement complete"
echo "    Connect: host=iotdb port=6667 user=root password=root dialect=tree"
echo "    JDBC:    jdbc:iotdb://iotdb:6667/"
