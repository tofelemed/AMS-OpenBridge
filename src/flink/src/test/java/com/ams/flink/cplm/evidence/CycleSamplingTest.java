package com.ams.flink.cplm.evidence;

import org.junit.Test;
import static org.junit.Assert.*;

public class CycleSamplingTest {
    @Test public void emptyAndSingle() {
        assertArrayEquals(new int[0], CycleSampling.pick(0, 12));
        assertArrayEquals(new int[] {0}, CycleSampling.pick(1, 12));
    }
    @Test public void capAtOrAboveNKeepsAll() {
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, CycleSampling.pick(5, 12));
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, CycleSampling.pick(5, 0));   // 0 = no cap
    }
    @Test public void evenSpacingKeepsEnds() {
        int[] p = CycleSampling.pick(2160, 12);
        assertEquals(12, p.length);
        assertEquals(0, p[0]);
        assertEquals(2159, p[11]);
        for (int i = 1; i < p.length; i++) assertTrue(p[i] > p[i - 1]);
    }
    @Test public void policyParsesMaxCyclesInAnyOrder() {
        assertEquals(12, EvidencePolicy.fromArgs(new String[0]).maxCycles);
        assertEquals(5, EvidencePolicy.fromArgs(new String[] {"--evidence-max-cycles", "5", "--evidence-emit", "all"}).maxCycles);
        assertEquals(EvidencePolicy.Mode.ALL, EvidencePolicy.fromArgs(new String[] {"--evidence-max-cycles", "5", "--evidence-emit", "all"}).mode);
        assertEquals(12, EvidencePolicy.fromArgs(new String[] {"--evidence-max-cycles", "x"}).maxCycles);
        assertEquals(0, EvidencePolicy.fromArgs(new String[] {"--evidence-emit", "none", "--evidence-max-cycles", "0"}).maxCycles);
    }
    // CHG-049 (final review I1): the accepted cycles are picked first
    private static boolean[] flags(int n, int... on) { boolean[] f = new boolean[n]; for (int i : on) f[i] = true; return f; }
    private static boolean has(int[] p, int v) { for (int i : p) if (i == v) return true; return false; }
    private static void sortedDistinct(int[] p) { for (int i = 1; i < p.length; i++) assertTrue("sorted, distinct", p[i] > p[i - 1]); }

    @Test public void everyAcceptedKeptWhenTheyFit() {
        int[] p = CycleSampling.pick(100, 5, flags(100, 0, 10, 50, 70, 99));   // count(accepted) == k, ends among them
        assertArrayEquals(new int[] {0, 10, 50, 70, 99}, p);
        int[] q = CycleSampling.pick(200, 12, flags(200, 3, 4, 5, 77, 150));    // count(accepted) <= k - 2
        for (int a : new int[] {3, 4, 5, 77, 150}) assertTrue("accepted " + a, has(q, a));
        assertEquals(12, q.length);
        sortedDistinct(q);
    }
    @Test public void sparseAcceptedStillPicked() {
        boolean[] f = new boolean[2160];
        for (int i = 5; i < 2160; i += 10) f[i] = true;                          // 10 % accepted, never on the even grid
        int[] p = CycleSampling.pick(2160, 12, f);
        int accepted = 0;
        for (int i : p) if (f[i]) accepted++;
        assertTrue("at least one accepted", accepted >= 1);
        assertEquals(12, p.length);
        sortedDistinct(p);
    }
    @Test public void moreAcceptedThanSlotsSpacedEvenly() {
        boolean[] f = new boolean[500];
        java.util.Arrays.fill(f, 100, 400, true);
        int[] p = CycleSampling.pick(500, 12, f);
        assertEquals(0, p[0]);
        assertEquals(499, p[11]);
        for (int i = 1; i < 11; i++) assertTrue(f[p[i]]);
        assertTrue(p[1] <= 110 && p[10] >= 390);                                  // spread over the accepted run
        sortedDistinct(p);
    }
    @Test public void endsKeptAndNoAcceptedFallsBackToEvenSpacing() {
        int[] p = CycleSampling.pick(2160, 12, new boolean[2160]);
        assertArrayEquals(CycleSampling.pick(2160, 12), p);
        int[] q = CycleSampling.pick(50, 3, flags(50, 20, 21, 22));
        assertEquals(0, q[0]);
        assertEquals(49, q[2]);
        sortedDistinct(q);
    }
    @Test public void priorityOverloadKeepsTheUncappedCases() {
        assertArrayEquals(new int[] {0, 1, 2}, CycleSampling.pick(3, 12, flags(3, 1)));
        assertArrayEquals(new int[] {1}, CycleSampling.pick(5, 1, flags(5, 1)));
        assertArrayEquals(CycleSampling.pick(9, 4), CycleSampling.pick(9, 4, null));
    }
}
