package com.ams.flink.cplm;

import org.apache.flink.api.common.ExecutionConfig;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.api.common.typeutils.TypeSerializer;
import org.apache.flink.util.InstantiationUtil;
import org.junit.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.LinkedHashMap;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** CHG-061: the Short buffer keys each distinct profile by its content, so equal profiles share one entry. */
public class ShortProfileRegistryTest {

    private static CplmLoopDynamicsProfile base() {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("FIC-1", "FLOW", null);
        p.bundleHash = "abc";
        p.bundleEpoch = 3;
        p.bundleResponseValues = new LinkedHashMap<>();
        p.bundleResponseValues.put("response.min_step_pct", 2.0);
        return p;
    }

    /** What keyBy hands the buffer: a copy through Flink's own serializer. */
    private static CplmLoopDynamicsProfile overTheNetwork(CplmLoopDynamicsProfile p) throws Exception {
        TypeSerializer<CplmLoopDynamicsProfile> ser = TypeInformation.of(CplmLoopDynamicsProfile.class).createSerializer(new ExecutionConfig());
        return InstantiationUtil.deserializeFromByteArray(ser, InstantiationUtil.serializeToByteArray(ser, p));
    }

    @Test
    public void equalContentGivesOneKeyWhateverTheObject() throws Exception {
        CplmLoopDynamicsProfile a = base();
        String key = ShortProfileRegistry.fingerprint(a);
        // after keyBy every record carries its own deserialized copy: identity differs, content does not
        assertEquals(key, ShortProfileRegistry.fingerprint(overTheNetwork(a)));
        assertEquals(key, ShortProfileRegistry.fingerprint(overTheNetwork(overTheNetwork(a))));
        assertEquals(key, ShortProfileRegistry.fingerprint(base()));
    }

    @Test
    public void everyMemberCountsInTheKey() throws Exception {
        String key = ShortProfileRegistry.fingerprint(base());
        int checked = 0;
        for (Field f : CplmLoopDynamicsProfile.class.getDeclaredFields()) {
            if (Modifier.isStatic(f.getModifiers())) continue;
            CplmLoopDynamicsProfile p = base();
            f.setAccessible(true);
            f.set(p, changed(f.getType(), f.get(p)));
            assertNotEquals("member " + f.getName() + " must change the key", key, ShortProfileRegistry.fingerprint(p));
            checked++;
        }
        assertTrue("every profile member checked: " + checked, checked > 80);
    }

    private static Object changed(Class<?> t, Object v) {
        if (t == double.class || t == Double.class) {
            double d = v == null ? 0 : (Double) v;
            return Double.isInfinite(d) ? 0.0 : d + 1.0;
        }
        if (t == int.class) return (Integer) v + 1;
        if (t == long.class) return (Long) v + 1;
        if (t == boolean.class) return !(Boolean) v;
        if (t == String.class) return v + "x";
        if (t.isEnum()) {
            Object[] all = t.getEnumConstants();
            return all[0].equals(v) ? all[1] : all[0];
        }
        if (t == LinkedHashMap.class) {
            LinkedHashMap<String, Double> m = new LinkedHashMap<>();
            m.put("other", 1.0);
            return m;
        }
        throw new AssertionError("profile member of an unexpected type " + t + ": extend this test");
    }

    @Test
    public void noProfileHasNoKey() {
        assertNull(ShortProfileRegistry.fingerprint(null));
    }
}
