package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.TopicPartition;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;

/**
 * v2.5 (2C.2 / 3C.1): the attribute lookup a BOUNDED job (replay, reconstruction, shadow) builds
 * in its driver so it resolves profiles exactly as the streaming jobs do - the compacted metadata
 * topic (and the canonical parameter-set topic when consumed) read to their end offsets, applied
 * into a {@link CplmDynamicsParameterSetSupport.MapLookup}. Small: one envelope per loop, compacted.
 */
public final class CplmParameterUpdateReader {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CplmParameterUpdateReader() {
    }

    public static List<String> readParameterUpdates(String brokers) {
        List<String> out = new ArrayList<>();
        List<String> topics = new ArrayList<>();
        topics.add(CplmParameterSetBroadcastSupport.legacyMetadataTopic());
        if (CplmParameterSetBroadcastSupport.consumeCanonical()) topics.add(CplmParameterSetBroadcastSupport.parameterSetTopic());
        Properties props = new Properties();
        props.put("bootstrap.servers", brokers);
        props.put("group.id", "cplm-reconstruction-profile-" + UUID.randomUUID());
        props.put("enable.auto.commit", "false");
        props.put("auto.offset.reset", "earliest");
        props.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        props.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            List<TopicPartition> partitions = new ArrayList<>();
            for (String topic : topics) {
                List<PartitionInfo> infos = consumer.partitionsFor(topic);
                if (infos == null) continue;
                for (PartitionInfo pi : infos) partitions.add(new TopicPartition(topic, pi.partition()));
            }
            if (partitions.isEmpty()) return out;
            consumer.assign(partitions);
            consumer.seekToBeginning(partitions);
            Map<TopicPartition, Long> end = consumer.endOffsets(partitions);
            Set<TopicPartition> pending = new HashSet<>();
            for (TopicPartition tp : partitions) if (consumer.position(tp) < end.get(tp)) pending.add(tp);
            // compaction can leave the position short of the end offset for ever: a few idle polls end the read
            int idlePolls = 0;
            while (!pending.isEmpty() && idlePolls < 3) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofSeconds(1));
                if (records.isEmpty()) idlePolls++;
                for (ConsumerRecord<String, String> r : records) if (r.value() != null) out.add(r.value());
                for (TopicPartition tp : new ArrayList<>(pending)) if (consumer.position(tp) >= end.get(tp)) pending.remove(tp);
            }
        }
        return out;
    }

    /** Applies the updates in order into a fresh lookup; a record that does not parse is counted and skipped (the bounded job states it in its log). */
    public static CplmDynamicsParameterSetSupport.MapLookup lookupFrom(List<String> updates) {
        CplmDynamicsParameterSetSupport.MapLookup lookup = new CplmDynamicsParameterSetSupport.MapLookup();
        if (updates == null) return lookup;
        for (String update : updates) {
            try {
                JsonNode root = MAPPER.readTree(update);
                if (!CplmMetadataEnvelope.isEnvelope(root)) continue;              // gate-config bundles ride another topic; anything else is not ours
                CplmMetadataEnvelope.applyUpdate(root, lookup::put, lookup::removePrefix);
            } catch (Exception e) {
                com.ams.flink.cplm.config.ConfigRejections.count("PARSE_ERROR");
                System.out.println("CPLM_METADATA_REJECTED bounded=true reason=" + e.getMessage());
            }
        }
        return lookup;
    }
}
