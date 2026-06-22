compose_content = """x-logging: &default-logging
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"

x-restart: &default-restart
  restart: unless-stopped

networks:
  ams-backend:
    driver: bridge

volumes:
  postgres-data:
  kafka_0_data:
  zookeeper_data:
  flink-checkpoints:

services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    container_name: ams-postgres
    <<: *default-restart
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 384M
    environment:
      POSTGRES_DB:       ams
      POSTGRES_USER:     ams_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ../../database/scripts:/docker-entrypoint-initdb.d:ro
    ports:
      - "5433:5432"
    networks:
      - ams-backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ams_user -d ams"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 180s

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.3
    container_name: ams-zookeeper
    <<: *default-restart
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME:   2000
      KAFKA_HEAP_OPTS:       "-Xmx128M -Xms128M"
    volumes:
      - zookeeper_data:/var/lib/zookeeper
    networks:
      - ams-backend
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "2181"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 180s

  kafka-ui:
      image: provectuslabs/kafka-ui:master
      container_name: kafka-ui
      ports:
        - "8080:8080"
      networks:
        - ams-backend
      environment:
        KAFKA_CLUSTERS_0_NAME: local
        KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092,kafka-1:9093,kafka-2:9094
        KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181

  kafka:
    image: confluentinc/cp-kafka:7.5.3
    container_name: ams-kafka
    hostname: kafka
    <<: *default-restart
    depends_on:
      zookeeper:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 768M
    environment:
      KAFKA_BROKER_ID:                        1
      KAFKA_ZOOKEEPER_CONNECT:                zookeeper:2181
      KAFKA_LISTENERS:                        INTERNAL://0.0.0.0:9092,EXTERNAL://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS:             INTERNAL://kafka:9092,EXTERNAL://:9093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:   INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME:       INTERNAL
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE:        "true"
      KAFKA_NUM_PARTITIONS:                   4
      KAFKA_HEAP_OPTS:                        "-Xmx256M -Xms256M"
      KAFKA_LOG_RETENTION_HOURS:              "24"
      KAFKA_LOG_SEGMENT_BYTES:                "104857600"
    volumes:
      - kafka_0_data:/var/lib/kafka/data
    ports:
      - "9093:9093"
    networks:
      ams-backend:
        aliases:
          - kafka
    healthcheck:
      test: ["CMD", "nc", "-z", "localhost", "9092"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 180s

  flink-jobmanager:
    image: flink:1.18.1-java11
    container_name: ams-flink-jobmanager
    <<: *default-restart
    entrypoint: ["/bin/bash", "/opt/flink-entrypoint.sh"]
    command: jobmanager
    depends_on:
      kafka:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '1.00'
          memory: 1536M
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager
        jobmanager.memory.process.size: 1024m
        taskmanager.memory.process.size: 1024m
        parallelism.default: 1
        state.backend: hashmap
        state.checkpoints.dir: file:///flink-checkpoints
      KAFKA_BROKERS: kafka:9092
      DB_URL:        jdbc:postgresql://postgres:5432/ams
      DB_USER:       ams_user
      DB_PASS:       ${POSTGRES_PASSWORD:-supersecurepassword123}
    volumes:
      - flink-checkpoints:/flink-checkpoints
      - ../../src/flink/target/ams-flink-1.0-SNAPSHOT.jar:/opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar
      - ./flink-entrypoint.sh:/opt/flink-entrypoint.sh:ro
    ports:
      - "8082:8081"
    networks:
      - ams-backend

  flink-taskmanager:
    image: flink:1.18.1-java11
    container_name: ams-flink-taskmanager
    <<: *default-restart
    depends_on:
      flink-jobmanager:
        condition: service_started
      kafka:
        condition: service_healthy
    entrypoint: ["/bin/bash", "/opt/flink-entrypoint.sh"]
    command: taskmanager
    deploy:
      resources:
        limits:
          cpus: '1.00'
          memory: 1536M
    environment:
      FLINK_PROPERTIES: |
        jobmanager.rpc.address: flink-jobmanager
        taskmanager.memory.process.size: 1024m
        taskmanager.numberOfTaskSlots: 16
        state.backend: hashmap
        state.checkpoints.dir: file:///flink-checkpoints
      KAFKA_BROKERS: kafka:9092
      DB_URL:        jdbc:postgresql://postgres:5432/ams
      DB_USER:       ams_user
      DB_PASS:       ${POSTGRES_PASSWORD:-supersecurepassword123}
    volumes:
      - flink-checkpoints:/flink-checkpoints
      - ./flink-entrypoint.sh:/opt/flink-entrypoint.sh:ro
    networks:
      - ams-backend

  ams-api:
    build:
      context: ../../src/backend
      dockerfile: ../../infra/docker/api/Dockerfile
    container_name: ams-api
    <<: *default-restart
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 512M
    environment:
      ASPNETCORE_ENVIRONMENT:   Development
      ASPNETCORE_URLS:          http://0.0.0.0:8000
      Urls:                     http://0.0.0.0:8000
      ConnectionStrings__AmsDb: Host=postgres;Port=5432;Database=ams;Username=ams_user;Password=${POSTGRES_PASSWORD:-supersecurepassword123}
      Kafka__BootstrapServers:  kafka:9092
      Kafka__IngestAuthority:        api
      Kafka__ConsumerGroupId:        ams-backend-2
      Kafka__RawAlarmsTopic:         raw-alarms
      Flink__JobManagerUrl:          http://flink-jobmanager:8081
      AlarmIngestion__Enabled:       "true"
      AlarmIngestion__FeedUrl:          http://192.168.1.51:8010/api/current-alarms
      AlarmIngestion__AckWritebackUrl:  http://192.168.1.51:8010/api/alarms/acknowledge
      AlarmIngestion__PollIntervalMs: "2000"
      AlarmIngestion__ServerId:      "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110"
      AlarmIngestion__ServerName:    "Current Alarms Feed"
    ports:
      - "8000:8000"
    networks:
      - ams-backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 180s

  ams-frontend:
    build:
      context: ../../src/frontend
      dockerfile: ../../infra/docker/frontend/Dockerfile
      args:
        VITE_API_BASE_URL: ""
        VITE_SIGNALR_HUB_URL: /hubs/alarms
    container_name: ams-frontend
    <<: *default-restart
    depends_on:
      ams-api:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
    environment:
      VITE_API_BASE_URL:     http://ams-api:8000
      VITE_SIGNALR_HUB_URL: http://ams-api:8000/hubs/alarms
    ports:
      - "3000:80"
    networks:
      - ams-backend
"""

with open("infra/docker/docker-compose.yml", "w") as f:
    f.write(compose_content)
