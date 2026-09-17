package com.ams.flink.cplm.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * v2.5 Task 3C.1 (R17): a parse failure or a rejected control-plane record is counted, never
 * swallowed. The counters are exported as the {@code cplm_config_rejected} metric group by the
 * broadcast function and readable here for tests and logs.
 */
public final class ConfigRejections {
    private static final Map<String, AtomicLong> COUNTS = new ConcurrentHashMap<>();

    private ConfigRejections() {}

    public static void count(String reason) {
        COUNTS.computeIfAbsent(reason, k -> new AtomicLong()).incrementAndGet();
        System.out.println("CPLM_CONFIG_REJECTED reason=" + reason + " total=" + COUNTS.get(reason).get());
    }

    public static long total(String reason) {
        AtomicLong c = COUNTS.get(reason);
        return c == null ? 0 : c.get();
    }

    public static long total() {
        long t = 0;
        for (AtomicLong c : COUNTS.values()) t += c.get();
        return t;
    }

    public static void reset() {
        COUNTS.clear();
    }
}
