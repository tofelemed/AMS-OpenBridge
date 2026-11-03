package com.ams.flink.cplm.evidence;

import org.junit.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.Assert.*;

/** CHG-102 phase 5a: the plant clock decides which window ends are 12h / 24h boundaries. */
public class PlantClockTest {
    private static long at(String iso) { return Instant.parse(iso).toEpochMilli(); }

    @Test public void utcMidnightAndNoon() {
        PlantClock c = PlantClock.parse("UTC");
        assertTrue(c.isBoundary("24h", at("2026-11-03T00:00:00Z")));
        assertFalse(c.isBoundary("24h", at("2026-11-03T12:00:00Z")));
        assertTrue(c.isBoundary("12h", at("2026-11-03T00:00:00Z")));
        assertTrue(c.isBoundary("12h", at("2026-11-03T12:00:00Z")));
        assertFalse(c.isBoundary("12h", at("2026-11-03T12:15:00Z")));
        assertFalse("a millisecond off is not a boundary", c.isBoundary("24h", at("2026-11-03T00:00:00Z") + 1));
    }

    @Test public void iranIsFixedPlusThreeThirty() {
        for (String spec : new String[]{"IR", "Iran", "iran", "Asia/Tehran", "+03:30"}) {
            PlantClock c = PlantClock.parse(spec);
            assertEquals(spec, ZoneOffset.ofHoursMinutes(3, 30), c.zone);
            assertTrue(spec, c.isBoundary("24h", at("2026-11-02T20:30:00Z")));
            assertFalse(spec, c.isBoundary("24h", at("2026-11-03T08:30:00Z")));
            assertTrue(spec, c.isBoundary("12h", at("2026-11-02T20:30:00Z")));
            assertTrue(spec, c.isBoundary("12h", at("2026-11-03T08:30:00Z")));
            assertFalse(spec, c.isBoundary("12h", at("2026-11-03T00:00:00Z")));
            // summer: no DST since 2022, still +03:30
            assertTrue(spec, c.isBoundary("24h", at("2026-07-01T20:30:00Z")));
            assertNull("20:30Z is on the 15-min grid", c.quarterHourWarning(Instant.parse("2026-07-01T00:00:00Z")));
        }
        assertEquals("2026-11-03T00:00:00+03:30", PlantClock.parse("IR").localIso(at("2026-11-02T20:30:00Z")));
    }

    @Test public void negativeOffset() {
        PlantClock c = PlantClock.parse("-05:00");
        assertTrue(c.isBoundary("24h", at("2026-11-03T05:00:00Z")));
        assertEquals("2026-11-03T00:00:00-05:00", c.localIso(at("2026-11-03T05:00:00Z")));
    }

    @Test public void localParsesToTheJvmZone() {
        assertEquals(ZoneId.systemDefault(), PlantClock.parse("local").zone);
        assertEquals(ZoneId.systemDefault(), PlantClock.parse("LOCAL").zone);
    }

    @Test public void berlinDstDayFollowsTheRules() {
        PlantClock c = PlantClock.parse("Europe/Berlin");
        // 2026-03-29: CET (+1) until 02:00, then CEST (+2)
        assertTrue(c.isBoundary("24h", at("2026-03-28T23:00:00Z")));    // 29 Mar 00:00 CET
        assertTrue(c.isBoundary("12h", at("2026-03-29T10:00:00Z")));    // 29 Mar 12:00 CEST
        assertTrue(c.isBoundary("24h", at("2026-03-29T22:00:00Z")));    // 30 Mar 00:00 CEST
        assertFalse(c.isBoundary("24h", at("2026-03-29T23:00:00Z")));
        assertEquals("2026-03-30T00:00:00+02:00", c.localIso(at("2026-03-29T22:00:00Z")));
    }

    @Test public void otherKindsNeverBound() {
        PlantClock c = PlantClock.parse("UTC");
        assertFalse(c.isBoundary("4h", at("2026-11-03T00:00:00Z")));
        assertFalse(c.isBoundary("1h", at("2026-11-03T00:00:00Z")));
        assertFalse(c.isBoundary(null, at("2026-11-03T00:00:00Z")));
    }

    @Test public void garbageIsRejected() {
        for (String bad : new String[]{"Mars/Olympus", "+25:00", "+3:3", "", "   ", null, "UTC+99"}) {
            try {
                PlantClock.parse(bad);
                fail("accepted " + bad);
            } catch (IllegalArgumentException expected) {
                // ok
            }
        }
    }

    @Test public void offGridZoneWarns() {
        assertNotNull(PlantClock.parse("+05:20").quarterHourWarning(Instant.now()));
        assertNull("Nepal +05:45 is 23 quarter hours", PlantClock.parse("+05:45").quarterHourWarning(Instant.now()));
        assertNull(PlantClock.parse("+05:30").quarterHourWarning(Instant.now()));
        assertNull(PlantClock.parse("UTC").quarterHourWarning(Instant.now()));
    }
}
