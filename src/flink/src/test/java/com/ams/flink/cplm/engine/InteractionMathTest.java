package com.ams.flink.cplm.engine;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2F.1 (spec §2.13 / R09; NR-028): G13 is an aligned peer analysis - cross-correlation
 * over a bounded lag and magnitude-squared coherence in the loop's band on the shared valid
 * support. A configured link proves nothing on its own: an unobserved peer is UNAVAILABLE, an
 * unrelated peer is NO_INTERACTION, and only a coherent, correlated peer is INTERACTION_DETECTED.
 */
public class InteractionMathTest {
    private static final double DT = 5.0;
    private static final int N = 2880;                                       // 4 h at 5 s

    private static long[] grid(long t0Ms) {
        long[] t = new long[N];
        for (int i = 0; i < N; i++) t[i] = t0Ms + (long) (i * DT * 1000);
        return t;
    }

    private static double[] oscillation(double periodS, double amp, double noise, long seed, double phaseShiftS) {
        Random rnd = new Random(seed);
        double[] x = new double[N];
        for (int i = 0; i < N; i++) x[i] = amp * Math.sin(2 * Math.PI * (i * DT - phaseShiftS) / periodS) + noise * rnd.nextGaussian();
        return x;
    }

    private static InteractionMath.Config cfg() {
        InteractionMath.Config c = new InteractionMath.Config();
        c.lagMaxS = 600;
        c.coherenceMin = 0.6;
        c.xcorrMin = 0.5;
        c.minCompatibleSupportS = 1800;
        c.maxPeers = 12;
        c.segmentSamples = 256;
        c.overlapFraction = 0.5;
        c.bandLowHz = 1.0 / 3600;
        c.bandHighHz = 1.0 / 60;
        return c;
    }

    private static InteractionMath.Series own(long t0) {
        boolean[] valid = new boolean[N];
        Arrays.fill(valid, true);
        return new InteractionMath.Series("FIC10302", grid(t0), oscillation(300, 2.0, 0.1, 1, 0), valid, DT);
    }

    @Test
    public void aDelayedCopyOfTheLoopIsDetectedWithItsLagAndCoherence() {
        long t0 = 1_789_500_000_000L;
        boolean[] valid = new boolean[N];
        Arrays.fill(valid, true);
        // the peer follows the loop by 60 s (12 samples) with its own noise
        InteractionMath.Series peer = new InteractionMath.Series("TIC10305", grid(t0), oscillation(300, 1.5, 0.1, 2, 60), valid, DT);
        InteractionMath.Result r = InteractionMath.analyse(own(t0), Collections.singletonList(peer), cfg());
        assertEquals("INTERACTION_DETECTED", r.state);
        assertEquals(1, r.peers.size());
        InteractionMath.Peer p = r.peers.get(0);
        assertEquals("ANALYSED", p.state);
        assertEquals("the lag that maximises the cross-correlation", 60.0, p.lagS, DT);
        assertTrue("peak xcorr " + p.peakXcorr, p.peakXcorr > 0.9);
        assertTrue("coherence in band " + p.coherenceBandMax, p.coherenceBandMax > 0.9);
        assertEquals("PEER_FOLLOWS_LOOP", p.direction);
        assertTrue(p.supportS >= 1800);
        assertEquals(N, p.alignedTsMs.length);
        assertEquals(N, p.supportMask.length);
        assertEquals(p.lagAxisS.length, p.xcorr.length);
        assertEquals(p.freqHz.length, p.coherence.length);
        assertTrue("alternative explanations are listed, not a causal claim", r.alternativeExplanations.size() >= 2);
        assertEquals("G13.ALIGNED_PEER_ANALYSIS_V1", InteractionMath.METHOD_ID);
    }

