package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmGateFusionStreamJob;
import com.ams.flink.cplm.CplmJobConfig;
import com.ams.flink.cplm.CplmLongDiagnosticsStreamJob;
import com.ams.flink.cplm.CplmShortFeatureStreamJob;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.apache.flink.streaming.api.graph.StreamNode;
import org.junit.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.1 (R17): every profile-consuming job connects the gate-config bundle topic on the
 * same control broadcast as the registry metadata, and sinks its PREPARE / APPLY acknowledgements
 * to the ACK topic - the control plane can only verify a deployment against workers that answer.
 */
public class GateConfigTopologyTest {
    private static Set<String> operatorNames(StreamGraph g) {
        Set<String> names = new HashSet<>();
        for (StreamNode n : g.getStreamNodes()) names.add(n.getOperatorName());
        return names;
    }

    private static CplmJobConfig cfg(String jobName) {
        CplmJobConfig base = CplmJobConfig.fromArgs(new String[0]);
        return new CplmJobConfig(base.brokers, jobName, base.consumerGroupId + "-t", base.inputTopic, base.outputTopic,
                base.shortFeatureTopic, base.longFeatureTopic, base.windowHours, base.outOfOrdernessMinutes,
                base.gateConfigTopic, base.gateConfigAcksTopic, "k", "MARUN");
    }

    @Test
    public void theShortJobConsumesBundlesAndAnswers() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        CplmShortFeatureStreamJob.build(env, cfg(PropertyReaders.SHORT), new String[0]);
        Set<String> names = operatorNames(env.getStreamGraph());
        assertTrue(names.toString(), names.contains("Source: cplm-gate-config-broadcast-source"));
        assertTrue(names.toString(), names.contains("cplm-sample-profile-broadcast"));
        assertTrue(names.toString(), names.contains("cplm-gate-config-ack-sink: Writer"));
    }

    @Test
    public void theLongJobConsumesBundlesAndAnswers() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        CplmLongDiagnosticsStreamJob.build(env, cfg(PropertyReaders.LONG), new String[0]);
        Set<String> names = operatorNames(env.getStreamGraph());
        assertTrue(names.toString(), names.contains("Source: cplm-gate-config-broadcast-source"));
        assertTrue(names.toString(), names.contains("cplm-gate-config-ack-sink: Writer"));
    }

    @Test
    public void theFusionJobConsumesBundlesAndAnswers() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        CplmGateFusionStreamJob.build(env, cfg(PropertyReaders.FUSION), new String[0]);
        Set<String> names = operatorNames(env.getStreamGraph());
        assertTrue(names.toString(), names.contains("Source: cplm-gate-config-broadcast-source"));
        assertTrue(names.toString(), names.contains("cplm-fusion-profile-broadcast"));
        assertTrue(names.toString(), names.contains("cplm-fusion-gate-config-ack-sink: Writer"));
    }
}
