package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.2 (spec v6 §5.2 / §6.3; NR-055): the deployed build declares its compiled execution
 * capacity and validates a requested plan against it - the installed plan the control plane ships
 * (execution-plan.installed.json) is exactly what the jar compiles, anything beyond it is
 * DEPLOYMENT_REQUIRED with the reason, never a silently narrowed plan.
 */
public class ExecutionPlanCapacityTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static ObjectNode installed() throws Exception {
        try (InputStream in = ExecutionPlanCapacityTest.class.getResourceAsStream("/cplm/gate-config/execution-plan.installed.json")) {
            assertNotNull("execution-plan.installed.json is not on the jar classpath (scripts/gen-property-catalogue.py copies it)", in);
            return (ObjectNode) M.readTree(in);
        }
    }

    @Test
    public void theInstalledPlanValidatesAndEqualsTheJavaDeclaration() throws Exception {
        ObjectNode plan = installed();
        List<String> reasons = ExecutionPlanCapacity.validate(plan);
        assertTrue(reasons.toString(), reasons.isEmpty());

        ObjectNode declared = ExecutionPlanCapacity.declare(M);
        assertEquals(ExecutionPlanCapacity.SCHEDULER_MODE, plan.get("scheduler_mode").asText());
        JsonNode capacity = plan.get("capacity_identity");
        assertEquals((double) ExecutionPlanCapacity.MAX_RETENTION_S, capacity.get("max_retention_s").asDouble(), 0.0);
        assertEquals(ExecutionPlanCapacity.MAX_ACTIVE_HORIZONS, capacity.get("max_active_horizons").asInt());
        assertEquals(declared.get("supported_slides_s"), capacity.get("supported_slides_s"));

        Map<String, JsonNode> compiled = new HashMap<>();
        for (JsonNode h : declared.get("horizons")) compiled.put(h.get("horizon_id").asText(), h);
        assertEquals("every compiled horizon is installed and nothing else", compiled.size(), plan.get("horizons").size());
        for (JsonNode h : plan.get("horizons")) {
            JsonNode c = compiled.get(h.get("horizon_id").asText());
            assertNotNull("horizon " + h.get("horizon_id") + " is not compiled", c);
            assertEquals(c.get("tier").asText(), h.get("tier").asText());
            assertEquals(c.get("duration_s").asDouble(), h.get("duration_s").asDouble(), 1e-9);
            assertEquals(c.get("slide_s").asDouble(), h.get("slide_s").asDouble(), 1e-9);
            assertEquals(c.get("min_samples").asInt(), h.get("min_samples").asInt());
        }
        JsonNode assignments = declared.get("assignments");
        assertEquals(17, plan.get("assignments").size());
        for (JsonNode a : plan.get("assignments")) {
            JsonNode c = assignments.get(a.get("gate").asText());
            assertNotNull("gate " + a.get("gate") + " has no compiled assignment", c);
            assertEquals(c.get("horizon_id").asText(), a.get("horizon_id").asText());
            assertEquals(c.get("trigger").asText(), a.get("trigger").asText());
        }
    }

    @Test
    public void aHorizonThisBuildDoesNotRunNeedsADeployment() throws Exception {
        ObjectNode plan = installed();
        ObjectNode h = ((ArrayNode) plan.get("horizons")).addObject();
        h.put("horizon_id", "long_30h");
        h.put("tier", "long");
        h.put("duration_s", 30 * 3600.0);
        h.put("slide_s", 900.0);
        List<String> reasons = ExecutionPlanCapacity.validate(plan);
        assertEquals("the uncompiled horizon AND the eleventh active horizon are both stated", 2, reasons.size());
        assertTrue(reasons.get(0), reasons.get(0).startsWith("DEPLOYMENT_REQUIRED: horizon 'long_30h'"));
        assertTrue(reasons.get(1), reasons.get(1).contains("11 horizons requested, capacity 10"));

        ObjectNode moved = installed();
        for (JsonNode a : moved.get("assignments")) if ("G5".equals(a.get("gate").asText())) ((ObjectNode) a).put("horizon_id", "long_12h");
        List<String> r2 = ExecutionPlanCapacity.validate(moved);
        assertEquals(r2.toString(), 1, r2.size());
        assertTrue(r2.get(0), r2.get(0).contains("G5 on horizon 'long_12h'"));

        ObjectNode other = installed();
        other.put("scheduler_mode", "BOUNDED_KEYED");
        assertTrue(ExecutionPlanCapacity.validate(other).get(0).startsWith("DEPLOYMENT_REQUIRED: scheduler_mode BOUNDED_KEYED"));
    }

    @Test
    public void aSixHourPeriodWithFiveCyclesExceedsTheDayOfRetention() {
        String reason = ExecutionPlanCapacity.periodCapacity(21600, 5);
        assertTrue(reason, reason.startsWith("G5 UNSUPPORTED_CAPACITY"));
        assertTrue(reason, reason.contains("108000.0 s of retention"));
        assertTrue(reason, reason.contains("24 h"));
        assertEquals("", ExecutionPlanCapacity.periodCapacity(900, 5));
        assertEquals("a bundle asking for it is refused on PREPARE by name", "", ExecutionPlanCapacity.periodCapacity(3600, 24));
        assertTrue(ExecutionPlanCapacity.periodCapacity(3600, 25).startsWith("G5 UNSUPPORTED_CAPACITY"));
    }
}
