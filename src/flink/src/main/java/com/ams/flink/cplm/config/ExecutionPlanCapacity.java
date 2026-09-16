package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * v2.5 Task 3C.2 (spec v6 §5.2.1 / §6.3): the COMPILED execution plan this build runs - the fixed
 * short windows, the long 4h/12h/24h slices on a 15-min cadence with 24 h + 10 min retention, EVENT
 * for G12, CONDITION_AND_WINDOW for G10/G11, EVIDENCE_UPDATE for G13-G15. A requested plan is
 * validated against this capacity: anything else is DEPLOYMENT_REQUIRED with the reason, never a
 * silently narrowed plan (a bounded keyed scheduler is a later deployment).
 */
public final class ExecutionPlanCapacity {
    public static final String SCHEDULER_MODE = "FIXED_COMPILED";
    public static final long MAX_RETENTION_S = 24L * 3600 + 600;
    public static final int MAX_ACTIVE_HORIZONS = 10;

    public static final class Horizon {
        public final String id, tier, trigger;
        public final double durationS, slideS;
        public final int minSamples;

        Horizon(String id, String tier, double durationS, double slideS, int minSamples, String trigger) {
            this.id = id;
            this.tier = tier;
            this.durationS = durationS;
            this.slideS = slideS;
            this.minSamples = minSamples;
            this.trigger = trigger;
        }
    }

    public static final List<Horizon> HORIZONS = Collections.unmodifiableList(Arrays.asList(
            new Horizon("short_1m", "short", 60, 60, 4, "WINDOW"),               // tumbling
            new Horizon("short_5m", "short", 300, 60, 10, "WINDOW"),
            new Horizon("short_10m", "short", 600, 120, 10, "WINDOW"),
            new Horizon("short_15m", "short", 900, 300, 10, "WINDOW"),
            new Horizon("short_30m", "short", 1800, 300, 10, "WINDOW"),
            new Horizon("short_60m", "short", 3600, 300, 10, "WINDOW"),
            new Horizon("long_4h", "long", 4 * 3600, 900, 32, "WINDOW"),
            new Horizon("long_12h", "long", 12 * 3600, 900, 32, "WINDOW"),
            new Horizon("long_24h", "long", 24 * 3600, 900, 32, "WINDOW"),
            new Horizon("event", "event", 0, 0, 4, "EVENT")));

    /** gate -> (horizon, trigger) as compiled. */
    public static final Map<String, String[]> ASSIGNMENTS;

    static {
        Map<String, String[]> a = new LinkedHashMap<>();
        for (String g : new String[] {"G0", "G1", "G2", "G2r", "G3", "G4"}) a.put(g, new String[] {"short_60m", "WINDOW"});
        for (String g : new String[] {"G5", "G6", "G7", "G8", "G9"}) a.put(g, new String[] {"long_24h", "WINDOW"});
        a.put("G10", new String[] {"long_24h", "CONDITION_AND_WINDOW"});
        a.put("G11", new String[] {"long_24h", "CONDITION_AND_WINDOW"});
        a.put("G12", new String[] {"event", "EVENT"});
        a.put("G13", new String[] {"long_24h", "EVIDENCE_UPDATE"});
        a.put("G14", new String[] {"long_24h", "EVIDENCE_UPDATE"});
        a.put("G15", new String[] {"long_24h", "EVIDENCE_UPDATE"});
        ASSIGNMENTS = Collections.unmodifiableMap(a);
    }

    private ExecutionPlanCapacity() {}

    /** The capacity block of the CAPABILITY record and /capabilities. */
    public static ObjectNode declare(ObjectMapper mapper) {
        ObjectNode n = mapper.createObjectNode();
        n.put("scheduler_mode", SCHEDULER_MODE);
        n.put("max_retention_s", MAX_RETENTION_S);
        n.put("max_active_horizons", MAX_ACTIVE_HORIZONS);
        ArrayNode slides = n.putArray("supported_slides_s");
        for (double s : supportedSlides()) slides.add(s);
        ArrayNode hs = n.putArray("horizons");
        for (Horizon h : HORIZONS) {
            ObjectNode o = hs.addObject();
            o.put("horizon_id", h.id);
            o.put("tier", h.tier);
            o.put("duration_s", h.durationS);
            o.put("slide_s", h.slideS);
            o.put("min_samples", h.minSamples);
            o.put("trigger", h.trigger);
        }
        ObjectNode as = n.putObject("assignments");
        for (Map.Entry<String, String[]> e : ASSIGNMENTS.entrySet()) {
            ObjectNode o = as.putObject(e.getKey());
            o.put("horizon_id", e.getValue()[0]);
            o.put("trigger", e.getValue()[1]);
        }
        return n;
    }

