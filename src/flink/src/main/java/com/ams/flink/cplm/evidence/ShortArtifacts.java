package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.contract.RoleObservation;
import com.ams.flink.cplm.engine.ShortIntermediates;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 2C.1c (spec §3.1, xlsx_Gate_evidence.tsv): the exact intermediates of the short tier
 * (G0-G4, G2r) as evidence artifacts with the workbook's field names. Every series is the one the
 * calculator used (retained on {@link ShortIntermediates}); categorical fields are coded columns
 * with legends; fields the deployment cannot map (selector, tracking, pressures) are declared as
 * NOT_MAPPED in provenance rather than left out or invented.
 */
public final class ShortArtifacts {
    private static final String[] ROLES = {"pv", "sp", "op", "vp", "mode"};

    private ShortArtifacts() {}

    public static List<EvidenceArtifact> artifacts(CplmShortFeatureResult r) {
        List<EvidenceArtifact> out = new ArrayList<>();
        ShortIntermediates k = r == null ? null : r.intermediates;
        if (k == null || k.samples == null || k.samples.isEmpty() || r.methodRunIds == null) return out;
        String g0 = r.methodRunIds.get("G0");
        if (g0 != null) for (String role : ROLES) {
            EvidenceArtifact a = roleQualification(g0, role, k);
            if (a != null) out.add(stamp(a, r));
        }
        if (k.pv.length == 0) return out;                                      // G0 FAIL: nothing else was evaluated
        String g1 = r.methodRunIds.get("G1");
        if (g1 != null) {
            out.add(stamp(modeAuthority(g1, k), r));
            out.add(stamp(stateIntervals(g1, k), r));
        }
        String g2 = r.methodRunIds.get("G2");
        if (g2 != null) out.add(stamp(spEvents(g2, k), r));
        String g2r = r.methodRunIds.get("G2r");
        if (g2r != null) out.add(stamp(operatingRegion(g2r, k), r));
        String g3 = r.methodRunIds.get("G3");
        if (g3 != null) out.add(stamp(objectiveError(g3, k, r), r));
        String g4 = r.methodRunIds.get("G4");
        if (g4 != null) out.add(stamp(controlActivity(g4, k, r), r));
        return out;
    }

    private static EvidenceArtifact stamp(EvidenceArtifact a, CplmShortFeatureResult r) {
        ArtifactSupport.stamp(a, r.loopId, r.windowKind, r.windowStartMs, r.windowEndMs, r.bundleHash, r.datasetHash);
        return a;
    }

