import json
import time
import sys
from kafka import KafkaConsumer, KafkaProducer

# Use localhost:9092 as default (inside Docker network it would be kafka:9092, from host localhost:9092)
bootstrap_servers = ['localhost:9092']
consumer_topic = 'ack-writeback'
producer_topic = 'ack-results'

print(f"Starting mock ACK reconciler. Consuming from '{consumer_topic}', producing to '{producer_topic}'...", flush=True)

try:
    consumer = KafkaConsumer(
        consumer_topic,
        bootstrap_servers=bootstrap_servers,
        auto_offset_reset='latest',
        enable_auto_commit=True,
        group_id='mock-ack-reconciler-group',
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )
except Exception as e:
    print(f"Failed to connect consumer to Kafka: {e}", file=sys.stderr, flush=True)
    sys.exit(1)

try:
    producer = KafkaProducer(
        bootstrap_servers=bootstrap_servers,
        value_serializer=lambda x: json.dumps(x).encode('utf-8')
    )
except Exception as e:
    print(f"Failed to connect producer to Kafka: {e}", file=sys.stderr, flush=True)
    consumer.close()
    sys.exit(1)

print("Connected to Kafka. Watching for writebacks...", flush=True)

try:
    for message in consumer:
        val = message.value
        if not val:
            continue
            
        print(f"Received ack-writeback: {val}", flush=True)
        
        # Extract fields
        cmd_id = val.get('commandId') or val.get('CommandId') or val.get('actionId') or val.get('ActionId')
        corr_id = val.get('correlationId') or val.get('CorrelationId') or cmd_id
        lc_id = val.get('lifecycleId') or val.get('LifecycleId')
        dcs_id = val.get('dcsSequenceId') or val.get('DcsSequenceId')
        alarm_id = val.get('alarmId') or val.get('AlarmId')
        server_id = val.get('serverId') or val.get('ServerId')
        source_name = val.get('sourceName') or val.get('SourceName')
        condition_name = val.get('conditionName') or val.get('ConditionName')
        active_time = val.get('activeTimeEpochMs') or val.get('ActiveTimeEpochMs') or int(time.time() * 1000)
        cookie_offset = val.get('cookieOffset') or val.get('CookieOffset') or 0
        
        # Prepare successful ACK reply (ACK_RESULT)
        ack_result = {
            "schemaVersion": 2,
            "eventType": "ACK_RESULT",
            "commandId": cmd_id,
            "correlationId": corr_id,
            "lifecycleId": lc_id,
            "dcsSequenceId": dcs_id,
            "alarmId": alarm_id,
            "serverId": server_id,
            "sourceName": source_name,
            "conditionName": condition_name,
            "activeTimeEpochMs": active_time,
            "cookieOffset": cookie_offset,
            "resultState": "ACK_CONFIRMED",
            "errorMessage": None,
            "timestampEpochMs": int(time.time() * 1000)
        }
        
        print(f"Publishing mock ACK confirmation: {ack_result}", flush=True)
        key = f"{server_id}|{source_name}"
        producer.send(producer_topic, value=ack_result, key=key.encode('utf-8'))
        producer.flush()
        
except KeyboardInterrupt:
    print("Stopping reconciler...", flush=True)
finally:
    consumer.close()
