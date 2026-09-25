package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmJobConfig;
import org.apache.flink.api.connector.source.Boundedness;
import org.apache.flink.api.dag.Transformation;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.transformations.WithBoundedness;
import org.junit.Test;

import java.util.ArrayDeque;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * Lab 2026-09-25: a job restored from the checkpoint that was the announce task's final one (chk-1 of a
 * fresh submission) re-ran the bounded source's endInput(); the sink writer re-emitted the end-of-input
 * CommittableSummary and the committer, restored with that very summary, threw FLINK-25920 on every
 * restart, for ever - Condition, Fusion and Response all sat in RESTARTING. The announce source must be
 * unbounded so the sink never sees end-of-input and no checkpoint ever carries an EOI committable.
 */
public class CapabilityAnnounceTopologyTest {
    @Test
    public void theCapabilityAnnounceSourceIsUnboundedSoTheSinkNeverSeesEndOfInput() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        CplmJobConfig cfg = CplmJobConfig.fromArgs(new String[0]);
        CapabilityRecord.announce(env, cfg, "AMS - CPLM Topology Test Engine", new String[0]);
        Transformation<?> announce = find(env.getTransformations(), "cplm-capability-announce");
        assertNotNull("the announce source is in the graph", announce);
        assertTrue("the announce source declares boundedness", announce instanceof WithBoundedness);
        assertEquals("announce source boundedness", Boundedness.CONTINUOUS_UNBOUNDED, ((WithBoundedness) announce).getBoundedness());
        assertEquals("one announce task per job", 1, announce.getParallelism());
    }

    private static Transformation<?> find(List<Transformation<?>> roots, String name) {
        ArrayDeque<Transformation<?>> q = new ArrayDeque<>(roots);
        while (!q.isEmpty()) {
            Transformation<?> t = q.poll();
            if (name.equals(t.getName())) return t;
            q.addAll(t.getInputs());
        }
        return null;
    }
}
