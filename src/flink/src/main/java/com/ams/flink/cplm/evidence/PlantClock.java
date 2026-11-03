package com.ams.flink.cplm.evidence;

import java.io.Serializable;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * CHG-102 phase 5a: the plant's wall clock, so boundary evidence lands on the plant's local midnight
 * (24h) and midnight/noon (12h), not on UTC's. Iran is a fixed +03:30 (no DST since 2022) and is never
 * looked up in the JDK's tzdata, which may predate the abolition. Job argument {@code --plant-time-zone}.
 */
public final class PlantClock implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final ZoneOffset IRAN = ZoneOffset.ofHoursMinutes(3, 30);
    private static final Pattern OFFSET = Pattern.compile("([+-])(\\d{1,2}):(\\d{2})");
    private static final long QUARTER_HOUR_S = 15L * 60L;

    /** The spec as given (for provenance and logs). */
    public final String spec;
    public final ZoneId zone;

    private PlantClock(String spec, ZoneId zone) {
        this.spec = spec;
        this.zone = zone;
    }

    public static PlantClock utc() {
        return new PlantClock("UTC", ZoneOffset.UTC);
    }

    /**
     * {@code UTC}; {@code IR}/{@code Iran}/{@code Asia/Tehran} (fixed +03:30); {@code +HH:MM}/{@code -HH:MM};
     * any IANA id; {@code local} (the JVM's default zone). Anything else throws IllegalArgumentException.
     */
    public static PlantClock parse(String spec) {
        if (spec == null || spec.trim().isEmpty()) throw new IllegalArgumentException("plant time zone is empty");
        String s = spec.trim();
        String u = s.toUpperCase(Locale.ROOT);
        if ("UTC".equals(u) || "Z".equals(u)) return new PlantClock(s, ZoneOffset.UTC);
        if ("IR".equals(u) || "IRAN".equals(u) || "ASIA/TEHRAN".equals(u)) return new PlantClock(s, IRAN);
        if ("LOCAL".equals(u)) return new PlantClock(s, ZoneId.systemDefault());
        Matcher m = OFFSET.matcher(s);
        if (m.matches()) {
            int h = Integer.parseInt(m.group(2));
            int min = Integer.parseInt(m.group(3));
            if (h > 18 || min > 59) throw new IllegalArgumentException("plant time zone offset out of range: " + s);
            int sign = "-".equals(m.group(1)) ? -1 : 1;
            return new PlantClock(s, ZoneOffset.ofHoursMinutes(sign * h, sign * min));
        }
        try {
            return new PlantClock(s, ZoneId.of(s));
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("unknown plant time zone: " + s, e);
        }
    }

    /** The plant-local time a window ends at, ISO-8601 with its offset (e.g. 2026-11-03T00:00:00+03:30). */
    public String localIso(long epochMs) {
        return ZonedDateTime.ofInstant(Instant.ofEpochMilli(epochMs), zone).toOffsetDateTime()
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    /** 12h: the window ends at local 00:00 or 12:00; 24h: at local 00:00; any other kind never. */
    public boolean isBoundary(String windowKind, long windowEndMs) {
        if (windowKind == null) return false;
        LocalTime t = ZonedDateTime.ofInstant(Instant.ofEpochMilli(windowEndMs), zone).toLocalTime();
        switch (windowKind) {
            case "24h": return t.equals(LocalTime.MIDNIGHT);
            case "12h": return t.equals(LocalTime.MIDNIGHT) || t.equals(LocalTime.NOON);
            default: return false;
        }
    }

    /**
     * The long job fires on epoch-aligned 15-minute steps, so a zone whose offset is not a whole number of
     * quarter hours never meets a boundary. Returns a warning for such a zone at {@code at}, else null.
     */
    public String quarterHourWarning(Instant at) {
        int offsetS = zone.getRules().getOffset(at).getTotalSeconds();
        if (offsetS % QUARTER_HOUR_S == 0) return null;
        return "plant time zone " + spec + " has offset " + zone.getRules().getOffset(at)
                + ", not a multiple of 15 minutes: the 15-minute timers never land on a local boundary, so no boundary evidence is emitted";
    }

    @Override
    public String toString() {
        return zone.getId();
    }
}
