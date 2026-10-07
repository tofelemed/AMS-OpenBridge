package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** CHG-075: every long loop of a fit honours the deadline and the task thread's interrupt flag. */
public class FitDeadlineTest {
    private static long expired() {
        return System.nanoTime() - 1;
    }

    private static EventDataset fopdtEvent() {
        double[] t = ResponseFitFixtures.times(ResponseFitFixtures.EPOCH_MS, 300, 1000, 50, 7);
        return ResponseFitFixtures.stepEvent("FOPDT", new double[] {3, 4.3, 20}, t, 20, 0.2, 11);
    }

    @Test
    public void theSimulatorStopsAtTheDeadline() {
        EventDataset d = fopdtEvent();
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3, 4.3, 20);
        ZohSimulator.simulate(m, d.t, d.u, 40, 100, 0, d.t0, 60, 0);                   // 0 = no deadline
        try {
            ZohSimulator.simulate(m, d.t, d.u, 40, 100, 0, d.t0, 60, expired());
            fail("an expired deadline must stop the simulation");
        } catch (FitBudgetExceeded expected) {
            assertEquals("DEADLINE", expected.getMessage());
        }
    }

    @Test
    public void boundedLmReThrowsTheDeadlineInsteadOfReturningP0() {
        AtomicInteger calls = new AtomicInteger();
        BoundedLm.Residuals r = p -> {
            if (calls.incrementAndGet() > 3) throw new FitBudgetExceeded("DEADLINE");
            return new double[] {p[0] - 1, p[0] - 2, p[0] - 3};
        };
        try {
            BoundedLm.fit(r, new double[] {0.5}, new double[] {-10}, new double[] {10}, 200, 4000, 0.01, 1e6, 0);
            fail("the generic catch turned the deadline into a fit at p0");
        } catch (FitBudgetExceeded expected) {
            assertTrue(calls.get() > 3);
        }
        try {
            BoundedLm.fit(p -> new double[] {p[0]}, new double[] {0.5}, new double[] {-10}, new double[] {10}, 200, 4000, 0.01, 1e6, expired());
            fail("every LM evaluation checks the deadline");
        } catch (FitBudgetExceeded expected) {
            assertEquals("DEADLINE", expected.getMessage());
        }
    }

    @Test
    public void theOeDelayProfileStopsAndNamesTheThetaReached() {
        EstimatorSettings s = ResponseFitFixtures.paritySettings();
        s.deadlineNanos = expired();
        try {
            new OutputErrorEstimator().estimate(fopdtEvent(), 40, ModelFamily.FOPDT, s);
            fail("an expired deadline must stop the OE fit");
        } catch (FitBudgetExceeded expected) {
            assertEquals("OE_THETA 0/13", expected.stage());
        }
    }

    @Test
    public void thePemOrderAndDelayScanStopsAtTheDeadline() {
        int n = 120;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = i;
            r[i] = (i / 20) % 2 == 0 ? 50 : 55;
            u[i] = r[i];
            y[i] = i == 0 ? 50 : 0.8 * y[i - 1] + 0.2 * u[Math.max(0, i - 2)];
            v[i] = true;
        }
        EstimatorSettings s = ResponseFitFixtures.paritySettings();
        s.deadlineNanos = expired();
        try {
            new ClosedLoopPemEstimator().estimate(new EventDataset(t, y, r, u, v, 0, n - 1), 50, ModelFamily.FOPDT, s);
            fail("an expired deadline must stop the PEM scan");
        } catch (FitBudgetExceeded expected) {
            assertEquals("PEM_ORDER 1 NK 0/60", expected.stage());
        }
    }

    @Test
    public void anInterruptedTaskThreadStopsTheFit() {
        EstimatorSettings s = ResponseFitFixtures.paritySettings();
        s.deadlineNanos = System.nanoTime() + 3_600_000_000_000L;                   // an hour away
        Thread.currentThread().interrupt();
        try {
            new OutputErrorEstimator().estimate(fopdtEvent(), 40, ModelFamily.FOPDT, s);
            fail("Flink's cancel interrupts the task thread: the fit must unwind");
        } catch (FitBudgetExceeded expected) {
            assertEquals("INTERRUPTED", expected.getMessage());
            assertTrue("the interrupt flag is left for Flink", Thread.currentThread().isInterrupted());
        } finally {
            Thread.interrupted();
        }
    }
}
