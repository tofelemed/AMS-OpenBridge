package com.ams.flink.cplm;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.dag.Transformation;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.transformations.SourceTransformation;
import org.apache.flink.streaming.api.transformations.TimestampsAndWatermarksTransformation;
import org.junit.Test;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Marun 2026-09-27: the Short Feature job dropped 91 % of every sample as LATE (numLateRecordsDropped
 * 1,249,763 of 1,370,388 on the 1m window; 86 % on 5m; 52 % on 60m), so two thirds of the fleet had no
 * short window and fusion excluded every verdict. The sample source read all sixteen partitions with
 * {@code noWatermarks()} and the event-time watermark was assigned AFTER the merge by one subtask, as
 * "max timestamp seen minus out-of-orderness". Whenever the job trailed the live feed, the source read
 * partitions in chunks minutes apart, the first chunk drove the watermark forward by minutes, and every
 * record from the other fifteen partitions arrived late. The laboratory never saw it: five loops at 1 s
 * never lag.
 *
 * <p>The strategy therefore belongs at the source, per partition, and the control streams that are
 * joined in afterwards must mark themselves idle so the join does not hold the watermark at minus
 * infinity - which was the only reason the post-join re-assignment existed.
 */
public class IngestPipelineWatermarkTest {

    private static CplmJobConfig cfg() {
        CplmJobConfig base = CplmJobConfig.fromArgs(new String[0]);
        return base.forJob("AMS - CPLM Watermark Test", "-wmtest", null);
    }

    private static List<SourceTransformation<?, ?, ?>> sources(Transformation<?> root) {
        List<SourceTransformation<?, ?, ?>> out = new ArrayList<>();
        ArrayDeque<Transformation<?>> q = new ArrayDeque<>();
        q.add(root);
        while (!q.isEmpty()) {
            Transformation<?> t = q.poll();
            if (t instanceof SourceTransformation) out.add((SourceTransformation<?, ?, ?>) t);
            q.addAll(t.getInputs());
        }
        return out;
    }

    /** The generator a strategy builds: withIdleness(...) wraps it in WatermarksWithIdleness whatever else wraps the strategy. */
    private static String generatorOf(WatermarkStrategy<?> s) {
        return s.createWatermarkGenerator(null).getClass().getSimpleName();
    }

    private static boolean isPlainNoWatermarks(WatermarkStrategy<?> s) {
        return generatorOf(s).startsWith("NoWatermarks");
    }

    @Test
    public void theSampleSourceCarriesThePerPartitionStrategyAndNothingReassignsItAfterTheJoin() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        DataStream<CplmNormalizedSample> out = CplmIngestPipeline.build(env, cfg(), "wmtest-samples");

        assertFalse("no max-based re-assignment sits between the profile join and the windows",
                out.getTransformation() instanceof TimestampsAndWatermarksTransformation);

        SourceTransformation<?, ?, ?> samples = sources(out.getTransformation()).stream()
                .filter(s -> s.getName().equals("wmtest-samples")).findFirst().orElseThrow();
        assertFalse("the sample source itself generates per-partition watermarks",
                isPlainNoWatermarks(samples.getWatermarkStrategy()));
        assertTrue("with idleness, so a quiet partition cannot stall the fleet",
                generatorOf(samples.getWatermarkStrategy()).contains("Idleness"));
        assertTrue("idleness measured in tens of minutes, never one: a back-pressured reader drains one partition "
                        + "at a time and a short threshold lets the others drop out of the minimum",
                CplmIngestPipeline.SAMPLE_IDLENESS.toMinutes() >= 20);
    }

    @Test
    public void everyControlStreamJoinedIntoTheSamplesMarksItselfIdleSoItCannotHoldTheWatermark() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment(1);
        DataStream<CplmNormalizedSample> out = CplmIngestPipeline.build(env, cfg(), "wmtest-samples");
        List<SourceTransformation<?, ?, ?>> control = new ArrayList<>();
        for (SourceTransformation<?, ?, ?> s : sources(out.getTransformation()))
            if (!s.getName().equals("wmtest-samples")) control.add(s);
        assertFalse("the profile / gate-config broadcast sources are in the graph", control.isEmpty());
        for (SourceTransformation<?, ?, ?> s : control)
            assertTrue(s.getName() + " must carry an idleness-marking strategy, not plain noWatermarks()",
                    generatorOf(s.getWatermarkStrategy()).contains("Idleness"));
    }

    @Test
    public void theEventTimeIsReadFromTheRawTupleWithTheRecordTimeAsFallback() {
        String raw = "{\"loop_id\":\"FIC10301\",\"event_ts_ms\":1790000000123,\"ingest_ts_ms\":1790000000400,\"pv\":1.0}";
        assertEquals(1790000000123L, CplmIngestPipeline.eventTsOf(raw, 42L));
        assertEquals("absent field falls back to the Kafka record time", 42L, CplmIngestPipeline.eventTsOf("{\"loop_id\":\"X\"}", 42L));
        assertEquals("garbage falls back to the Kafka record time", 42L, CplmIngestPipeline.eventTsOf("not json", 42L));
    }
}
