package com.ams.flink.cplm;

import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.graph.StreamEdge;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.apache.flink.streaming.api.graph.StreamNode;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 (2F.1 lab finding, 2026-09-16): a two-input operator's watermark is the minimum of its inputs
 * and the control stream carries none, so an operator that connects samples with a broadcast AFTER
 * the watermark assigner holds every downstream event-time timer at minus infinity - the long job
 * emitted nothing for an hour. The graph must re-assign watermarks right after the peer fan-out and
 * before the keyed window process.
 */
public class LongJobTopologyTest {
    @Test
    public void thePeerFanoutIsFollowedByAWatermarkAssignerBeforeTheKeyedProcess() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        CplmJobConfig base = CplmJobConfig.fromArgs(new String[0]);
        CplmJobConfig cfg = new CplmJobConfig(base.brokers, "AMS - CPLM Long Diagnostics Engine", base.consumerGroupId + "-long",
                base.inputTopic, base.outputTopic, base.shortFeatureTopic, base.longFeatureTopic, base.windowHours, base.outOfOrdernessMinutes);
        CplmLongDiagnosticsStreamJob.build(env, cfg, new String[0]);
        StreamGraph g = env.getStreamGraph();
        StreamNode fanout = null, keyed = null;
        for (StreamNode n : g.getStreamNodes()) {
            if ("cplm-long-peer-fanout".equals(n.getOperatorName())) fanout = n;
            if ("cplm-long-diagnostics-keyed-process".equals(n.getOperatorName())) keyed = n;
        }
        assertNotNull("peer fan-out operator present", fanout);
        assertNotNull("keyed process present", keyed);
        List<StreamEdge> out = fanout.getOutEdges();
        assertEquals("the fan-out feeds exactly one operator", 1, out.size());
        StreamNode next = g.getStreamNode(out.get(0).getTargetId());
        assertEquals("cplm-long-peer-fanout-watermarks", next.getOperatorName());
        assertTrue(next.getOperatorFactory().getStreamOperatorClass(getClass().getClassLoader()).getSimpleName().contains("TimestampsAndWatermarks"));
        boolean feedsKeyed = false;
        for (StreamEdge e : next.getOutEdges()) if (e.getTargetId() == keyed.getId()) feedsKeyed = true;
        assertTrue("the re-assigned watermarks reach the keyed process", feedsKeyed);
    }
}
