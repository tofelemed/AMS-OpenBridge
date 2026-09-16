package com.ams.flink.cplm;


import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * The fields of the fused verdict (every gate status, score, flag, identity and record the
 * fusion job publishes). Split from {@link CplmGateResult} (v2.5, 2F.1) so each file stays
 * within the maintainability budget; the JSON writer lives on the subclass.
 */
public abstract class CplmGateResultFields implements Serializable {

    public String loopId;
    public String windowKind = "24h";
    public long windowStartMs;
    public long windowEndMs;
    public double samplePeriodSec;
    public int expectedSampleCount;
    public int sampleCount;

    // Gate 0
    public double completeness;
    public double badQualityPct;
    public double unknownQualityPct;
    public String gate0Reason = "";
    public int duplicateTimestamps;
    public double samplingJitter;
    public int gapCount;
    public double maxGapS;
    public String gate0Status = "PENDING";

    // Gate 1
    public double autoPct;
    public double manualPct;
    public double modeChangesPerHour;
    public String gate1Status = "PENDING";

    // Gate 2
    public double spMin;
    public double spMax;
    public double spRange;
    public double spChangesPerHour;
    public String gate2Status = "PENDING";

    // Gate 3
    public double mae;
    public double rmse;
    public double iae;
    public double ise;
    public double itae;
    public double goodErrorPct;
    public double oce;
    public String gate3Status = "PENDING";

    // Gate 4
    public double pvStd;
    public double opStd;
    public double effortRatio;
    /** P2-3 - unit-free effort variant; see CplmShortFeatureResult. */
    public double effortRatioNormalized;
    public double gate2BandEu;
    public String gate2BandSource = "";
    public Double activityRatioNorm;
    public String activityBasis = "";
    public String activityReason = "";
    public double gate4WarnRatio;
    public double gate4HighRatio;
    public double satLimitDwellS;
    public String limitSource = "";
    public double limitDwellWarnS;
    public List<com.ams.flink.cplm.engine.LimitMath.DwellEvent> dwellEvents = new ArrayList<>();
    public List<com.ams.flink.cplm.engine.LimitMath.FreezeEvent> freezeEvents = new ArrayList<>();
    public boolean freezeMaterial;
    public String gate11Reason = "";
    /** v2.5 R11: fast-path conditions open as of this verdict. */
    public com.ams.flink.cplm.condition.OpenConditions openConditions = com.ams.flink.cplm.condition.OpenConditions.none();
    /** v2.5 R15: the Instrumental health context (per role) this verdict was formed under. */
    public com.ams.flink.cplm.fusion.HealthLanes healthLanes = com.ams.flink.cplm.fusion.HealthLanes.none();
    /** v2.5 R02: observations / hypotheses / fault-scoped confirmation, beside the legacy fields. */
    public com.ams.flink.cplm.fusion.FusionVerdictV2 verdictV2 = new com.ams.flink.cplm.fusion.FusionVerdictV2();
    public int resultRevision = 1;
    /** v2.5 R10: the support this verdict rests on (accepted samples x period, bounded by the window), ms. */
    public long qualifiedSupportMs;
    /** v2.5 R10: from the profile - a fault-free result needs this much qualified support (s) to close an episode. */
    public double recoverySupportS;
    public double opTravel;
    public double travelPerDay;
    public int reversalCount;
    public double reversalsPerHour;
    public double saturationPct;
    public String gate4Status = "PENDING";

    // Gate 5
    public double acfPeriodS;
    public double acfRegularity;
    public double acfGamma0;
    public int acfZeroCrossingCount;
    public int acfPeriodCandidateCount;
    public String gate5Status = "PENDING";

    // Gate 6
    public int fftPeakBin;
    public int fftMaxBin;
    public double fftPeakAmplitude;
    public double fftPeakFreqHz;
    public double fftPeakPeriodS;
    public double fftPeakToMedian;
    public double fftPeakRatio;
    public double fftTotalEnergy;
    public double fftH2Amp;
    public double fftH3Amp;
    public double fftH5Amp;
    public double harmonicAmplitudeRatio;
    public double harmonicEnergyRatio;
    public int spectralEntropyBinCount;
    public double spectralEntropy;
    public String gate6Status = "PENDING";

    // Gate 7
    public double triangularity;
    public int cycleSamples;
    public String cycleSource = "NONE";
    public int completedCycles;
    public int validCycles;
    public double firstCycleSseSine;
    public double firstCycleSseTriangle;
    public String gate7Status = "PENDING";

    // Gate 8
    public double horchOddness;
    public double horchOddSum;
    public double horchEvenSum;
    public String gate8Status = "PENDING";

