package com.ams.flink.cplm;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * CHG-064: copy() must carry EVERY instance field. resolve() and the profile packs copy on every
 * resolution, so a field missing from copy() makes a per-loop override silently revert to its default.
 * This guard is reflection-driven: a field added later without a copy() line fails here by name.
 */
public class CplmLoopDynamicsProfileCopyTest {

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static Object nonDefault(Field f, Object current) {
        Class<?> t = f.getType();
        if (t == boolean.class) return !(Boolean) current;
        if (t == int.class) return (Integer) current + 7;
        if (t == long.class) return (Long) current + 7L;
        if (t == double.class) {
            double d = (Double) current;
            return Double.isInfinite(d) ? 123.5 : d + 1.5;
        }
        if (t == String.class) return (current == null ? "" : current) + "-x";
        if (t == Double.class) return current == null ? 2.5 : (Double) current + 1.5;
        if (t.isEnum()) {
            Object[] all = t.getEnumConstants();
            for (Object e : all) if (!e.equals(current)) return e;
            return current;
        }
        if (Map.class.isAssignableFrom(t)) {
            LinkedHashMap m = new LinkedHashMap();
            m.put("k-x", 1.5);
            return m;
        }
        throw new IllegalStateException("guard test cannot build a non-default for " + f.getName() + " : " + t);
    }

    private static List<Field> instanceFields() {
        List<Field> out = new ArrayList<>();
        for (Field f : CplmLoopDynamicsProfile.class.getDeclaredFields()) {
            int m = f.getModifiers();
            if (Modifier.isStatic(m) || Modifier.isTransient(m) || f.isSynthetic()) continue;
            f.setAccessible(true);
            out.add(f);
        }
        return out;
    }

    @Test
    public void copyCarriesEveryInstanceField() throws Exception {
        CplmLoopDynamicsProfile orig = new CplmLoopDynamicsProfile();
        List<Field> fields = instanceFields();
        for (Field f : fields) f.set(orig, nonDefault(f, f.get(orig)));
        CplmLoopDynamicsProfile copy = orig.copy();

        List<String> missing = new ArrayList<>();
        for (Field f : fields) {
            Object a = f.get(orig);
            Object b = f.get(copy);
            if (!a.equals(b)) missing.add(f.getName());
            else if (a instanceof Map && a == b) missing.add(f.getName() + " (shared mutable instance)");
        }
        assertTrue("copy() drops or shares fields: " + missing, missing.isEmpty());
        assertTrue("reflection found too few fields: " + fields.size(), fields.size() > 50);
    }

    @Test
    public void copyDeepCopiesBundleResponseValues() {
        CplmLoopDynamicsProfile orig = new CplmLoopDynamicsProfile();
        orig.bundleResponseValues = new LinkedHashMap<>();
        orig.bundleResponseValues.put("a", 1.0);
        CplmLoopDynamicsProfile copy = orig.copy();
        assertNotSame(orig.bundleResponseValues, copy.bundleResponseValues);
        copy.bundleResponseValues.put("b", 2.0);
        assertEquals(1, orig.bundleResponseValues.size());
    }

    @Test
    public void resolveKeepsOverrideSaturationPersistenceAndFreeze() {
        CplmLoopDynamicsProfile o = new CplmLoopDynamicsProfile();
        o.satHighPct = 90;
        o.persistenceWindows = 5;
        o.freezeDwellS = 120;
        CplmLoopDynamicsProfile r = CplmLoopDynamicsProfile.resolve("FIC-101", "FIC", o);
        assertEquals(90, r.satHighPct, 0.0);
        assertEquals(5, r.persistenceWindows);
        assertEquals(120, r.freezeDwellS, 0.0);
    }
}
