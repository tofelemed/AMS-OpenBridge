package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * v2.5 Task 2G.1 (spec v6 §6.3, R05; NR-016, NR-019): what the acquisition contract lets a method
 * claim. The grid is the DECLARED one when the registry carries it, else the observed sample
 * period. G5/G6 need min_samples_per_period samples in the fastest period of interest (tauMinS);
 * G12 cannot resolve a dead time below the grid (a quarter of tauMinS is the bar). The verdict is
 * ELIGIBLE / LIMITED (reason BANDWIDTH, with the arithmetic) / UNKNOWN (no grid). An RBE source's
 * held samples are RBE holds (never process values); a sample-and-hold source's are SAMPLE_HOLD.
 */
public final class MethodEligibility {
    public static final class Verdict implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String state, reason, detail;

        public Verdict(String state, String reason, String detail) {
            this.state = state;
            this.reason = reason;
            this.detail = detail;
        }

        @Override
        public String toString() {
            return state + ":" + reason + (detail.isEmpty() ? "" : " (" + detail + ")");
        }
    }

    private MethodEligibility() {}

    public static Map<String, Verdict> evaluate(CplmLoopDynamicsProfile p, double observedGridS) {
        Map<String, Verdict> out = new LinkedHashMap<>();
        double grid = p != null && p.acquisitionGridS > 0 ? p.acquisitionGridS : observedGridS;
        String gridSource = p != null && p.acquisitionGridS > 0 ? "declared grid " + fmt(p.acquisitionGridS) + " s" : "observed grid " + fmt(observedGridS) + " s";
        if (!(grid > 0)) {
            Verdict unknown = new Verdict("UNKNOWN", "NO_GRID", "no declared or observed sample grid");
            out.put("G5", unknown);
            out.put("G6", unknown);
            out.put("G12", unknown);
            return out;
        }
        double tauMin = p == null || p.tauMinS <= 0 ? 0 : p.tauMinS;
        int needed = p == null || p.minSamplesPerPeriod <= 0 ? 8 : p.minSamplesPerPeriod;
        if (tauMin <= 0) {
            Verdict none = new Verdict("UNKNOWN", "NO_PERIOD_RANGE", "the profile declares no fastest period (tauMinS)");
            out.put("G5", none);
            out.put("G6", none);
            out.put("G12", none);
            return out;
        }
        double perPeriod = tauMin / grid;
        Verdict osc = perPeriod >= needed
                ? new Verdict("ELIGIBLE", "", fmt(perPeriod) + " samples per " + fmt(tauMin) + " s period >= " + needed + " (" + gridSource + ")")
                : new Verdict("LIMITED", "BANDWIDTH", fmt(perPeriod) + " samples per " + fmt(tauMin) + " s period < " + needed + " (" + gridSource + ")");
        out.put("G5", osc);
        out.put("G6", osc);
        double resolvable = tauMin / 4.0;
        out.put("G12", grid <= resolvable
                ? new Verdict("ELIGIBLE", "", "dead times down to " + fmt(grid) + " s resolvable (" + gridSource + ")")
                : new Verdict("LIMITED", "BANDWIDTH", "a dead time below the " + fmt(grid) + " s grid cannot be resolved; the fastest dynamics need <= " + fmt(resolvable) + " s (" + gridSource + ")"));
        return out;
    }

    public static boolean anyLimited(Map<String, Verdict> v) {
        for (Verdict x : v.values()) if ("LIMITED".equals(x.state)) return true;
        return false;
    }

    /** The hold kind of a held sample under the loop's acquisition mode (NR-019). */
    public static String holdKind(CplmLoopDynamicsProfile p, boolean held) {
        if (!held) return "NONE";
        String mode = p == null || p.acquisitionMode == null ? "PERIODIC" : p.acquisitionMode.toUpperCase(Locale.ROOT);
        switch (mode) {
            case "RBE": return "RBE_HOLD";
            case "SAMPLE_HOLD": return "SAMPLE_HOLD";
            default: return "HELD_PREVIOUS";
        }
    }

    /** {gate: {state, reason, detail}} on a result's JSON. */
    public static void write(ObjectNode out, Map<String, Verdict> v) {
        if (v == null) return;
        for (Map.Entry<String, Verdict> e : v.entrySet()) {
            ObjectNode o = out.putObject(e.getKey());
            o.put("state", e.getValue().state);
            o.put("reason", e.getValue().reason);
            o.put("detail", e.getValue().detail);
        }
    }

    public static Map<String, Verdict> read(JsonNode node) {
        Map<String, Verdict> out = new LinkedHashMap<>();
        if (node == null || !node.isObject()) return out;
        Iterator<Map.Entry<String, JsonNode>> it = node.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            out.put(e.getKey(), new Verdict(e.getValue().path("state").asText("UNKNOWN"), e.getValue().path("reason").asText(""), e.getValue().path("detail").asText("")));
        }
        return out;
    }

    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }
}
