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
        if (p.bundleHash != null && !p.bundleHash.isEmpty()) return p.bundleHash;     // 3C.1: the activated bundle's content hash
        try {
            Field[] fields = CplmLoopDynamicsProfile.class.getFields();
            Arrays.sort(fields, Comparator.comparing(Field::getName));
            StringBuilder sb = new StringBuilder();
            for (Field f : fields) {
                if (Modifier.isStatic(f.getModifiers())) continue;
                if ("profileSource".equals(f.getName())) continue;
                if (f.getName().startsWith("bundle")) continue;            // 3C.1: bundle identity is not a value of the profile
                Object v = f.get(p);
                sb.append(f.getName()).append('=').append(v == null ? "null" : String.valueOf(v)).append('\n');
            }
            return PREFIX + sha256Prefix(sb.toString(), 16);
        } catch (Exception e) {
            return LEGACY;
        }
    }

    /** The first {@code hexChars} hex characters of SHA-256 over the UTF-8 text (content hashes for identity fields). */
    public static String sha256Prefix(String text, int hexChars) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < h.length && hex.length() < hexChars; i++) hex.append(String.format("%02x", h[i]));
            return hex.substring(0, Math.min(hexChars, hex.length()));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
