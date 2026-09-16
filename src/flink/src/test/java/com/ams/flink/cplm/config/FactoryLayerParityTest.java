package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.SerializationFeature;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Iterator;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.1: the checked-in factory layer (src/main/resources/cplm/gate-config/factory-layer.json,
 * copied to contracts/ and the API by scripts/gen-property-catalogue.py) equals what the packs
 * define. Run with -Dfactory.layer.write=true to regenerate; otherwise a drift fails the build.
 */
public class FactoryLayerParityTest {
    private static final ObjectMapper MAPPER = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT).enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    @Test
    public void theCheckedInFactoryLayerEqualsThePacks() throws Exception {
        ObjectNode exported = FactoryLayer.export(MAPPER);
        String text = MAPPER.writeValueAsString(exported) + "\n";
        if (Boolean.getBoolean("factory.layer.write")) {
            File out = new File("src/main/resources/cplm/gate-config/factory-layer.json");
            out.getParentFile().mkdirs();
            Files.write(out.toPath(), text.getBytes(StandardCharsets.UTF_8));
        }
        try (InputStream in = getClass().getResourceAsStream("/cplm/gate-config/factory-layer.json")) {
            assertNotNull("factory-layer.json missing: run mvn -Dtest=FactoryLayerParityTest -Dfactory.layer.write=true test", in);
            JsonNode checkedIn = MAPPER.readTree(in);
            assertEquals("factory-layer.json drifted from the packs: regenerate with -Dfactory.layer.write=true", MAPPER.readTree(text), checkedIn);
        }
    }

    @Test
    public void everyExportedValueIsAValidCatalogueValueAndRoundTripsThroughTheMapper() throws Exception {
        ObjectNode exported = FactoryLayer.export(MAPPER);
        PropertyCatalogue cat = PropertyCatalogue.current();
        JsonNode profiles = exported.path("profiles");
        assertTrue(profiles.has("FLOW_FAST_SELF_REG"));
        assertTrue(profiles.has("TEMP_SLOW_SELF_REG"));
        Iterator<Map.Entry<String, JsonNode>> it = profiles.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> prof = it.next();
            Iterator<Map.Entry<String, JsonNode>> ps = prof.getValue().fields();
            while (ps.hasNext()) {
                Map.Entry<String, JsonNode> p = ps.next();
                PropertyCatalogue.Entry e = cat.get(p.getKey());
                if ("integer".equals(e.type)) assertTrue(p.getKey(), p.getValue().isIntegralNumber());
                if ("number".equals(e.type)) assertTrue(p.getKey(), p.getValue().isNumber());
                if ("enum".equals(e.type)) assertTrue(p.getKey() + "=" + p.getValue().asText(), e.enumValues().contains(p.getValue().asText()));
            }
            // applying a pack's own layer to that pack changes nothing
            CplmLoopDynamicsProfile before = null;
            for (CplmLoopDynamicsProfile.LoopClass cls : CplmLoopDynamicsProfile.LoopClass.values()) {
                CplmLoopDynamicsProfile c = CplmLoopDynamicsProfile.forClass(cls);
                if (c.gateProfileId.equals(prof.getKey())) before = c;
            }
            assertNotNull(before);
            CplmLoopDynamicsProfile after = before.copy();
            BundleProfileMapper.apply(after, prof.getValue());
            assertEquals(prof.getKey(), FactoryLayer.profileValues(before), FactoryLayer.profileValues(after));
        }
        assertEquals(cat.catalogueHash(), exported.path("catalogue_hash").asText());
        assertTrue(exported.path("factory").has("G12.noise_multiplier"));
        assertTrue(exported.path("factory").has("G12.pre_support_s"));
    }
}
