package com.ams.flink.cplm.evidence;

/** CHG-049: which cycles get a per-cycle artifact. Evenly spaced across the window, both ends kept; k <= 0 or k >= n keeps all. */
public final class CycleSampling {
    private CycleSampling() {}

    public static int[] pick(int n, int k) {
        if (n <= 0) return new int[0];
        if (k <= 0 || k >= n) { int[] all = new int[n]; for (int i = 0; i < n; i++) all[i] = i; return all; }
        if (k == 1) return new int[] {0};
        int[] out = new int[k];
        for (int i = 0; i < k; i++) out[i] = (int) Math.round(i * (n - 1) / (double) (k - 1));
        return out;
    }
}
