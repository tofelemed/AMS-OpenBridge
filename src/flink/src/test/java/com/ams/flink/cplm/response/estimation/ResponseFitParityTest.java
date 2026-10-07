package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * CHG-075 parity: the exact-ZOH speed-ups (rebased times, microsecond cache key, closed-form order 1,
 * cursor breakpoints) must not move a fit. The EXPECTED values were captured from the code BEFORE the
 * speed-ups (run with -Dparity.capture=true to print them again) on fixed-seed uniform and +-50 ms
 * jittered events at the epoch-seconds scale the job uses, plus one near-zero time base.
 */
public class ResponseFitParityTest {
    static final double REL = 1e-9;
    private static final boolean CAPTURE = Boolean.getBoolean("parity.capture");
    /** -Dparity.verbose=true prints every case's relative differences; normal runs stay quiet. */
    private static final boolean VERBOSE = Boolean.getBoolean("parity.verbose");
    /** fit cases: {gain, theta, tau, tau2, y0, v0, objective}; simulation cases: {sum, y[10], y[50], y[120], y[200], y[299]}. */
    static final Map<String, double[]> EXPECTED = new LinkedHashMap<>();

    static {
        // captured from the pre-CHG-075 code at d12a44cf (see the class comment)
        EXPECTED.put("FOPDT/uniform-epoch", new double[] {2.996789711065846, 4.29563482495163, 20.093039657988598, Double.NaN, 100.00949403885369, 0.0, 11.72163025251193});
        EXPECTED.put("FOPDT/jitter-epoch", new double[] {2.9982231015853236, 4.245384837545215, 20.140664734652873, Double.NaN, 100.0032589392652, 0.0, 11.713421210686468});
        EXPECTED.put("FOPDT/jitter-zero", new double[] {2.9982231040281984, 4.245384837545215, 20.14066482052146, Double.NaN, 100.00325892855149, 0.0, 11.713421208241781});
        EXPECTED.put("SOPDT/uniform-epoch", new double[] {1.996527422804639, 6.6563145999495275, 15.0130447472368, 5.153350551783177, 100.01012194485395, 0.0, 11.7124541700673});
        EXPECTED.put("SOPDT/jitter-epoch", new double[] {1.9963744964633223, 6.7184270002523645, 15.039411022435477, 5.074671489553827, 100.01102907062416, 0.0, 11.712909716201917});
        EXPECTED.put("IPDT/uniform-epoch", new double[] {0.010060941911434616, 8.118960624631969, Double.NaN, Double.NaN, 99.9984428492174, 6.883077373646407E-4, 0.11708394338976202});
        EXPECTED.put("IPDT/jitter-epoch", new double[] {0.01001576249745074, 8.212129225086224, Double.NaN, Double.NaN, 100.00078650569455, 9.16758816852492E-4, 0.1172082415939135});
        EXPECTED.put("SIM FOPDT/jitter-epoch", new double[] {33850.894298027146, 99.98896700000763, 110.66033879440738, 114.96717979332867, 115.17649972931669, 115.2779298635256});
        EXPECTED.put("SIM FOPDT/jitter-zero", new double[] {33850.89429620744, 99.988967, 110.66033875720566, 114.96717979239189, 115.1764997291206, 115.27792986349881});
        EXPECTED.put("SIM SOPDT/jitter-epoch", new double[] {32556.139831362423, 99.98896700000763, 106.68889380177814, 110.06706991949775, 110.17876720634257, 110.27794678980078});
        EXPECTED.put("SIM SOPDT/jitter-zero", new double[] {32556.13983107052, 99.988967, 106.68889378566887, 110.06706991934269, 110.17876720617156, 110.27794678977409});
        EXPECTED.put("SIM SO_UNDERDAMPED/jitter-epoch", new double[] {31399.272377122237, 99.98896700000763, 105.16252624816123, 105.0885019324534, 105.17895168185164, 105.27794709338075});
        EXPECTED.put("SIM SO_UNDERDAMPED/jitter-zero", new double[] {31399.272376591525, 99.988967, 105.1625262855218, 105.08850193261543, 105.17895168167665, 105.27794709335404});
        EXPECTED.put("SIM IPDT/jitter-epoch", new double[] {31864.581820461033, 99.98896700000763, 101.06757200384139, 104.63843900179863, 108.71502200627327, 113.76529699897766});
        EXPECTED.put("SIM IPDT/jitter-zero", new double[] {31864.581820000025, 99.988967, 101.067572, 104.638439, 108.715022, 113.765297});
        EXPECTED.put("SIM INTEGRATOR_LAG/jitter-epoch", new double[] {31734.450887495695, 99.98896700000763, 100.63021225686373, 104.13849602529352, 108.21502202553111, 113.26529699897861});
        EXPECTED.put("SIM INTEGRATOR_LAG/jitter-zero", new double[] {31734.450887047973, 99.988967, 100.63021225348828, 104.1384960234951, 108.21502201925784, 113.26529700000096});
    }

    private static double[] epoch(boolean jitter) {
        return ResponseFitFixtures.times(ResponseFitFixtures.EPOCH_MS, 300, 1000, jitter ? 50 : 0, 7);
    }