    @Test
    public void anUnrelatedPeerIsNoInteractionNotEvidenceOfDisturbance() {
        long t0 = 1_789_500_000_000L;
        boolean[] valid = new boolean[N];
        Arrays.fill(valid, true);
        Random rnd = new Random(9);
        double[] noise = new double[N];
        for (int i = 0; i < N; i++) noise[i] = rnd.nextGaussian();
        InteractionMath.Series peer = new InteractionMath.Series("PIC10310", grid(t0), noise, valid, DT);
        InteractionMath.Result r = InteractionMath.analyse(own(t0), Collections.singletonList(peer), cfg());
        assertEquals("NO_INTERACTION", r.state);
        InteractionMath.Peer p = r.peers.get(0);
        assertEquals("ANALYSED", p.state);
        assertTrue("peak xcorr " + p.peakXcorr, Math.abs(p.peakXcorr) < 0.3);
        assertTrue("coherence in band " + p.coherenceBandMax, p.coherenceBandMax < 0.6);
        assertEquals("NONE", p.direction);
    }

    @Test
    public void anUnobservedPeerMakesTheGateUnavailableNeverAVerdict() {
        long t0 = 1_789_500_000_000L;
        InteractionMath.Series missing = new InteractionMath.Series("LIC10320", new long[0], new double[0], new boolean[0], DT);
        InteractionMath.Result r = InteractionMath.analyse(own(t0), Collections.singletonList(missing), cfg());
        assertEquals("UNAVAILABLE", r.state);
        assertEquals("PEER_UNOBSERVED", r.reason);
        assertEquals("PEER_UNOBSERVED", r.peers.get(0).state);
        assertEquals(0, r.peers.get(0).supportMask.length);
    }

    @Test
    public void tooLittleSharedSupportIsInsufficientAndNoPeersIsNotConfigured() {
        long t0 = 1_789_500_000_000L;
        long[] fewT = Arrays.copyOf(grid(t0), 40);
        double[] fewY = Arrays.copyOf(oscillation(300, 1.5, 0.1, 2, 60), 40);
        boolean[] fewValid = new boolean[40];
        Arrays.fill(fewValid, true);
        InteractionMath.Series sparse = new InteractionMath.Series("TIC10305", fewT, fewY, fewValid, DT);
        InteractionMath.Result r = InteractionMath.analyse(own(t0), Collections.singletonList(sparse), cfg());
        assertEquals("UNAVAILABLE", r.state);
        assertEquals("INSUFFICIENT_SUPPORT", r.peers.get(0).state);

        InteractionMath.Result none = InteractionMath.analyse(own(t0), new ArrayList<>(), cfg());
        assertEquals("NOT_CONFIGURED", none.state);
        assertEquals("NO_PEER_LINKS", none.reason);
    }

    @Test
    public void peersBeyondMaxPeersAreNotAnalysedAndTheOmissionIsStated() {
        long t0 = 1_789_500_000_000L;
        boolean[] valid = new boolean[N];
        Arrays.fill(valid, true);
        List<InteractionMath.Series> peers = new ArrayList<>();
        for (int i = 0; i < 3; i++) peers.add(new InteractionMath.Series("P" + i, grid(t0), oscillation(300, 1.0, 0.1, 10 + i, 30), valid, DT));
        InteractionMath.Config c = cfg();
        c.maxPeers = 2;
        InteractionMath.Result r = InteractionMath.analyse(own(t0), peers, c);
        assertEquals(3, r.peers.size());
        assertEquals("NOT_ANALYSED_MAX_PEERS", r.peers.get(2).state);
        assertNotNull(r.state);
    }

    @Test
    public void crossSpectrumCoherenceOfIdenticalSignalsIsOne() {
        double[] x = oscillation(300, 2.0, 0.0, 1, 0);
        WelchPsd.Cross c = WelchPsd.cross(x, x.clone(), DT, 256, 0.5);
        assertEquals(c.freqHz.length, c.coherence.length);
        int k = (int) Math.round((1.0 / 300) / c.resolutionHz);
        assertEquals(1.0, c.coherence[k], 1e-9);
    }
}
