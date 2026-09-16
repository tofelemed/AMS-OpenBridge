package com.ams.flink.cplm.identity;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * v2.5 Task 1G.2 (spec v6 R19 / R26): the immutable identity of a method run.
 *
 * <p>{@code method_run_id} is a name-based (RFC 4122 v5, SHA-1) UUID of
 * {@code loop | gate | method | version | from | to | bundle_hash | context_revision | result_revision},
 * so the same evaluation always has the same id (retries and redeliveries are idempotent) and
 * a different configuration or support is a different run - never an overwrite (spec §1.6).
 * Every gate of one result gets its own id; the result row stores them as {@code method_run_ids}.
 */
public final class RunIdentity {
    /** Fixed namespace for Traverse CPA method runs (never change: ids would move). */
    public static final UUID NAMESPACE = UUID.fromString("7a3c2f1e-4b5d-5e6f-8a9b-0c1d2e3f4a5b");

    private RunIdentity() {
    }

    public static String methodRunId(String loopId, String gate, String methodId, String methodVersion,
                                     long fromMs, long toMs, String bundleHash, int contextRevision, int resultRevision) {
        String name = String.join("|",
                nz(loopId), nz(gate), nz(methodId), nz(methodVersion),
                Long.toString(fromMs), Long.toString(toMs),
                nz(bundleHash), Integer.toString(contextRevision), Integer.toString(resultRevision));
        return uuidV5(NAMESPACE, name).toString();
    }

    /** One id per gate of the catalogue, in evaluation order (G0 .. G15, G2r after G2). */
    public static Map<String, String> forGates(String loopId, long fromMs, long toMs, String bundleHash,
                                               int contextRevision, int resultRevision) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String gate : GateMethodCatalog.GATES) {
            out.put(gate, methodRunId(loopId, gate, GateMethodCatalog.methodId(gate), GateMethodCatalog.methodVersion(gate),
                    fromMs, toMs, bundleHash, contextRevision, resultRevision));
        }
        return out;
    }

    /** RFC 4122 name-based UUID, SHA-1 (version 5). */
    public static UUID uuidV5(UUID namespace, String name) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            ByteBuffer ns = ByteBuffer.allocate(16);
            ns.putLong(namespace.getMostSignificantBits());
            ns.putLong(namespace.getLeastSignificantBits());
            md.update(ns.array());
            md.update(name.getBytes(StandardCharsets.UTF_8));
            byte[] h = md.digest();
            h[6] = (byte) ((h[6] & 0x0f) | 0x50);   // version 5
            h[8] = (byte) ((h[8] & 0x3f) | 0x80);   // RFC variant
            ByteBuffer bb = ByteBuffer.wrap(h, 0, 16);
            return new UUID(bb.getLong(), bb.getLong());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 unavailable", e);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
