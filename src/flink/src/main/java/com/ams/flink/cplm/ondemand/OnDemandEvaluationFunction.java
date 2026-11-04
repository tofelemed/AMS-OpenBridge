package com.ams.flink.cplm.ondemand;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmParameterUpdateReader;
import com.ams.flink.cplm.replay.IotDbBoundedSource;
import com.ams.flink.cplm.replay.IotDbLoopReader;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

import java.io.Serializable;
import java.util.List;

/**
 * CHG-102 5c: answers one evaluation request at a time, keyed by loop. Main output = status records (RUNNING, then
 * SUCCEEDED / FAILED); the fused result and the evidence records leave through {@link #RESULTS} and {@link #EVIDENCE}.
 *
 * <p>The historian read and the calculation run synchronously in the operator: a request is one loop and at most 24 h
 * (seconds of work), and a checkpoint barrier waiting behind it is tolerated (CplmCheckpointing). Holds no keyed state:
 * a request replayed after a restore is simply evaluated again (the outputs are idempotent by run / evidence id), and
 * one that waited past --max-request-age-minutes is answered REQUEST_EXPIRED without any work.
 */
public final class OnDemandEvaluationFunction extends KeyedProcessFunction<String, String, String> {
    private static final long serialVersionUID = 1L;
    public static final OutputTag<String> RESULTS = new OutputTag<String>("cplm-on-demand-results") {};
    public static final OutputTag<String> EVIDENCE = new OutputTag<String>("cplm-on-demand-evidence") {};

    /** Wall clock (a fixed one in tests). */
    public interface Clock extends Serializable {
        long nowMs();
    }

    /** The job's settings. */
    public static final class Settings implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String loopRootPrefix;
        public final long maxRequestAgeMs;
        public final long parameterRefreshMs;
        public final long maxRows;
        public final int maxCycles;

