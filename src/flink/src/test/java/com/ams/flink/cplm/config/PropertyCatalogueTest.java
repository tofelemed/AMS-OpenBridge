package com.ams.flink.cplm.config;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3A.1: the jar carries the SAME 165-property catalogue the API embeds (generated from the
 * spec sheet into both trees by scripts/gen-property-catalogue.py); its content hash is what the
 * CAPABILITY ACK reports so the control plane can refuse a bundle validated against another catalogue.
 */
public class PropertyCatalogueTest {
    @Test
    public void theJarCarriesThe165PropertiesOnceWithTheirHash() {
        PropertyCatalogue c = PropertyCatalogue.current();
        assertEquals(165, c.size());
        Set<String> ids = new HashSet<>(), props = new HashSet<>();
        for (PropertyCatalogue.Entry e : c.entries()) {
            assertTrue(ids.add(e.id));
            assertTrue(props.add(e.property));
            assertTrue(e.property, e.property.startsWith(e.gate + "."));
            assertFalse(e.property, e.consumers.isEmpty());
        }
        assertTrue(c.catalogueHash().matches("[0-9a-f]{64}"));
        assertEquals(c.catalogueHash(), PropertyCatalogue.hashOf(c.entries()));
    }

    @Test
    public void typedAccessorsReadDefaultsAndValidation() {
        PropertyCatalogue c = PropertyCatalogue.current();
        PropertyCatalogue.Entry seg = c.get("G6.segment_samples");
        assertEquals("integer", seg.type);
        assertEquals(256L, seg.defaultValue);
        assertEquals(16.0, seg.minimum(), 0);
        assertEquals(1048576.0, seg.maximum(), 0);
        assertEquals("STATE_BOUNDARY", seg.changeClass);
        assertTrue(seg.consumers.contains("flink:long"));
        PropertyCatalogue.Entry mode = c.get("G0.mode");
        assertEquals(Arrays.asList("OPERATIONAL", "OBSERVE_ONLY", "SHADOW", "DISABLED"), mode.enumValues());
        assertNull("Commissioning required has no default", c.get("G5.period_min_s").defaultValue);
        assertEquals(Boolean.TRUE, c.get("G14.require_independent_review").defaultValue);
        assertEquals(0.02, (Double) c.get("G12.settling_relative_band").defaultValue, 1e-12);
        assertNull(c.find("G99.nothing"));
    }

    @Test
    public void theDependencyGraphPromotesChangeClassesAndHasNoCycle() {
        PropertyCatalogue c = PropertyCatalogue.current();
        assertFalse(c.hasCycle());
        assertEquals("STATE_BOUNDARY", c.effectiveChangeClass(Arrays.asList("G2.stability_band_pv_eu")));
        assertEquals("POLICY", c.effectiveChangeClass(Arrays.asList("G4.activity_warn_ratio")));
        assertTrue(c.dependants("G5.min_complete_cycles").contains("G7.min_accepted_cycles"));
    }

    @Test
    public void everyFlinkConsumedPropertyBelongsToAKnownJob() {
        PropertyCatalogue c = PropertyCatalogue.current();
        Set<String> jobs = new HashSet<>(Arrays.asList("flink:short", "flink:long", "flink:fusion", "flink:response", "flink:condition"));
        for (PropertyCatalogue.Entry e : c.entries()) {
            for (String consumer : e.consumers) {
                if (consumer.startsWith("flink:")) assertTrue(e.property + " -> " + consumer, jobs.contains(consumer));
            }
        }
        assertNotNull(c.get("G13.lag_max_s"));
    }
}
