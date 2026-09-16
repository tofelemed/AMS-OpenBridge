package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.response.ResponseJobConfig;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3A.2 (spec v6 §5.3; NR-046): an accepted property with no reader is a release defect.
 * Every catalogue property with a flink consumer is either applied by the mapper for some job or
 * explicitly listed in unsupported-in-build.json with a reason - never silently accepted. The
 * CAPABILITY record each job announces at start carries exactly its readable ids, the catalogue
 * hash and the compiled execution-plan capacity.
 */
public class CapabilityCoverageTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void everyFlinkConsumedPropertyIsReadBySomeJobOrDeclaredUnsupportedWithAReason() {
        PropertyCatalogue c = PropertyCatalogue.current();
        Set<String> unsupported = PropertyReaders.unsupportedInBuild().keySet();
        List<String> orphans = new ArrayList<>();
        for (PropertyCatalogue.Entry e : c.entries()) {
            boolean flink = e.consumers.stream().anyMatch(x -> x.startsWith("flink:"));
            if (!flink) continue;
            boolean read = false;
            for (String job : PropertyReaders.JOBS) if (PropertyReaders.forJob(job).contains(e.property)) read = true;
            if (!read && !unsupported.contains(e.property)) orphans.add(e.property);
            if (read) assertFalse(e.property + " is both read and declared unsupported", unsupported.contains(e.property));
        }
        assertTrue("properties with a flink consumer that no job reads and no reason excuses: " + orphans, orphans.isEmpty());
        for (String reason : PropertyReaders.unsupportedInBuild().values()) assertFalse(reason.trim().isEmpty());
    }

    @Test
    public void eachJobReadsOnlyPropertiesItsTierConsumes() {
        PropertyCatalogue c = PropertyCatalogue.current();
        for (String job : PropertyReaders.JOBS) {
            String consumer = PropertyReaders.consumerOf(job);
            for (String p : PropertyReaders.forJob(job)) {
                PropertyCatalogue.Entry e = c.get(p);
                assertTrue(job + " reads " + p + " whose consumers are " + e.consumers, e.consumers.contains(consumer));
            }
        }
        assertTrue(PropertyReaders.forJob("AMS - CPLM Long Diagnostics Engine").contains("G5.period_min_s"));
        assertTrue(PropertyReaders.forJob("AMS - CPLM Response Engine").contains("G12.pre_support_s"));
        assertTrue(PropertyReaders.forJob("AMS - CPLM Condition Engine").contains("G11.freeze_dwell_s"));
        assertTrue(PropertyReaders.forJob("AMS - CPLM Gate Fusion Engine").contains("G15.recovery_support_s"));
        assertTrue(PropertyReaders.forJob("AMS - CPLM Instrument Context Engine").isEmpty());
    }

    @Test
    public void theMapperAppliesTypedValuesToTheProfileAndTheResponseConfig() throws Exception {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        ObjectNode props = MAPPER.createObjectNode();
        props.put("G5.period_min_s", 12.5);
        props.put("G5.min_complete_cycles", 7);
        props.put("G6.segment_samples", 512);
        props.put("G13.max_peers", 3);
        props.put("G9.role", "DISPLAY_ONLY");
        props.put("G11.freeze_dwell_s", 45.0);
        List<String> applied = BundleProfileMapper.apply(p, props);
        assertEquals(12.5, p.tauMinS, 0);
        assertEquals(7, p.minValidCycles);
        assertEquals(512, p.g6SegmentSamples);
        assertEquals(3, p.g13MaxPeers);
        assertEquals(CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY, p.geometryRole);
        assertEquals(45.0, p.freezeDwellS, 0);
        assertEquals(6, applied.size());
        // an unknown property or a wrong type is refused by name, never silently ignored
        ObjectNode bad = MAPPER.createObjectNode();
        bad.put("G5.period_min_s", "twelve");
        try {
            BundleProfileMapper.apply(p, bad);
            assertTrue("a non-numeric period must be refused", false);
        } catch (IllegalArgumentException ex) {
            assertTrue(ex.getMessage(), ex.getMessage().contains("G5.period_min_s"));
        }
        ResponseJobConfig r = new ResponseJobConfig();
        ObjectNode g12 = MAPPER.createObjectNode();
        g12.put("G12.pre_support_s", 90.0);
        g12.put("G12.capture_max_s", 1800.0);
        g12.put("G12.delay_min_s", 2.0);
        BundleProfileMapper.apply(r, g12);
        assertEquals(90.0, r.preSupportS, 0);
        assertEquals(1800.0, r.maxCaptureS, 0);
        assertEquals(2.0, r.delayMinS, 0);
    }

    @Test
    public void theCapabilityRecordNamesTheJobItsReadersTheCatalogueHashAndTheCompiledCapacity() throws Exception {
        String json = CapabilityRecord.json("AMS - CPLM Long Diagnostics Engine", "abc", "deadbeef");
        JsonNode n = MAPPER.readTree(json);
        assertEquals("CAPABILITY", n.path("record_kind").asText());
        assertEquals("AMS - CPLM Long Diagnostics Engine", n.path("job_name").asText());
        assertEquals(PropertyCatalogue.current().catalogueHash(), n.path("catalogue_hash").asText());
        assertEquals("abc", n.path("jar_sha256").asText());
        assertTrue(n.path("readable_property_ids").isArray());
        assertTrue(n.path("readable_property_ids").size() > 10);
        assertEquals("FIXED_COMPILED", n.path("execution_plan_capacity").path("scheduler_mode").asText());
        assertEquals(86_400 + 600, n.path("execution_plan_capacity").path("max_retention_s").asInt());
        assertNotNull(n.path("execution_plan_capacity").path("horizons"));
        assertTrue(n.path("supported_role_mode_combinations").isArray());
        assertTrue(n.path("emitted_at_ms").asLong() > 0);
    }
}
