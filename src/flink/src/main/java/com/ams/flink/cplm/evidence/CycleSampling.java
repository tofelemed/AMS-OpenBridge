package com.ams.flink.cplm.evidence;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

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

    /**
     * CHG-049 (final review I1): the priority (G7 accepted) cycles first, so a capped window never hides the
     * cycles behind the verdict. Claims in order: when k >= 2 the window's first and last cycle; then the
     * priority cycles (evenly spaced among themselves when they do not all fit); then the rest, evenly spaced.
     * Sorted and distinct. No priority cycle, or a null / wrong-length flag array, is plain {@link #pick(int, int)}.
     */
    public static int[] pick(int n, int k, boolean[] priority) {
        if (priority == null || priority.length != n || n <= 0 || k <= 0 || k >= n || !any(priority)) return pick(n, k);
        TreeSet<Integer> chosen = new TreeSet<>();
        if (k >= 2) { chosen.add(0); chosen.add(n - 1); }
        List<Integer> preferred = new ArrayList<>(), rest = new ArrayList<>();
        for (int i = 0; i < n; i++) if (!chosen.contains(i)) (priority[i] ? preferred : rest).add(i);
        fill(chosen, preferred, k);
        fill(chosen, rest, k);
        int[] out = new int[chosen.size()];
        int j = 0;
        for (int i : chosen) out[j++] = i;
        return out;
    }

    private static boolean any(boolean[] flags) {
        for (boolean f : flags) if (f) return true;
        return false;
    }

    /** Adds up to k - chosen.size() of the candidates: all of them when they fit, else evenly spaced. */
    private static void fill(TreeSet<Integer> chosen, List<Integer> candidates, int k) {
        int room = k - chosen.size();
        if (room <= 0 || candidates.isEmpty()) return;
        for (int i : pick(candidates.size(), room)) chosen.add(candidates.get(i));
    }
}
