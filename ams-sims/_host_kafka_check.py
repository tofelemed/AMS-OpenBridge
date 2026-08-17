"""PIPE-001 verification: host client via 127.0.0.1 bootstrap + advertised-name hop."""
import json

from confluent_kafka import Producer
from confluent_kafka.admin import AdminClient

a = AdminClient({"bootstrap.servers": "127.0.0.1:9093"})
md = a.list_topics(timeout=10)
print("bootstrap 127.0.0.1 OK,", len(md.topics), "topics")

p = Producer({"bootstrap.servers": "127.0.0.1:9093"})
errs = []


def cb(err, msg):
    if err:
        errs.append(str(err))
    else:
        print("produce OK to", msg.topic(), "partition", msg.partition(), "offset", msg.offset())


p.produce("raw-alarms-dlq", key=b"sim-host-test",
          value=json.dumps({"hostProduceTest": 1}).encode(), callback=cb)
p.flush(15)
print("errors:", errs or "none")
