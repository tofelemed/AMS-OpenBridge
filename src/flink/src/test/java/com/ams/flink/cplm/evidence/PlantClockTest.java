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

    // CHG-106: a plant on 06:00 / 18:00 shifts. Iran 06:00 = 02:30Z, 18:00 = 14:30Z.
    @Test public void dayStartMovesTheBoundariesToTheShifts() {
        PlantClock c = PlantClock.parse("IR").withDayStart("06:00");
        assertEquals(java.time.LocalTime.of(6, 0), c.dayStart());
        assertTrue(c.isBoundary("24h", at("2026-11-23T02:30:00Z")));       // 23 Nov 06:00
        assertFalse(c.isBoundary("24h", at("2026-11-23T14:30:00Z")));      // 18:00 is a 12 h boundary only
        assertTrue(c.isBoundary("12h", at("2026-11-23T02:30:00Z")));       // night shift ends
        assertTrue(c.isBoundary("12h", at("2026-11-23T14:30:00Z")));       // day shift ends
        assertFalse("midnight no longer bounds", c.isBoundary("24h", at("2026-11-22T20:30:00Z")));
        assertFalse("noon no longer bounds", c.isBoundary("12h", at("2026-11-23T08:30:00Z")));
        assertEquals("2026-11-23T06:00:00+03:30", c.localIso(at("2026-11-23T02:30:00Z")));
    }

    @Test public void dayStartDefaultsToMidnight() {
        assertEquals(java.time.LocalTime.MIDNIGHT, PlantClock.parse("IR").dayStart());
        for (String blank : new String[]{null, "", "  "}) {
            PlantClock c = PlantClock.parse("UTC").withDayStart(blank);
            assertTrue(c.isBoundary("24h", at("2026-11-03T00:00:00Z")));
            assertTrue(c.isBoundary("12h", at("2026-11-03T12:00:00Z")));
        }
        PlantClock late = PlantClock.parse("UTC").withDayStart("18:30");
        assertTrue("12 h after 18:30 wraps to 06:30", late.isBoundary("12h", at("2026-11-03T06:30:00Z")));
    }

    @Test public void badDayStartIsRejected() {
        for (String bad : new String[]{"6", "06:07", "24:00", "06:60", "6am", "-01:00"}) {
            try {
                PlantClock.parse("UTC").withDayStart(bad);
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
