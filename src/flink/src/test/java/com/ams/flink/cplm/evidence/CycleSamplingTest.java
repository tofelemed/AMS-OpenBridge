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
}
