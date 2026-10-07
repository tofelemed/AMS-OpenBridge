package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import org.junit.Assume;
import org.junit.Test;

/**
 * CHG-075 measurement, not a regression test (run with {@code -Dtest=ResponseFitBench -Dresponse.bench=true}).
 * One production-size G12 event - a 4 h FOPDT step at 1 s sampling with +-50 ms jitter on epoch-seconds
 * times (14,400 samples, {@code -Dresponse.bench.samples}) - fitted by the OE estimator with the production
 * defaults (theta 0..600 s on a 5 s grid, tau up to 7200 s) and NO deadline. Prints the wall time and the fit.
 */
public class ResponseFitBench {
    private static final int SAMPLES = Integer.getInteger("response.bench.samples", 14_400);
    /** FOPDT (default) or SOPDT ({@code -Dresponse.bench.family}): order 2 exercises the expm cache instead of the closed form. */
    private static final String FAMILY = System.getProperty("response.bench.family", "FOPDT");

    @Test
    public void oneProductionSizeFit() {
        Assume.assumeTrue(Boolean.getBoolean("response.bench"));
        double[] t = ResponseFitFixtures.times(ResponseFitFixtures.EPOCH_MS, SAMPLES, 1000, 50, 7);
        boolean sopdt = "SOPDT".equals(FAMILY);
        EventDataset d = sopdt ? ResponseFitFixtures.stepEvent("SOPDT", new double[] {3, 37.3, 300, 60}, t, 60, 0.2, 11)
                : ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 37.3, 300}, t, 60, 0.2, 11);
        EstimatorSettings s = ResponseFitFixtures.productionSettings();
        long started = System.nanoTime();
        EstimationResult r = new OutputErrorEstimator().estimate(d, ResponseFitFixtures.U_BEFORE, sopdt ? ModelFamily.SOPDT : ModelFamily.FOPDT, s);
        double wallS = (System.nanoTime() - started) / 1e9;
        EstimationResult.Candidate c = r.best();
        System.out.printf("RESPONSE_BENCH family=%s samples=%d wall_s=%.3f state=%s gain=%s theta=%s tau=%s objective=%s%n", FAMILY, SAMPLES, wallS, r.state,
                c == null ? "-" : c.model.gain, c == null ? "-" : c.model.theta, c == null ? "-" : c.model.tau, c == null ? "-" : c.objective);
    }
}