    private static double[] nearZero() {
        return ResponseFitFixtures.times(0, 300, 1000, 50, 7);
    }

    private static Map<String, double[]> fitCases() {
        Map<String, double[]> out = new LinkedHashMap<>();
        double[] fo = {3, 4.3, 20}, so = {2, 6.7, 15, 5}, ip = {0.01, 8.2, 0.001};
        out.put("FOPDT/uniform-epoch", fit("FOPDT", fo, epoch(false), ModelFamily.FOPDT));
        out.put("FOPDT/jitter-epoch", fit("FOPDT", fo, epoch(true), ModelFamily.FOPDT));
        out.put("FOPDT/jitter-zero", fit("FOPDT", fo, nearZero(), ModelFamily.FOPDT));
        out.put("SOPDT/uniform-epoch", fit("SOPDT", so, epoch(false), ModelFamily.SOPDT));
        out.put("SOPDT/jitter-epoch", fit("SOPDT", so, epoch(true), ModelFamily.SOPDT));
        out.put("IPDT/uniform-epoch", fit("IPDT", ip, epoch(false), ModelFamily.IPDT));
        out.put("IPDT/jitter-epoch", fit("IPDT", ip, epoch(true), ModelFamily.IPDT));
        return out;
    }

    private static double[] fit(String truth, double[] p, double[] t, ModelFamily family) {
        EventDataset d = ResponseFitFixtures.stepEvent(truth, p, t, 20, family.integrating() ? 0.02 : 0.2, 11);
        EstimationResult r = new OutputErrorEstimator().estimate(d, ResponseFitFixtures.U_BEFORE, family, ResponseFitFixtures.paritySettings());
        assertEquals(EstimationResult.State.ESTIMATED, r.state);
        EstimationResult.Candidate c = r.best();
        ProcessModel m = c.model;
        return new double[] {m.gain, m.theta, m.tau, m.tau2, c.y0, c.v0, c.objective};
    }

    private static Map<String, double[]> simCases() {
        Map<String, double[]> out = new LinkedHashMap<>();
        ProcessModel[] models = {
            ProcessModel.fopdt("OP_TO_PV", 3, 4.3, 20), ProcessModel.sopdt("OP_TO_PV", 2, 6.7, 15, 5),
            ProcessModel.underdamped("OP_TO_PV", 1, 3.3, 0.3, 0.2), ProcessModel.ipdt("OP_TO_PV", 0.01, 8.2),
            ProcessModel.integratorLag("OP_TO_PV", 0.01, 8.2, 10)};
        for (ProcessModel m : models) {
            out.put("SIM " + m.family + "/jitter-epoch", sim(m, epoch(true)));
            out.put("SIM " + m.family + "/jitter-zero", sim(m, nearZero()));
        }
        return out;
    }

    private static double[] sim(ProcessModel m, double[] t) {
        EventDataset d = ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 4.3, 20}, t, 20, 0, 1);
        ZohSimulator.Result r = ZohSimulator.simulate(m, d.t, d.u, ResponseFitFixtures.U_BEFORE, 100, 0.001, d.t0, 60);
        double sum = 0;
        for (int i = 0; i < t.length; i++) {
            assertTrue(r.valid[i]);
            sum += r.yHat[i];
        }
        return new double[] {sum, r.yHat[10], r.yHat[50], r.yHat[120], r.yHat[200], r.yHat[299]};
    }

    static double relDiff(double a, double b) {
        if (Double.isNaN(a) && Double.isNaN(b)) return 0;
        if (a == b) return 0;
        return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
    }

    private static void check(Map<String, double[]> actual) {
        StringBuilder failures = new StringBuilder();
        for (Map.Entry<String, double[]> e : actual.entrySet()) {
            if (CAPTURE) {
                StringBuilder sb = new StringBuilder("        EXPECTED.put(\"" + e.getKey() + "\", new double[] {");
                for (int i = 0; i < e.getValue().length; i++) sb.append(i == 0 ? "" : ", ").append(literal(e.getValue()[i]));
                System.out.println(sb.append("});"));
                continue;
            }
            double[] want = EXPECTED.get(e.getKey()), got = e.getValue();
            assertTrue("no captured value for " + e.getKey(), want != null);
            StringBuilder sb = new StringBuilder("PARITY " + e.getKey() + " rel:");
            for (int i = 0; i < want.length; i++) {
                double rel = relDiff(want[i], got[i]);
                sb.append(' ').append(String.format("%.2e", rel));
                if (rel > REL) failures.append(e.getKey()).append('[').append(i).append("] want ").append(want[i]).append(" got ").append(got[i])
                        .append(" rel ").append(rel).append("; ");
            }
            if (VERBOSE) System.out.println(sb);
        }
        assertTrue(failures.toString(), failures.length() == 0);
    }

    private static String literal(double v) {
        return Double.isNaN(v) ? "Double.NaN" : Double.toString(v);
    }

    @Test
    public void fitsMatchThePreSpeedUpParametersAndObjective() {
        check(fitCases());
    }

    @Test
    public void simulationsMatchThePreSpeedUpOutputs() {
        check(simCases());
    }
}
