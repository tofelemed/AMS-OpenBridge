# STR-13 — bake the job artifact into the image.
#
# The JAR was previously bind-mounted from ../../src/flink/target into seven
# containers, so a developer running `mvn package` on the host silently replaced
# the binary that the "production" cluster was executing, with no version anywhere
# to trace what was actually running. Baking it in makes the image the unit of
# deployment and lets the savepoint upgrade procedure (STR-11) reason about
# versions.
#
# Build context is src/flink, so run scripts/build-flink-jar.ps1 first — the jar
# must exist in target/ before this image can be built.
FROM flink:1.18.1-java11

ARG JAR_FILE=target/ams-flink-1.0-SNAPSHOT.jar
ARG JAR_VERSION=1.0-SNAPSHOT

COPY ${JAR_FILE} /opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar

# Recorded so `docker inspect` can answer "which build is this cluster running?"
LABEL com.ams.flink.jar-version="${JAR_VERSION}"
ENV AMS_FLINK_JAR=/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar
