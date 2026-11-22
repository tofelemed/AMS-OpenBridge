package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.ResponseJobConfig;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;

/**
 * CHG-212 (System Response plan 2c): a loop's Yokogawa CENTUM PID tuning, as published over MQTT (P, I, D), turned into
 * the engine's ideal-form controller. CENTUM's PID is the non-interacting (ideal) form; P is the proportional band in %
 * of the PV span, so Kc = (100 / P) x (OP span / PV span), in % output per PV unit. I and D are seconds; 0 switches the
 * term off. The plant does not publish the action, so it stays UNKNOWN and the analysis takes the loop as correctly
 * acting. Without a recorded PV range the tuning is still recorded (raw values) but not used.
 */
public final class CentumTuning implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String ADAPTER = "CENTUM_PB_1.0";

    public final double rawP;
    /** NaN when not sent. */
    public final double rawI, rawD;
    public final double pvSpanEu, opLowEu, opHighEu, scanS;
    /** When the engine first saw these values (ms since epoch). */
    public final long effectiveFromMs;
    /** IDEAL when usable, else UNKNOWN. */
    public final ControllerSnapshot snapshot;
    public final boolean usable;
    /** "ctl:" + a hash of the values; the same tuning always has the same ref. */
    public final String ref;

    private CentumTuning(double p, double i, double d, double pvSpan, double opLow, double opHigh, double scan, long fromMs) {
        rawP = p;
        rawI = i;
        rawD = d;
        pvSpanEu = pvSpan;
        opLowEu = opLow;
        opHighEu = opHigh;
        scanS = scan;
        effectiveFromMs = fromMs;
        usable = Double.isFinite(pvSpan) && pvSpan > 0 && opHigh > opLow;
        snapshot = usable
                ? ControllerSnapshot.ideal((100.0 / p) * (opHigh - opLow) / pvSpan, positive(i), positive(d), scan, "UNKNOWN")
                : ControllerSnapshot.unknown();
        String canonical = "centum|" + p + "|" + i + "|" + d + "|" + pvSpan + "|" + opLow + "|" + opHigh + "|" + ADAPTER;
        ref = "ctl:" + com.ams.flink.cplm.identity.ProfileHash.sha256Prefix(canonical, 16);
    }

    /**
     * The tuning of a point {@code [sinceS, p, i, d]} under these settings (PV span, OP range, scan); null when the point
     * is null or P is not a positive finite number.
     */
    public static CentumTuning of(double[] point, ResponseJobConfig cfg) {
        if (point == null || point.length < 4 || !Double.isFinite(point[1]) || point[1] <= 0) return null;
        double scan = cfg.controllerScanS > 0 ? cfg.controllerScanS : 1.0;
        return new CentumTuning(point[1], point[2], point[3], cfg.pvSpanEu, cfg.opLowEu, cfg.opHighEu, scan, Math.round(point[0] * 1000));
    }

    /** A controller gain (% output per PV unit) read back as a CENTUM proportional band (%); null without a PV range. */
    public static Double proportionalBand(double kc, ResponseJobConfig cfg) {
        if (!Double.isFinite(cfg.pvSpanEu) || cfg.pvSpanEu <= 0 || !(cfg.opHighEu > cfg.opLowEu) || kc == 0 || !Double.isFinite(kc)) return null;
        return 100.0 * (cfg.opHighEu - cfg.opLowEu) / (Math.abs(kc) * cfg.pvSpanEu);
    }

    /** The record the result carries (controller_snapshot); cplm-api stores it effective-dated per loop. */
    public ObjectNode body(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("form", snapshot.form);
        putOrNull(n, "kc", snapshot.kc);
        putOrNull(n, "ti_s", snapshot.ti);
        putOrNull(n, "td_s", snapshot.td);
        n.putNull("action");
        n.put("scan_s", scanS);
        n.put("raw_p", rawP);
        putOrNull(n, "raw_i", Double.isNaN(rawI) ? null : rawI);
        putOrNull(n, "raw_d", Double.isNaN(rawD) ? null : rawD);
        putOrNull(n, "pv_span_eu", Double.isFinite(pvSpanEu) ? pvSpanEu : null);
        n.put("op_low_eu", opLowEu);
        n.put("op_high_eu", opHighEu);
        n.put("effective_from", java.time.Instant.ofEpochMilli(effectiveFromMs).toString());
        n.put("source", "DCS");
        n.put("adapter_version", ADAPTER);
        n.put("usable", usable);
        if (usable) n.putNull("reason"); else n.put("reason", "PV_RANGE_NOT_SET");
        return n;
    }

    private static Double positive(double v) {
        return Double.isFinite(v) && v > 0 ? v : null;
    }

    private static void putOrNull(ObjectNode n, String k, Double v) {
        if (v == null) n.putNull(k); else n.put(k, v);
    }
}
