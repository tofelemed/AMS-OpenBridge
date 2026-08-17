package com.ams.flink.cplm;

import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.DataStreamSink;

final class CplmKafkaSink {
    private CplmKafkaSink() {
    }

    static DataStreamSink<String> attach(DataStream<String> stream, CplmJobConfig cfg, String topic, String sinkName) {
        KafkaSink<String> sink = KafkaSink.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic(topic)
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();
        // STR-11: stable uid so a savepoint taken before an upgrade still maps onto
        // this sink afterwards. sinkName is unique per job.
        return stream.sinkTo(sink).name(sinkName).uid(sinkName);
    }

    /**
     * Keyed variant (PIPE-010): key = a top-level JSON string field, so all records
     * for one entity land on one partition and consumers see them in order.
     * Delegates to the shared {@link com.ams.flink.KafkaSinks} builder (explicit
     * producer timeouts, never emits a null key).
     */
    static DataStreamSink<String> attachKeyed(
            DataStream<String> stream, CplmJobConfig cfg, String topic, String sinkName, String keyField) {
        return stream
                .sinkTo(com.ams.flink.KafkaSinks.keyedByJsonField(cfg.brokers, topic, keyField))
                .name(sinkName)
                .uid(sinkName);
    }
}
