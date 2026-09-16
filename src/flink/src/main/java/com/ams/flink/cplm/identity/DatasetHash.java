package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmNormalizedSample;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * v2.5 Task 1G.2 (R19): SHA-256 over the accepted support in event-time order -
 * {@code ts|pv|sp|op|vp|mode|quality} per sample - so a result names exactly the data it saw
 * and a replay over the same slice can prove it saw the same data (NR-056/057).
 */
public final class DatasetHash {
    public static final String EMPTY = "empty";

    private DatasetHash() {
    }

    public static String of(List<CplmNormalizedSample> samples) {
        if (samples == null || samples.isEmpty()) return EMPTY;
        List<CplmNormalizedSample> sorted = new ArrayList<>(samples);
        sorted.sort(Comparator.comparingLong((CplmNormalizedSample s) -> s.eventTsMs));
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            StringBuilder line = new StringBuilder(96);
            for (CplmNormalizedSample s : sorted) {
                line.setLength(0);
                line.append(s.eventTsMs).append('|').append(s.pv).append('|').append(s.sp).append('|').append(s.op)
                        .append('|').append(s.vp == null ? "null" : String.valueOf(s.vp))
                        .append('|').append(s.mode == null ? "" : s.mode)
                        .append('|').append(s.quality == null ? "" : s.quality).append('\n');
                md.update(line.toString().getBytes(StandardCharsets.UTF_8));
            }
            byte[] h = md.digest();
            StringBuilder hex = new StringBuilder(64);
            for (byte b : h) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return EMPTY;
        }
    }
}
