import sys

file_path = 'infra/docker/docker-compose.yml'

with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'flink-jobmanager:' in line:
        break
    new_lines.append(line)

fixed_content = """  # Flink JobManager
  flink-jobmanager:
    image: flink:1.18.1-java11
    container_name: ams-flink-jobmanager
    <<: [*default-restart, *default-logging]
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
    <<: [*default-restart, *default-logging]
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
    <<: [*default-restart, *default-logging]
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
    <<: [*default-restart, *default-logging]
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

new_lines.append(fixed_content)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