    public static List<Double> supportedSlides() {
        Set<Double> s = new HashSet<>();
        for (Horizon h : HORIZONS) if (h.slideS > 0) s.add(h.slideS);
        List<Double> out = new ArrayList<>(s);
        Collections.sort(out);
        return out;
    }

    /**
     * Validates a requested execution plan against the compiled capacity. Empty = ok; otherwise every
     * reason (prefixed DEPLOYMENT_REQUIRED or INVALID) - a horizon this build does not run, a slide
     * it does not support, a retention beyond what the buffers hold, a gate assigned to a tier it does
     * not belong to, a gate missing or duplicated, a scheduler mode other than FIXED_COMPILED.
     */
    public static List<String> validate(JsonNode plan) {
        List<String> reasons = new ArrayList<>();
        if (plan == null || !plan.isObject()) {
            reasons.add("INVALID: execution_plan must be an object");
            return reasons;
        }
        String mode = plan.path("scheduler_mode").asText(SCHEDULER_MODE);
        if (!SCHEDULER_MODE.equals(mode)) reasons.add("DEPLOYMENT_REQUIRED: scheduler_mode " + mode + " (this build runs " + SCHEDULER_MODE + ")");
        Map<String, Horizon> compiled = new HashMap<>();
        for (Horizon h : HORIZONS) compiled.put(h.id, h);
        Set<String> requestedHorizons = new HashSet<>();
        for (JsonNode h : plan.path("horizons")) {
            String id = h.path("horizon_id").asText("");
            requestedHorizons.add(id);
            Horizon c = compiled.get(id);
            if (c == null) {
                reasons.add("DEPLOYMENT_REQUIRED: horizon '" + id + "' is not compiled into this build (" + String.join(", ", compiled.keySet()) + ")");
                continue;
            }
            double dur = h.path("duration_s").asDouble(c.durationS), slide = h.path("slide_s").asDouble(c.slideS);
            if (Math.abs(dur - c.durationS) > 1e-9) reasons.add("DEPLOYMENT_REQUIRED: horizon '" + id + "' duration " + dur + " s (compiled " + c.durationS + " s)");
            if (Math.abs(slide - c.slideS) > 1e-9) reasons.add("DEPLOYMENT_REQUIRED: horizon '" + id + "' slide " + slide + " s (compiled " + c.slideS + " s)");
            if (h.path("retention_s").isNumber() && h.path("retention_s").asDouble() > MAX_RETENTION_S) {
                reasons.add("DEPLOYMENT_REQUIRED: horizon '" + id + "' retention " + h.path("retention_s").asDouble() + " s exceeds the " + MAX_RETENTION_S + " s buffer");
            }
        }
        if (requestedHorizons.size() > MAX_ACTIVE_HORIZONS) reasons.add("DEPLOYMENT_REQUIRED: " + requestedHorizons.size() + " horizons requested, capacity " + MAX_ACTIVE_HORIZONS);
        Set<String> seen = new HashSet<>();
        for (JsonNode a : plan.path("assignments")) {
            String gate = a.path("gate").asText("");
            if (!ASSIGNMENTS.containsKey(gate)) {
                reasons.add("INVALID: unknown gate '" + gate + "'");
                continue;
            }
            if (!seen.add(gate)) reasons.add("INVALID: gate " + gate + " assigned twice");
            String horizon = a.path("horizon_id").asText("");
            String trigger = a.path("trigger").asText("");
            String[] c = ASSIGNMENTS.get(gate);
            if (!c[0].equals(horizon)) reasons.add("DEPLOYMENT_REQUIRED: " + gate + " on horizon '" + horizon + "' (compiled " + c[0] + ")");
            if (!c[1].equals(trigger)) reasons.add("DEPLOYMENT_REQUIRED: " + gate + " trigger " + trigger + " (compiled " + c[1] + ")");
        }
        if (plan.path("assignments").isArray()) {
            for (String gate : ASSIGNMENTS.keySet()) if (!seen.contains(gate)) reasons.add("INVALID: gate " + gate + " has no assignment");
        }
        return reasons;
    }

    /** G5's period range against what 24 h of retention can qualify (spec §6.3: cycles x period_max must fit). */
    public static String periodCapacity(double periodMaxS, int minCycles) {
        double needed = periodMaxS * Math.max(1, minCycles);
        if (needed > MAX_RETENTION_S) {
            return "G5 UNSUPPORTED_CAPACITY: " + minCycles + " cycles of " + periodMaxS + " s need " + needed + " s of retention; this build retains " + MAX_RETENTION_S + " s (24 h)";
        }
        return "";
    }
}