        public Settings(String loopRootPrefix, long maxRequestAgeMs, long parameterRefreshMs, long maxRows, int maxCycles) {
            this.loopRootPrefix = loopRootPrefix;
            this.maxRequestAgeMs = maxRequestAgeMs;
            this.parameterRefreshMs = parameterRefreshMs;
            this.maxRows = maxRows;
            this.maxCycles = maxCycles;
        }
    }

    private final EvaluationSources.Historian historian;
    private final EvaluationSources.Parameters parameters;
    private final Settings settings;
    private final Clock clock;
    private transient volatile CplmDynamicsParameterSetSupport.MapLookup lookup;
    private transient volatile long lookupLoadedAtMs;
    /** Re-reads the parameter set off the request path (reading the compacted topic took ~20 s on the lab at first). */
    private transient java.util.concurrent.ScheduledExecutorService refresher;

    public OnDemandEvaluationFunction(EvaluationSources.Historian historian, EvaluationSources.Parameters parameters,
                                      Settings settings, Clock clock) {
        this.historian = historian;
        this.parameters = parameters;
        this.settings = settings;
        this.clock = clock;
    }

    /** The key: the request's loop (requests of one loop are answered in order); an unreadable request shares one key. */
    public static String keyOf(String json) {
        EvaluationRequest r = EvaluationRequest.parse(json);
        return r.loopId == null ? "_invalid" : r.loopId;
    }

    @Override
    public void open(Configuration parameters) {
        lookup = null;
        lookupLoadedAtMs = 0L;
        // load at start and refresh in the background, so no request waits for the parameter topic: the lab's first
        // evaluation took 23 s (the topic read) against 1.2 s warm. A request before the first load completes loads it itself.
        refresher = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "cplm-on-demand-parameter-refresh");
            t.setDaemon(true);
            return t;
        });
        long every = Math.max(60_000L, settings.parameterRefreshMs);
        refresher.scheduleWithFixedDelay(this::refreshQuietly, 0L, every, java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    @Override
    public void close() throws Exception {
        if (refresher != null) refresher.shutdownNow();
        super.close();
    }

    private void refreshQuietly() {                       // not synchronized: a request never waits for a re-read
        try {
            lookup = CplmParameterUpdateReader.lookupFrom(parameters.read());
            lookupLoadedAtMs = clock.nowMs();
        } catch (Exception e) {
            System.out.println("CPLM_EVALUATION_PARAMETERS_STALE reason=\"" + message(e) + "\"");
        }
    }

    @Override
    public void processElement(String value, Context ctx, Collector<String> out) {
        long t0 = clock.nowMs();
        EvaluationRequest r = EvaluationRequest.parse(value);
        if (r.analysisRunId == null) {
            System.out.println("CPLM_EVALUATION_DROPPED reason=\"" + r.rejection + "\"");   // nothing to answer to
            return;
        }
        if (r.rejection != null) { fail(out, r, r.rejection, 0, t0); return; }
        String expired = r.expiry(t0, settings.maxRequestAgeMs);
        if (expired != null) { fail(out, r, expired, 0, t0); return; }
        out.collect(EvaluationStatus.running(r, t0));

        String device = r.iotdbDevice != null ? r.iotdbDevice : IotDbBoundedSource.devicePathFor(settings.loopRootPrefix, r.loopId);
        CplmDynamicsParameterSetSupport.MapLookup params;
        try {
            params = parameterLookup(t0);
        } catch (Exception e) {
            fail(out, r, "PARAMETERS_UNAVAILABLE: " + message(e), 0, t0);
            return;
        }
        List<CplmNormalizedSample> samples;
        try {
            samples = historian.read(device, r.loopId, r.loopType, r.fromMs, r.toMs, settings.maxRows);
        } catch (IotDbLoopReader.TooManyRowsException e) {
            fail(out, r, "TOO_MANY_ROWS: " + e.getMessage(), 0, t0);
            return;
        } catch (Exception e) {
            fail(out, r, "HISTORIAN_UNAVAILABLE: " + message(e), 0, t0);
            return;
        }
        if (samples == null || samples.isEmpty()) {
            fail(out, r, "NO_HISTORIAN_DATA: no rows on " + device + " in [" + r.fromMs + ", " + r.toMs + ")", 0, t0);
            return;
        }
        OnDemandEvaluator.Outcome o;
        try {
            o = OnDemandEvaluator.evaluate(r, samples, params, settings.maxCycles, device, clock.nowMs());
        } catch (Exception e) {
            fail(out, r, "EVALUATION_FAILED: " + message(e), samples.size(), t0);
            return;
        }
        ctx.output(RESULTS, o.resultJson);
        for (String record : o.evidenceRecords) ctx.output(EVIDENCE, record);
        long now = clock.nowMs();
        out.collect(EvaluationStatus.json(r, EvaluationStatus.SUCCEEDED, o.samples, o.artifacts, o.methodRunIds, null, now - t0, now));
        System.out.println("CPLM_EVALUATION_DONE run=" + r.analysisRunId + " loop=" + r.loopId + " kind=" + r.windowKind
                + " samples=" + o.samples + " artifacts=" + o.artifacts + " ms=" + (now - t0));
    }

    /** The registry parameter set: the background copy when there is one (refreshed every --parameter-refresh-minutes);
     *  otherwise read here, re-read when older than the interval, and a failed re-read keeps the last one. */
    private synchronized CplmDynamicsParameterSetSupport.MapLookup parameterLookup(long nowMs) throws Exception {
        if (lookup != null && (refresher != null || nowMs - lookupLoadedAtMs < settings.parameterRefreshMs)) return lookup;
        try {
            lookup = CplmParameterUpdateReader.lookupFrom(parameters.read());
            lookupLoadedAtMs = nowMs;
        } catch (Exception e) {
            if (lookup == null) throw e;
            lookupLoadedAtMs = nowMs;                     // retry after the refresh interval, not on every request
            System.out.println("CPLM_EVALUATION_PARAMETERS_STALE reason=\"" + message(e) + "\"");
        }
        return lookup;
    }

    private void fail(Collector<String> out, EvaluationRequest r, String error, int samples, long t0) {
        long now = clock.nowMs();
        out.collect(EvaluationStatus.failed(r, error, samples, now - t0, now));
        System.out.println("CPLM_EVALUATION_FAILED run=" + r.analysisRunId + " loop=" + r.loopId + " error=\"" + error + "\"");
    }

    private static String message(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }
}
