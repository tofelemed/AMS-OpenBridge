package com.ams.flink.cplm;

import org.apache.flink.api.common.serialization.SimpleStringSchema;
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
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic(topic)
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .build();
        return stream.sinkTo(sink).name(sinkName);
    }
}
