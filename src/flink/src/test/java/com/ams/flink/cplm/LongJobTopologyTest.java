package com.ams.flink.cplm;

import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.graph.StreamEdge;
import org.apache.flink.streaming.api.graph.StreamGraph;
import org.apache.flink.streaming.api.graph.StreamNode;
import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 (2F.1 lab finding, 2026-09-16): a two-input operator's watermark is the minimum of its inputs,
 * and a control stream that carries none holds every downstream event-time timer at minus infinity -
 * the long job emitted nothing for an hour when the peer fan-out was connected after the assigner.
 *
 * <p>The first answer was to re-assign a max-based watermark right after the fan-out. Marun
 * 2026-09-27 showed what that costs on a real fleet: one watermark over sixteen interleaved partitions
 * dropped 91 % of the samples as late whenever the job trailed the feed. The invariant is now the
 * opposite: the watermark is generated per partition AT THE SOURCE, every control stream marks itself
 * idle so a join cannot hold it, and NOTHING re-derives it between the fan-out and the keyed process
 * (see {@link IngestPipelineWatermarkTest} for the pipeline side).
 */
public class LongJobTopologyTest {
    @Test
    public void thePeerFanoutFeedsTheKeyedProcessWithNoWatermarkReassignmentInBetween() {
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
            String op = n.getOperatorFactory() == null ? "" :
                    n.getOperatorFactory().getStreamOperatorClass(getClass().getClassLoader()).getSimpleName();
            assertFalse("no max-based watermark re-assignment anywhere in the long job (2026-09-27): " + n.getOperatorName(),
                    op.contains("TimestampsAndWatermarks"));
        }
        assertNotNull("peer fan-out operator present", fanout);
        assertNotNull("keyed process present", keyed);
        boolean feedsKeyed = false;
        for (StreamEdge e : fanout.getOutEdges()) if (e.getTargetId() == keyed.getId()) feedsKeyed = true;
        assertTrue("the fan-out feeds the keyed process directly", feedsKeyed);
    }
}
