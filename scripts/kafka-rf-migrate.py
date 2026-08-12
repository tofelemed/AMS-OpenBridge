# Generates a kafka-reassign-partitions JSON that sets every user topic to the
# target replica set. RF=3: replicas spread round-robin over brokers 1,2,3.
# RF=1 (rollback): everything back to broker 1 only.
# Usage: python kafka-rf-migrate.py <topics.txt> <partitions.txt> <rf>
import json, sys

topics_file, parts_file, rf = sys.argv[1], sys.argv[2], int(sys.argv[3])
brokers = [1, 2, 3]

# partitions.txt: lines of "topic<TAB>partitionCount" from kafka-topics --describe
counts = {}
for line in open(parts_file):
    t, c = line.split()
    counts[t] = int(c)

plan = {"version": 1, "partitions": []}
for t in sorted(open(topics_file).read().split()):
    if t.startswith("__"):
        continue  # internal topics handled separately/documented
    for p in range(counts[t]):
        if rf == 1:
            replicas = [1]
        else:
            replicas = [brokers[(p + i) % 3] for i in range(rf)]
        plan["partitions"].append({"topic": t, "partition": p, "replicas": replicas})

print(json.dumps(plan))
