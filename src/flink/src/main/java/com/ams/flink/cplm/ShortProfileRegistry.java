package com.ams.flink.cplm;

import org.apache.flink.api.common.state.MapState;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CHG-061: the distinct dynamics profiles of one loop's Short buffer, each stored once.
 *
 * <p>Every sample arrives with its own copy of the resolved profile (~117 members): {@code keyBy} deserializes
 * one per record. Kept on each buffered sample that was ~2.2 KB of heap per sample, ~250 MB at Marun, and a
 * restore or replay ran the TaskManager out of heap (stress test 2026-10-06). The buffer now stores the sample
 * without its profile plus the profile's content key; the profile itself lives here once per distinct content
 * (usually one per loop) and is re-attached to each sample before a window is computed, so every window sees
 * exactly the profile its samples carried on arrival.
 *
 * <p>The key is a SHA-256 over the value of every profile member: equal content gives one key whatever the object
 * identity; any changed member (a threshold, a bundle epoch, a response value) gives another. An entry remembers
 * the latest minute holding a sample of its profile and leaves with that minute.
 */
final class ShortProfileRegistry {

    private final MapState<String, Entry> entries;

    ShortProfileRegistry(MapState<String, Entry> entries) {
        this.entries = entries;
    }

    /** Every instance member of the profile, by name (the fingerprint covers them all, new ones included). */
    private static final Field[] MEMBERS = members();

    private static Field[] members() {
        List<Field> fs = new ArrayList<>();
        for (Field f : CplmLoopDynamicsProfile.class.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers()) || Modifier.isTransient(f.getModifiers())) continue;
            Class<?> t = f.getType();
            if (!(t.isPrimitive() || t == String.class || t.isEnum() || Number.class.isAssignableFrom(t)
                    || t == Boolean.class || Map.class.isAssignableFrom(t) || Collection.class.isAssignableFrom(t))) {
                throw new IllegalStateException("profile member " + f.getName() + " has a type the Short fingerprint cannot read: " + t);
            }
            f.setAccessible(true);
            fs.add(f);
        }
        fs.sort(Comparator.comparing(Field::getName));
        return fs.toArray(new Field[0]);
    }

    /**
     * The content key of a profile, or null when the sample carries none: a SHA-256 over every member's value
     * (name, then value; doubles by their exact bits). Content only - object identity and sharing never count.
     */
    static String fingerprint(CplmLoopDynamicsProfile profile) {
        if (profile == null) return null;
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(2048);
            DataOutputStream out = new DataOutputStream(bytes);
            for (Field f : MEMBERS) {
                out.writeUTF(f.getName());
                write(out, f.get(profile));
            }
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray());
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            return hex.toString();
        } catch (IOException e) {
            throw new UncheckedIOException("profile fingerprint", e);
        } catch (IllegalAccessException | NoSuchAlgorithmException e) {
            throw new IllegalStateException("profile fingerprint", e);
        }
    }

    private static void write(DataOutputStream out, Object v) throws IOException {
        if (v == null) {
            out.writeByte(0);
        } else if (v instanceof Double) {
            out.writeByte(1);
            out.writeLong(Double.doubleToRawLongBits((Double) v));
        } else if (v instanceof Float) {
            out.writeByte(2);
            out.writeInt(Float.floatToRawIntBits((Float) v));
        } else if (v instanceof Number) {
            out.writeByte(3);
            out.writeLong(((Number) v).longValue());
        } else if (v instanceof Boolean) {
            out.writeByte(4);
            out.writeBoolean((Boolean) v);
        } else if (v instanceof Character) {
            out.writeByte(5);
            out.writeChar((Character) v);
        } else if (v instanceof String || v instanceof Enum) {
            byte[] s = (v instanceof Enum ? ((Enum<?>) v).name() : (String) v).getBytes(StandardCharsets.UTF_8);
            out.writeByte(v instanceof Enum ? 6 : 7);
            out.writeInt(s.length);
            out.write(s);
        } else if (v instanceof Map) {
            out.writeByte(8);
            out.writeInt(((Map<?, ?>) v).size());
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                write(out, e.getKey());
                write(out, e.getValue());
            }
        } else if (v instanceof Collection) {
            out.writeByte(9);
            out.writeInt(((Collection<?>) v).size());
            for (Object o : (Collection<?>) v) write(out, o);
        } else {
            throw new IllegalStateException("profile value of a type the Short fingerprint cannot read: " + v.getClass());
        }
    }

    /**
     * Takes the profile off {@code sample}, stores it once under its key for buffered {@code minute}, and
     * returns the key the buffered sample keeps (null when it carried none).
     */
    String detachAndRemember(CplmNormalizedSample sample, long minute) throws Exception {
        CplmLoopDynamicsProfile profile = sample.resolvedProfile;
        sample.resolvedProfile = null;
        String key = fingerprint(profile);
        if (key == null) return null;
        Entry e = entries.get(key);
        if (e == null) {
            entries.put(key, new Entry(key, profile, minute));
            return key;
        }
        if (minute > e.lastMinute) {
            e.lastMinute = minute;
            entries.put(key, e);
        }
        return e.key != null ? e.key : key;   // one key instance shared by the loop's samples (on the heap)
    }

    /**
     * Puts back on each sample the profile it carried on arrival. The samples are the buffer's own objects on
     * the heap backend, so the caller MUST {@link #detach} them before returning (a checkpoint never sees a
     * profile on a buffered sample).
     */
    void attach(List<ShortFeatureBufferFn.BufferedSample> range) throws Exception {
        Map<String, CplmLoopDynamicsProfile> byKey = new HashMap<>();
        for (ShortFeatureBufferFn.BufferedSample b : range) {
            if (b.profileKey == null) continue;
            CplmLoopDynamicsProfile p = byKey.get(b.profileKey);
            if (p == null) {
                Entry e = entries.get(b.profileKey);
                if (e == null) throw new IllegalStateException("short buffer: no profile for key " + b.profileKey + " (loop " + b.sample.loopId + ")");
                p = e.profile;
                byKey.put(b.profileKey, p);
            }
            b.sample.resolvedProfile = p;
        }
    }

    static void detach(List<ShortFeatureBufferFn.BufferedSample> range) {
        for (ShortFeatureBufferFn.BufferedSample b : range) b.sample.resolvedProfile = null;
    }

    /** Drops every profile whose samples all sat in minutes before {@code firstKeptMinute} (now evicted). */
    void evictBefore(long firstKeptMinute) throws Exception {
        List<String> gone = new ArrayList<>();
        for (Map.Entry<String, Entry> e : entries.entries()) {
            if (e.getValue().lastMinute < firstKeptMinute) gone.add(e.getKey());
        }
        for (String k : gone) entries.remove(k);
    }

    void clear() {
        entries.clear();
    }

    /** One stored profile, its key, and the latest buffered minute holding a sample of it. */
    public static class Entry {
        public String key;
        public CplmLoopDynamicsProfile profile;
        public long lastMinute;

        public Entry() {
        }

        Entry(String key, CplmLoopDynamicsProfile profile, long lastMinute) {
            this.key = key;
            this.profile = profile;
            this.lastMinute = lastMinute;
        }
    }
}