    // Gate 9
    public double phaseAreaNormPerCycle;
    public double phaseBboxArea;
    public double phasePathArea;
    public double windowAreaNorm;
    public double cornerScore;
    public double cornerScoreRaw;
    public double cornerScoreQualified;
    public int validTurningAngles;
    public String gate9Status = "PENDING";
    public String gate9Reason = "";
    public String periodStatus = "NO_VALID_CYCLE";
    public double validatedPeriodS;
    public String periodRejectReason = "";
    public double opRangePct;

    public String calculationVersion = CplmLoopDynamicsProfile.CALCULATION_VERSION;
    public String dynamicsProfileVersion = CplmLoopDynamicsProfile.DYNAMICS_PROFILE_VERSION;
    // v2.5 R26/C07: build identity stamped on every result (see identity/BuildIdentity).
    public String sourceCommit = com.ams.flink.cplm.identity.BuildIdentity.current().sourceCommit;
    public String jarSha256 = com.ams.flink.cplm.identity.BuildIdentity.current().jarSha256;
    public String contractVersion = com.ams.flink.cplm.identity.BuildIdentity.CONTRACT_VERSION;
    // v2.5 R19: run identity (identity/ResultIdentity). LIVE rows have no analysis run.
    public java.util.Map<String, String> methodRunIds = new java.util.LinkedHashMap<>();
    public String bundleHash = com.ams.flink.cplm.identity.ProfileHash.LEGACY;
    public int contextRevision = 0;
    public String purpose = "LIVE";
    public String analysisRunId = null;
    public String datasetHash = com.ams.flink.cplm.identity.DatasetHash.EMPTY;
    public String dynamicsClass = "UNKNOWN";
    public String profileSource = "UNKNOWN";
    public String configurationVersion = "";
    public String gateProfileId = "";
    public String dynamicClass = "";
    public String stictionSignal = "OP";
    public String gate2rStatus = "PASS";
    public double regionOutOfBandPct;
    public boolean operatingRegionValid = true;
    public int persistenceAgreeCount;
    public int persistenceWindowsRequired;
    public boolean persistenceSatisfied = true;
    public List<String> familyDisqualifiers = new ArrayList<>();

    // Gate 10–11
    public String gate10Status = "PENDING";
    public int satLimitDwellSamples;
    public boolean satCyclingPattern;
    public int freezeRunSamples;
    public double freezeIndexS;
    public int pvQuantizationCount;
    public double pvDriftPerDay;
    public double deltaPvMean;
    public double deltaPvStd;
    public int spikeCount;
    public String gate11Status = "PENDING";

    // Gate 12–15
    // P3-3 - the default used to be "EXCLUDED", which survived blockDiagnosis
    // (it only remaps PENDING) and published a verdict for gates that were
    // never looked at. PENDING like every other gate; pubStatus() maps any
    // survivor to NOT_EVALUATED at emit.
    public String gate12Status = "PENDING";
    public String gate13Status = "PENDING";
    /** v2.5 (2F.1): G13 aligned peer analysis as the long tier reported it; null when the long row predates the method. */
    public com.ams.flink.cplm.engine.InteractionSummary interaction;
    /** v2.5 (2F.1): G13 verdict source - the analysis method id, or LEGACY_FLAG_ONLY (long row without the analysis). */
    public String gate13Method = "LEGACY_FLAG_ONLY";
    public String gate13Reason = "";
    public boolean vpAvailable;
    public boolean hasStepTestEvidence;
    public boolean hasPeerLinks;
    public String gate14Status = "PENDING";
    public double g14ConfidenceCap = 0.89;
    // Weighted-path detector scores (all clamped to [0,1])
    public double oscillationScore;
    public double fftScore;
    public double effortScore;
    public double stictionScore;
    public double horchScore;
    public double geometryScore;
    public double rawFinalElementScore;
    // Selected-family path
    public double stictionFamilyScore;
    public double oscillationFamilyScore;
    public double effortFamilyScore;
    public double geometryFamilyScore;
    /**
     * P1-10 - false when the long-tier metrics on this row (ACF period, FFT,
     * triangularity, corner score, effort ratio ...) were computed on a window
     * that failed G0 or had insufficient samples. They are still published,
     * because they are the inputs to the exclusion decision, but nothing
     * downstream could previously tell them apart from full-window values.
     */
    public boolean longMetricsQualified;
    public boolean stictionQualified;
    public boolean oscillationQualified;
    public boolean effortQualified;
    public boolean geometryQualified;
    public String selectedFamily = "NONE";
    public double familyScore;
    public String gate15Status = "PENDING";
    public String statusReason = "";

    public String diagnosis = "PENDING";
    public String severity = "LOW";
    public double confidence;
    public String recommendation = "";
    public String insufficientEvidenceReason = "";
    public List<String> observabilityFlags = new ArrayList<>();
}
