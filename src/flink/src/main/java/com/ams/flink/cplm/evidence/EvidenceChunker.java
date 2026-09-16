package com.ams.flink.cplm.evidence;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * v2.5 Task 1G.2: the wire encoding of an evidence artifact - each column as f64
 * little-endian, concatenated, gzip-compressed, split into bounded chunks so no single Kafka
 * record exceeds the topic's message limit. Reassembly is the exact inverse; checksums are
 * SHA-256 per chunk and over the whole encoded payload.
 */
public final class EvidenceChunker {
    /** 256 KiB: comfortably under the 1 MiB topic limit once base64-wrapped in JSON. */
    public static final int DEFAULT_CHUNK_BYTES = 256 * 1024;
    public static final String ENCODING = "f64le+gzip";

    private EvidenceChunker() {
    }

    public static byte[] encode(EvidenceArtifact a) {
        int n = a.calculationSamples();
        int cols = a.columnCount();
        ByteBuffer bb = ByteBuffer.allocate(n * cols * 8).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < n; i++) bb.putDouble(a.x[i]);
        for (int i = 0; i < n; i++) bb.putDouble(a.y[i]);
        if (a.mask != null) for (int i = 0; i < n; i++) bb.putDouble(a.mask[i] ? 1.0 : 0.0);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (GZIPOutputStream gz = new GZIPOutputStream(out)) {
                gz.write(bb.array());
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("gzip failed", e);
        }
    }

    /** Inverse of {@link #encode}: columns x, y (, mask as 0/1) each of {@code n} doubles. */
    public static double[][] decode(byte[] encoded, int columns, int n) {
        try {
            ByteArrayOutputStream raw = new ByteArrayOutputStream();
            try (GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(encoded))) {
                byte[] buf = new byte[8192];
                int r;
                while ((r = gz.read(buf)) > 0) raw.write(buf, 0, r);
            }
            ByteBuffer bb = ByteBuffer.wrap(raw.toByteArray()).order(ByteOrder.LITTLE_ENDIAN);
            if (bb.remaining() != columns * n * 8) {
                throw new IllegalArgumentException("payload is " + bb.remaining() + " bytes, expected " + (columns * n * 8));
            }
            double[][] out = new double[columns][n];
            for (int c = 0; c < columns; c++) for (int i = 0; i < n; i++) out[c][i] = bb.getDouble();
            return out;
        } catch (IOException e) {
            throw new IllegalStateException("gunzip failed", e);
        }
    }

    public static List<byte[]> split(byte[] data, int chunkBytes) {
        List<byte[]> out = new ArrayList<>();
        if (data.length == 0) {
            out.add(new byte[0]);
            return out;
        }
        for (int off = 0; off < data.length; off += chunkBytes) {
            int len = Math.min(chunkBytes, data.length - off);
            byte[] c = new byte[len];
            System.arraycopy(data, off, c, 0, len);
            out.add(c);
        }
        return out;
    }

    public static byte[] join(List<byte[]> chunks) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] c : chunks) out.write(c, 0, c.length);
        return out.toByteArray();
    }

    public static String sha256Hex(byte[] data) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
