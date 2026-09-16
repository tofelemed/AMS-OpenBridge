package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;

/**
 * v2.5 Task 1G.2 (R26): the {@code bundle_hash} of a result until the governed bundle
 * (Phase 3) exists - a content hash of the resolved dynamics profile VALUES the result was
 * computed under. Field order is sorted, so the hash is stable across JVMs and builds;
 * provenance ({@code profileSource}) is not a value and is excluded. Phase 3 replaces this with
 * the RFC 8785 content hash of the activated bundle; the column is the same.
 */
public final class ProfileHash {
    public static final String PREFIX = "profile:";
    public static final String LEGACY = "legacy";

    private ProfileHash() {
    }

    public static String of(CplmLoopDynamicsProfile p) {
        if (p == null) return LEGACY;
        try {
            Field[] fields = CplmLoopDynamicsProfile.class.getFields();
            Arrays.sort(fields, Comparator.comparing(Field::getName));
            StringBuilder sb = new StringBuilder();
            for (Field f : fields) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                if ("profileSource".equals(f.getName())) continue;
                Object v = f.get(p);
                sb.append(f.getName()).append('=').append(v == null ? "null" : String.valueOf(v)).append('\n');
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 8; i++) hex.append(String.format("%02x", h[i]));
            return PREFIX + hex;
        } catch (Exception e) {
            return LEGACY;
        }
    }
}