    /** G0 per role: sample_time, verified_time, arrival_time, value, quality_native, quality_normalized, hold_kind, age_s, delta_t_s, accepted_mask, exclusion_reason. */
    static EvidenceArtifact roleQualification(String runId, String role, ShortIntermediates k) {
        int n = k.samples.size();
        double[] sampleTime = new double[n], verified = new double[n], arrival = new double[n], value = new double[n], age = new double[n], deltaT = new double[n];
        boolean[] accepted = new boolean[n];
        ArtifactSupport.Coder qNative = new ArtifactSupport.Coder(n), qNorm = new ArtifactSupport.Coder(n), hold = new ArtifactSupport.Coder(n), excl = new ArtifactSupport.Coder(n);
        ArtifactSupport.Coder modeCodes = "mode".equals(role) ? new ArtifactSupport.Coder(n) : null;
        boolean any = false;
        double prevT = Double.NaN;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = k.samples.get(i);
            RoleObservation o = s.role(role);
            if (o == null) {
                sampleTime[i] = s.eventTsMs;
                verified[i] = Double.NaN;
                arrival[i] = s.ingestTsMs > 0 ? s.ingestTsMs : Double.NaN;
                value[i] = Double.NaN;
                age[i] = Double.NaN;
                deltaT[i] = Double.NaN;
                qNative.put(i, "ABSENT");
                qNorm.put(i, "UNKNOWN");
                hold.put(i, "NONE");
                excl.put(i, "ROLE_ABSENT");
                if (modeCodes != null) modeCodes.put(i, "ABSENT");
                continue;
            }
            any = true;
            sampleTime[i] = o.sampleTsMs > 0 ? o.sampleTsMs : s.eventTsMs;
            verified[i] = o.verifiedTsMs > 0 ? o.verifiedTsMs : sampleTime[i];
            arrival[i] = s.ingestTsMs > 0 ? s.ingestTsMs : Double.NaN;
            if (modeCodes != null) {
                modeCodes.put(i, o.stringValue == null ? "UNKNOWN" : o.stringValue);
                value[i] = modeCodes.values()[i];
            } else {
                value[i] = o.value == null ? Double.NaN : o.value;
            }
            age[i] = o.ageMs / 1000.0;
            deltaT[i] = Double.isNaN(prevT) ? Double.NaN : (sampleTime[i] - prevT) / 1000.0;
            prevT = sampleTime[i];
            qNative.put(i, o.qualityNative == null || o.qualityNative.isEmpty() ? "NONE" : o.qualityNative);
            qNorm.put(i, o.quality);
            hold.put(i, RoleObservation.SOURCE_LEGACY_TUPLE.equals(o.provenance) ? "LEGACY_TUPLE" : o.held ? "HELD_PREVIOUS" : "NONE");
            String reason = "NONE";
            if (o.reason != null && !o.reason.isEmpty()) reason = o.reason;
            else if (!"GOOD".equals(o.quality)) reason = o.quality + "_QUALITY";
            else if (modeCodes == null && (o.value == null || !Double.isFinite(o.value))) reason = "NON_FINITE";
            excl.put(i, reason);
            accepted[i] = "NONE".equals(reason);
        }
        if (!any) return null;                                                   // the loop maps no such role: no artifact, no fake series
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G0", "role_qualification", role.toUpperCase(),
                "sample_time", ArtifactSupport.MS_EPOCH, "value", "mode".equals(role) ? "code" : roleUnit(k, role), sampleTime, value, accepted);
        a.column("verified_time", ArtifactSupport.MS_EPOCH, verified);
        a.column("arrival_time", ArtifactSupport.MS_EPOCH, arrival);
        qNative.attach(a, "quality_native");
        qNorm.attach(a, "quality_normalized");
        hold.attach(a, "hold_kind");
        a.column("age_s", "s", age);
        a.column("delta_t_s", "s", deltaT);
        excl.attach(a, "exclusion_reason");
        if (modeCodes != null) a.legends.put("value", modeCodes.legend());
        a.provenance.put("accepted_mask", "mask");
        a.provenance.put("role", role.toUpperCase());
        return a;
    }

    private static String roleUnit(ShortIntermediates k, String role) {
        for (CplmNormalizedSample s : k.samples) {
            RoleObservation o = s.role(role);
            if (o != null && o.unit != null && !o.unit.isEmpty()) return o.unit;
        }
        return "op".equals(role) || "vp".equals(role) ? "pp" : "EU";
    }

    /** G1: mode_native, mode_normalized, controlling_authority, selector_id, selected, tracking, op_requested, u_applied. */
    static EvidenceArtifact modeAuthority(String runId, ShortIntermediates k) {
        int n = k.samples.size();
        double[] t = new double[n], opRequested = new double[n], uApplied = new double[n];
        ArtifactSupport.Coder modeNative = new ArtifactSupport.Coder(n), modeNorm = new ArtifactSupport.Coder(n), authority = new ArtifactSupport.Coder(n);
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = k.samples.get(i);
            RoleObservation m = s.role("mode");
            t[i] = s.eventTsMs;
            modeNative.put(i, m == null || m.modeNative == null ? "UNKNOWN" : m.modeNative);
            modeNorm.put(i, s.mode == null ? "UNKNOWN" : s.mode);
            authority.put(i, s.isAutoMode() ? "CONTROLLER" : "MAN".equalsIgnoreCase(s.mode) ? "OPERATOR" : "UNKNOWN");
            opRequested[i] = k.op[i];
            uApplied[i] = s.vp != null && Double.isFinite(s.vp) ? s.vp : k.op[i];
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G1", "mode_authority", "MODE", "sample_time", ArtifactSupport.MS_EPOCH,
                "mode_normalized", "code", t, modeNorm.values(), k.autoMask);
        a.legends.put("mode_normalized", modeNorm.legend());
        modeNative.attach(a, "mode_native");
        authority.attach(a, "controlling_authority");
        a.column("op_requested", "pp", opRequested);
        a.column("u_applied", "pp", uApplied);
        a.provenance.put("selector_id", ArtifactSupport.NOT_MAPPED);
        a.provenance.put("selected", ArtifactSupport.NOT_MAPPED);
        a.provenance.put("tracking", ArtifactSupport.NOT_MAPPED);
        a.provenance.put("mask", "auto_authority");
        return a;
    }

    /** G1 state_intervals: one row per run of one normalised mode (x = start, y = duration s). */
    static EvidenceArtifact stateIntervals(String runId, ShortIntermediates k) {
        int n = k.samples.size();
        List<double[]> rows = new ArrayList<>();
        List<String> states = new ArrayList<>();
        int start = 0;
        for (int i = 1; i <= n; i++) {
            if (i == n || !String.valueOf(k.samples.get(i).mode).equals(String.valueOf(k.samples.get(start).mode))) {
                long from = k.samples.get(start).eventTsMs;
                long to = i < n ? k.samples.get(i).eventTsMs : k.windowEndMs;
                rows.add(new double[] {from, (to - from) / 1000.0});
                states.add(String.valueOf(k.samples.get(start).mode));
                start = i;
            }
        }
        double[] x = new double[rows.size()], y = new double[rows.size()];
        ArtifactSupport.Coder state = new ArtifactSupport.Coder(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            x[i] = rows.get(i)[0];
            y[i] = rows.get(i)[1];
            state.put(i, states.get(i));
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G1", "state_intervals", "MODE", "start_time", ArtifactSupport.MS_EPOCH, "duration", "s", x, y, null);
        state.attach(a, "state");
        return a;
    }

    /** G2: sp, pv, d_sp_dt, event_id, trigger_threshold, stable_pre_mask, event_type. */
    static EvidenceArtifact spEvents(String runId, ShortIntermediates k) {
        int n = k.samples.size();
        double[] t = new double[n], eventId = new double[n], stablePre = new double[n];
        ArtifactSupport.Coder type = new ArtifactSupport.Coder(n);
        int events = 0;
        for (int i = 0; i < n; i++) {
            t[i] = k.samples.get(i).eventTsMs;
            boolean change = i > 0 && Math.abs(k.sp[i] - k.sp[i - 1]) > com.ams.flink.cplm.engine.SignalMath.SP_CHANGE_THRESHOLD;
            if (change) events++;
            eventId[i] = change ? events : 0;
            stablePre[i] = i > 0 && !change ? 1 : 0;
            type.put(i, change ? "SP_CHANGE" : "NONE");
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G2", "sp_events", "SP", "sample_time", ArtifactSupport.MS_EPOCH, "sp", "EU", t, k.sp, null);
        a.column("pv", "EU", k.pv);
        a.column("d_sp_dt", "EU/s", k.dSpDt);
        a.column("event_id", "ordinal", eventId);
        a.column("stable_pre_mask", "boolean", stablePre);
        type.attach(a, "event_type");
        a.provenance.put("trigger_threshold", k.spStabilityBandEu);
        a.provenance.put("trigger_threshold_source", k.spStabilityBandSource);
        a.provenance.put("stable_pre_mask.definition", "SP unchanged since the previous sample (|dSP| <= " + com.ams.flink.cplm.engine.SignalMath.SP_CHANGE_THRESHOLD + ")");
        return a;
    }

    /** G2r: pv, u_applied, region_vertices_or_bounds, domain_mask, operating_regime_id. */
    static EvidenceArtifact operatingRegion(String runId, ShortIntermediates k) {
        int n = k.samples.size();
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = k.samples.get(i).eventTsMs;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G2r", "operating_region", "PV_VS_U", "sample_time", ArtifactSupport.MS_EPOCH, "pv", "EU", t, k.pv, k.domainMask);
        a.column("u_applied", "pp", k.op);
        a.provenance.put("domain_mask", "mask");
        a.provenance.put("region_vertices_or_bounds", "pv:[" + k.profile.regionPvMin + "," + k.profile.regionPvMax + "];u:[" + k.profile.regionOpMin + "," + k.profile.regionOpMax + "]");
        a.provenance.put("operating_regime_id", k.profile.gateProfileId == null || k.profile.gateProfileId.isEmpty() ? "DEFAULT" : k.profile.gateProfileId);
        return a;
    }

    /** G3: error, tolerance_band, cumulative_iae, cumulative_ise, cumulative_itae, eligible_duration, objective_id, benchmark_interval. */
    static EvidenceArtifact objectiveError(String runId, ShortIntermediates k, CplmShortFeatureResult r) {
        int n = k.samples.size();
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = k.samples.get(i).eventTsMs;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G3", "objective_error", "ERROR", "sample_time", ArtifactSupport.MS_EPOCH, "error", "EU", t, k.err, k.goodErrorMask);
        a.column("cumulative_iae", "EU*s", k.cumIae);
        a.column("cumulative_ise", "EU^2*s", k.cumIse);
        a.column("cumulative_itae", "EU*s^2", k.cumItae);
        a.provenance.put("tolerance_band", k.goodErrorBand);
        a.provenance.put("eligible_duration", n * k.tsSec);
        a.provenance.put("objective_id", "PROFILE_GOOD_ERROR_BAND");
        a.provenance.put("benchmark_interval", r.windowKind);
        a.provenance.put("mask", "within_tolerance_band");
        return a;
    }

    /** G4: u_applied, vp, delta_u, reversal_markers, command_total_variation, measured_travel_variation, sigma_u_norm, sigma_pv_norm, baseline_activity. */
    static EvidenceArtifact controlActivity(String runId, ShortIntermediates k, CplmShortFeatureResult r) {
        int n = k.samples.size();
        double[] t = new double[n], vp = new double[n];
        boolean vpMapped = false;
        double vpTravel = 0;
        for (int i = 0; i < n; i++) {
            CplmNormalizedSample s = k.samples.get(i);
            t[i] = s.eventTsMs;
            vp[i] = s.vp != null && Double.isFinite(s.vp) ? s.vp : Double.NaN;
            if (!Double.isNaN(vp[i])) vpMapped = true;
            if (i > 0 && !Double.isNaN(vp[i]) && !Double.isNaN(vp[i - 1])) vpTravel += Math.abs(vp[i] - vp[i - 1]);
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G4", "control_activity", "OP", "sample_time", ArtifactSupport.MS_EPOCH, "u_applied", "pp", t, k.op, k.reversalMask);
        a.column("vp", "pp", vp);
        a.column("delta_u", "pp", k.deltaU);
        a.provenance.put("reversal_markers", "mask");
        a.provenance.put("command_total_variation", k.commandTotalVariation);
        a.provenance.put("measured_travel_variation", vpMapped ? String.valueOf(vpTravel) : ArtifactSupport.NOT_MAPPED);
        a.provenance.put("sigma_u_norm", k.sigmaUNorm);
        a.provenance.put("sigma_pv_norm", Double.isNaN(k.sigmaPvNorm) ? "NO_PV_SPAN" : String.valueOf(k.sigmaPvNorm));
        a.provenance.put("baseline_activity", r.gate4WarnRatio);
        a.provenance.put("activity_basis", r.activityBasis);
        return a;
    }
}
