FROM maven:3.9-eclipse-temurin-11 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:11-jre-jammy
WORKDIR /app
COPY --from=build /app/target/sparkplug-edge-node-1.0-SNAPSHOT.jar app.jar
# Non-root user for security
RUN useradd -r -u 1001 appuser
USER appuser
ENTRYPOINT ["java", "-Xms64m", "-Xmx192m", "-jar", "app.jar"]
