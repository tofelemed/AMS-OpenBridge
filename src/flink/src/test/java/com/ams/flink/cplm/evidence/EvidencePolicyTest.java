package com.ams.flink.cplm.evidence;

import org.junit.Test;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashSet;

import static org.junit.Assert.*;

/** CHG-102 phase 5a: --plant-time-zone and --evidence-boundary-kinds. */
public class EvidencePolicyTest {
    private static long at(String iso) { return Instant.parse(iso).toEpochMilli(); }

    @Test public void defaultsAreUtcAnd12h24h() {
        EvidencePolicy p = EvidencePolicy.fromArgs(new String[0]);
        assertEquals(ZoneOffset.UTC, p.plantClock.zone);
        assertEquals(new LinkedHashSet<>(Arrays.asList("12h", "24h")), p.boundaryKinds);
        assertTrue(p.boundary("24h", at("2026-11-03T00:00:00Z")));
        assertTrue(p.boundary("12h", at("2026-11-03T12:00:00Z")));
        assertFalse(p.boundary("4h", at("2026-11-03T00:00:00Z")));
        assertFalse(p.boundary("24h", at("2026-11-03T00:15:00Z")));
        assertEquals(p.boundaryKinds, new EvidencePolicy(EvidencePolicy.Mode.EPISODES).boundaryKinds);
    }

    @Test public void parsesZoneAndKindsAmongOtherArgs() {
        EvidencePolicy p = EvidencePolicy.fromArgs(new String[]{"--evidence-emit", "all", "--plant-time-zone", "IR",
                "--evidence-boundary-kinds", "24h", "--evidence-min-interval-min", "30"});
        assertEquals(EvidencePolicy.Mode.ALL, p.mode);
        assertEquals(30 * 60_000L, p.minIntervalMs);
        assertEquals(PlantClock.IRAN, p.plantClock.zone);
        assertTrue(p.boundary("24h", at("2026-11-02T20:30:00Z")));
        assertFalse("12h not configured", p.boundary("12h", at("2026-11-03T08:30:00Z")));
        assertFalse("UTC midnight is not Iran's", p.boundary("24h", at("2026-11-03T00:00:00Z")));
        // the dash-less form (as some submitters pass it) and the first value wins
        EvidencePolicy q = EvidencePolicy.fromArgs(new String[]{"plant-time-zone", "+03:30", "--plant-time-zone", "UTC"});
        assertEquals(PlantClock.IRAN, q.plantClock.zone);
    }

    @Test public void emptyNoneOrOffSwitchesBoundaryEmissionOff() {
        for (String off : new String[]{"", "  ", "none", "OFF"}) {
            EvidencePolicy p = EvidencePolicy.fromArgs(new String[]{"--evidence-boundary-kinds", off});
            assertTrue(off, p.boundaryKinds.isEmpty());
            assertFalse(off, p.boundary("24h", at("2026-11-03T00:00:00Z")));
        }
    }

    @Test public void modeNoneEmitsNoBoundaryEither() {
        EvidencePolicy p = EvidencePolicy.fromArgs(new String[]{"--evidence-emit", "none"});
        assertFalse(p.boundary("24h", at("2026-11-03T00:00:00Z")));
    }

    @Test public void unknownZoneFailsTheSubmit() {
        assertThrows(IllegalArgumentException.class,
            () -> EvidencePolicy.fromArgs(new String[]{"--plant-time-zone", "Mars/Olympus"}));
    }

    @Test public void kindsAreTrimmedAndLowerCased() {
        assertEquals(new LinkedHashSet<>(Arrays.asList("12h", "24h")), EvidencePolicy.parseKinds(" 12H , 24h ,"));
    }
}
