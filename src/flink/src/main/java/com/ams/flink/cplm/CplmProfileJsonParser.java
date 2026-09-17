package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Locale;

/**
 * The field-by-field reader of a dynamics profile JSON blob (the legacy class-pack / per-loop
 * override attributes on the metadata plane). v2.5 (3C.1): a blob that does not parse is an
 * error the caller counts and reports, never a silent null.
 */
public final class CplmProfileJsonParser {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CplmProfileJsonParser() {
    }

    /** Parses a profile JSON blob (class pack or per-loop override) onto the class pack; a malformed blob throws with the cause. */
    public static CplmLoopDynamicsProfile parse(String json, CplmLoopDynamicsProfile.ProfileSource source) {
        try {
            JsonNode root = MAPPER.readTree(json);
            if (root.isTextual()) root = MAPPER.readTree(root.asText());
            CplmLoopDynamicsProfile.LoopClass cls = CplmLoopDynamicsProfile.LoopClass.UNKNOWN;
            String c = root.path("class").asText("");
            if (!c.isEmpty()) {
                try {
                    cls = CplmLoopDynamicsProfile.LoopClass.valueOf(c.toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep UNKNOWN */ }
            }
            if (cls == CplmLoopDynamicsProfile.LoopClass.UNKNOWN) {
                String gp = root.path("gateProfileId").asText("");
                CplmLoopDynamicsProfile.LoopClass parsed = CplmLoopDynamicsProfile.parseClass(gp);
                if (parsed != null) cls = parsed;
            }
            CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(cls);
            p.profileSource = source;
            if (root.has("tauMinS")) p.tauMinS = root.path("tauMinS").asDouble(p.tauMinS);
            if (root.has("tauMaxS")) p.tauMaxS = root.path("tauMaxS").asDouble(p.tauMaxS);
            if (root.has("minSamplesPerPeriod")) p.minSamplesPerPeriod = root.path("minSamplesPerPeriod").asInt(p.minSamplesPerPeriod);
            if (root.has("minValidCycles")) p.minValidCycles = root.path("minValidCycles").asInt(p.minValidCycles);
            if (root.has("cornerAngleDeg")) p.cornerAngleDeg = root.path("cornerAngleDeg").asDouble(p.cornerAngleDeg);
            if (root.has("opDeadbandPct")) p.opDeadbandPct = root.path("opDeadbandPct").asDouble(p.opDeadbandPct);
            if (root.has("vpMaxAgeS")) p.vpMaxAgeS = root.path("vpMaxAgeS").asDouble(p.vpMaxAgeS);
            if (root.has("opTravelFloorPct")) p.opTravelFloorPct = root.path("opTravelFloorPct").asDouble(p.opTravelFloorPct);
            if (root.has("effortRatioFloor")) p.effortRatioFloor = root.path("effortRatioFloor").asDouble(p.effortRatioFloor);
            if (root.has("phaseAreaPerCycleLo")) p.phaseAreaPerCycleLo = root.path("phaseAreaPerCycleLo").asDouble(p.phaseAreaPerCycleLo);
            if (root.has("phaseAreaPerCycleHi")) p.phaseAreaPerCycleHi = root.path("phaseAreaPerCycleHi").asDouble(p.phaseAreaPerCycleHi);
            if (root.has("priorStiction")) p.priorStiction = root.path("priorStiction").asDouble(p.priorStiction);
            if (root.has("stictionPrior")) p.priorStiction = root.path("stictionPrior").asDouble(p.priorStiction);
            if (root.has("priorOscillation")) p.priorOscillation = root.path("priorOscillation").asDouble(p.priorOscillation);
            if (root.has("oscillationPrior")) p.priorOscillation = root.path("oscillationPrior").asDouble(p.priorOscillation);
            if (root.has("priorEffort")) p.priorEffort = root.path("priorEffort").asDouble(p.priorEffort);
            if (root.has("effortPrior")) p.priorEffort = root.path("effortPrior").asDouble(p.priorEffort);
            if (root.has("priorGeometry")) p.priorGeometry = root.path("priorGeometry").asDouble(p.priorGeometry);
            if (root.has("geometryPrior")) p.priorGeometry = root.path("geometryPrior").asDouble(p.priorGeometry);
            if (root.path("familyPriors").isObject()) {
                JsonNode priors = root.path("familyPriors");
                if (priors.has("stiction")) p.priorStiction = priors.path("stiction").asDouble(p.priorStiction);
                if (priors.has("oscillation")) p.priorOscillation = priors.path("oscillation").asDouble(p.priorOscillation);
                if (priors.has("effort")) p.priorEffort = priors.path("effort").asDouble(p.priorEffort);
                if (priors.has("geometry")) p.priorGeometry = priors.path("geometry").asDouble(p.priorGeometry);
            }
            if (root.has("geometryFamilyEnabled")) p.geometryFamilyEnabled = root.path("geometryFamilyEnabled").asBoolean(p.geometryFamilyEnabled);
            if (root.has("integrating")) p.integrating = root.path("integrating").asBoolean(p.integrating);
            if (root.has("opEngMin")) p.opEngMin = root.path("opEngMin").asDouble(p.opEngMin);
            if (root.has("opEngMax")) p.opEngMax = root.path("opEngMax").asDouble(p.opEngMax);
            if (root.has("pvEngMin")) p.pvEngMin = root.path("pvEngMin").asDouble(p.pvEngMin);
            if (root.has("pvEngMax")) p.pvEngMax = root.path("pvEngMax").asDouble(p.pvEngMax);
            if (root.has("goodErrorBandPctOfSpan"))
                p.goodErrorBandPctOfSpan = root.path("goodErrorBandPctOfSpan").asDouble(p.goodErrorBandPctOfSpan);
            if (root.has("gateProfileId")) p.gateProfileId = root.path("gateProfileId").asText(p.gateProfileId);
            if (root.has("dynamicClass")) {
                try {
                    p.dynamicClass = CplmLoopDynamicsProfile.DynamicClass.valueOf(
                            root.path("dynamicClass").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("serviceObjective")) {
                try {
                    p.serviceObjective = CplmLoopDynamicsProfile.ServiceObjective.valueOf(
                            root.path("serviceObjective").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("geometryRole")) {
                try {
                    p.geometryRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("geometryRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("shapeRole")) {
                try {
                    p.shapeRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("shapeRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("horchRole")) {
                try {
                    p.horchRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("horchRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("saturationRole")) {
                try {
                    p.saturationRole = CplmLoopDynamicsProfile.GateRole.valueOf(
                            root.path("saturationRole").asText().toUpperCase(Locale.ROOT));
                } catch (Exception ignored) { /* keep */ }
            }
            if (root.has("geometryAloneForbidden")) {
                p.geometryAloneForbidden = root.path("geometryAloneForbidden").asBoolean(p.geometryAloneForbidden);
            }
            if (root.has("requireOscillationForStiction")) {
                p.requireOscillationForStiction = root.path("requireOscillationForStiction").asBoolean(p.requireOscillationForStiction);
            }
            if (root.has("minNonGeometryEvidences")) {
                p.minNonGeometryEvidences = root.path("minNonGeometryEvidences").asInt(p.minNonGeometryEvidences);
            }
            if (root.has("persistenceWindows")) {
                p.persistenceWindows = root.path("persistenceWindows").asInt(p.persistenceWindows);
            }
            if (root.has("persistenceMinAgree")) {
                p.persistenceMinAgree = root.path("persistenceMinAgree").asInt(p.persistenceMinAgree);
            }
            if (root.has("regionPvMin")) p.regionPvMin = root.path("regionPvMin").asDouble(p.regionPvMin);
            if (root.has("regionPvMax")) p.regionPvMax = root.path("regionPvMax").asDouble(p.regionPvMax);
            if (root.has("regionOpMin")) p.regionOpMin = root.path("regionOpMin").asDouble(p.regionOpMin);
            if (root.has("regionOpMax")) p.regionOpMax = root.path("regionOpMax").asDouble(p.regionOpMax);
            if (root.has("spRangePassMax")) {                     // legacy alias: an EU band
                p.spRangePassMax = root.path("spRangePassMax").asDouble(p.spRangePassMax);
                p.spStabilityBandPvEu = p.spRangePassMax;
            }
            if (root.has("spStabilityBandPvEu") && !root.get("spStabilityBandPvEu").isNull()) {
                p.spStabilityBandPvEu = root.path("spStabilityBandPvEu").asDouble();
            }
            if (root.has("spStabilityBandSpanFraction")) p.spStabilityBandSpanFraction = root.path("spStabilityBandSpanFraction").asDouble(p.spStabilityBandSpanFraction);
            if (root.has("g4ActivityWarnRatio")) p.g4ActivityWarnRatio = root.path("g4ActivityWarnRatio").asDouble(p.g4ActivityWarnRatio);
            if (root.has("g4ActivityHighRatio")) p.g4ActivityHighRatio = root.path("g4ActivityHighRatio").asDouble(p.g4ActivityHighRatio);
            if (root.has("limitTolerancePp")) p.limitTolerancePp = root.path("limitTolerancePp").asDouble(p.limitTolerancePp);
            if (root.has("limitDwellWarnS")) p.limitDwellWarnS = root.path("limitDwellWarnS").asDouble(p.limitDwellWarnS);
            if (root.has("g6SegmentSamples")) p.g6SegmentSamples = root.path("g6SegmentSamples").asInt(p.g6SegmentSamples);
            if (root.has("g6OverlapFraction")) p.g6OverlapFraction = root.path("g6OverlapFraction").asDouble(p.g6OverlapFraction);
            if (root.has("g6DetrendMode")) p.g6DetrendMode = root.path("g6DetrendMode").asText(p.g6DetrendMode);
            if (root.has("g6BandCyclesPerSegment")) p.g6BandCyclesPerSegment = root.path("g6BandCyclesPerSegment").asDouble(p.g6BandCyclesPerSegment);
            if (root.has("g13LagMaxS")) p.g13LagMaxS = root.path("g13LagMaxS").asDouble(p.g13LagMaxS);
            if (root.has("g13CoherenceMin")) p.g13CoherenceMin = root.path("g13CoherenceMin").asDouble(p.g13CoherenceMin);
            if (root.has("g13XcorrMin")) p.g13XcorrMin = root.path("g13XcorrMin").asDouble(p.g13XcorrMin);
            if (root.has("g13MinCompatibleSupportS")) p.g13MinCompatibleSupportS = root.path("g13MinCompatibleSupportS").asDouble(p.g13MinCompatibleSupportS);
            if (root.has("g13MaxPeers")) p.g13MaxPeers = root.path("g13MaxPeers").asInt(p.g13MaxPeers);
            if (root.has("freezeToleranceEu")) p.freezeToleranceEu = root.path("freezeToleranceEu").asDouble(p.freezeToleranceEu);
            if (root.has("freezeDwellS")) p.freezeDwellS = root.path("freezeDwellS").asDouble(p.freezeDwellS);
            if (root.has("nonfollowingErrorPp")) p.nonfollowingErrorPp = root.path("nonfollowingErrorPp").asDouble(p.nonfollowingErrorPp);
            if (root.has("nonfollowingDwellS")) p.nonfollowingDwellS = root.path("nonfollowingDwellS").asDouble(p.nonfollowingDwellS);
            if (root.has("recoverySupportS")) p.recoverySupportS = root.path("recoverySupportS").asDouble(p.recoverySupportS);
            if (root.has("goodErrorPctPassMin")) p.goodErrorPctPassMin = root.path("goodErrorPctPassMin").asDouble(p.goodErrorPctPassMin);
            if (root.has("satLowPct")) p.satLowPct = root.path("satLowPct").asDouble(p.satLowPct);
            if (root.has("satHighPct")) p.satHighPct = root.path("satHighPct").asDouble(p.satHighPct);
            if (root.has("satWarnOccupancy")) p.satWarnOccupancy = root.path("satWarnOccupancy").asDouble(p.satWarnOccupancy);
            if (root.has("satLimitDwellSamplesWarn")) p.satLimitDwellSamplesWarn = root.path("satLimitDwellSamplesWarn").asInt(p.satLimitDwellSamplesWarn);
            if (root.has("pvFilterType")) p.pvFilterType = root.path("pvFilterType").asText(p.pvFilterType);
            if (root.has("pvFilterWindow")) p.pvFilterWindow = root.path("pvFilterWindow").asInt(p.pvFilterWindow);
            if (root.path("pvFilter").isObject()) {
                JsonNode filter = root.path("pvFilter");
                if (filter.has("type")) p.pvFilterType = filter.path("type").asText(p.pvFilterType);
                if (filter.has("window")) p.pvFilterWindow = filter.path("window").asInt(p.pvFilterWindow);
            }
            if (root.has("acfRegularityMin")) p.acfRegularityMin = root.path("acfRegularityMin").asDouble(p.acfRegularityMin);
            if (root.has("fftPeakToMedianMin")) p.fftPeakToMedianMin = root.path("fftPeakToMedianMin").asDouble(p.fftPeakToMedianMin);
            return p;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("profile JSON does not parse: " + e.getMessage(), e);
        }
    }
}
