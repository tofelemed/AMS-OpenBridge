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
}
