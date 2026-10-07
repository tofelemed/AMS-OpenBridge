package com.ams.flink.cplm.response.estimation;

/**
 * CHG-075: the fit's wall-clock deadline passed (or the task thread was interrupted) - unwind the fit at
 * once. Unchecked so it crosses the residual lambdas and commons-math's LM untouched; BoundedLm re-throws it
 * before its generic catch, and ResponseEvaluator turns it into BUDGET_EXCEEDED (never a partial model).
 * The stage is where the fit was when it stopped (e.g. "OE_THETA 12/121"), set by the outermost loop.
 */
public final class FitBudgetExceeded extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private String stage = "";

    public FitBudgetExceeded(String message) {
        super(message, null, false, false);              // no stack trace: it is control flow, thrown often under load
    }

    /** Throws when the deadline (System.nanoTime() scale; 0 = none) has passed or the thread is interrupted. */
    public static void check(long deadlineNanos) {
        if (deadlineNanos == 0) return;
        if (Thread.currentThread().isInterrupted()) throw new FitBudgetExceeded("INTERRUPTED");
        if (System.nanoTime() - deadlineNanos > 0) throw new FitBudgetExceeded("DEADLINE");
    }

    /** Records the stage once - the innermost loop that knows it wins - and returns this for re-throwing. */
    public FitBudgetExceeded atStage(String s) {
        if (stage.isEmpty()) stage = s;
        return this;
    }

    public String stage() { return stage; }

    /** True when the task thread was interrupted (Flink cancel), false when the deadline passed. */
    public boolean interrupted() { return "INTERRUPTED".equals(getMessage()); }
}
