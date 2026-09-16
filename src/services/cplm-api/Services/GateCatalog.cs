namespace Traverse.CplmApi.Services;

/// <summary>
/// The 17 gates in evaluation order (G0–G4 short, G5–G11 long, G12–G15 fusion) and
/// what THIS build knows about each: definition, role in fusion, the installed method and version,
/// the evidence artifact kinds the engine emits (2C.1c, verbatim), capability state. One list -
/// the capability manifest, GET /gate-catalogue and the tests all read it (v2.5 Tasks 0.4, 2D.1).
///
/// <para>State semantics (spec v6 §5.3): INSTALLED = a numerical method produces the gate;
/// LEGACY_FLAG_ONLY = a boolean stamped from registry/broadcast evidence, not an analysis
/// (none left after 2F; G13 is the aligned peer analysis); capability state UNAVAILABLE carries the reason the workbench shows.</para>
/// </summary>
public static class GateCatalog
{
    public sealed record GateDef(string Key, string Name, string Tier);

    public sealed record GateMethod(string Gate, string MethodId, string Version, string State);

    /// <summary>One catalogue entry as served (spec §3.1: definition, method, artifacts, property ids, capability).</summary>
    public sealed record GateEntry(string Gate, string Name, string Tier, string Role, string Definition, string Preconditions,
        GateMethod Method, string[] ArtifactKinds, string[] PropertyIds, string CapabilityState, string? CapabilityReason);

    private static readonly string[] NoProperties = Array.Empty<string>();   // Phase 3 fills the catalogue ids

    private static readonly GateEntry[] Entries =
    {
        E("G0", "Data quality", "short", "BLOCKING",
            "Completeness, per-role quality (UNKNOWN is never GOOD), duplicate timestamps and gaps over the window; a FAIL blocks every other gate.",
            "Samples on the window; per-role quality decoded under the source's declared protocol.",
            "G0.DATA_QUALITY", "3.0.0", new[] { "role_qualification" }),
        E("G1", "Mode / service", "short", "BLOCKING",
            "Time in automatic control and the controlling authority; manual invalidates closed-loop metrics, not actuator observations.",
            "Mode role mapped and decoded.",
            "G1.MODE_SERVICE", "3.0.0", new[] { "mode_authority", "state_intervals" }),
        E("G2", "SP activity", "short", "ELIGIBILITY",
            "Set-point stability against a declared EU band or a fraction of the declared span; SP changes are events, never noise.",
            "SP role; a stability band (EU objective or declared span) - otherwise NOT_EVALUATED, not PASS.",
            "G2.SP_STABILITY", "3.0.0", new[] { "sp_events" }),
        E("G2r", "Operating region", "short", "ELIGIBILITY",
            "Fraction of the window inside the declared PV / input operating region; out-of-domain is not a healthy process.",
            "Region bounds declared on the profile.",
            "G2r.OPERATING_REGION", "3.0.0", new[] { "operating_region" }),
        E("G3", "Base performance", "short", "PERFORMANCE",
            "Error against the objective: MAE, RMSE, IAE / ISE / ITAE over held intervals, fraction of time inside the tolerance band.",
            "PV and SP; the tolerance band from the profile (a declared objective in Phase 3).",
            "G3.BASE_PERFORMANCE", "3.0.0", new[] { "objective_error" }),
        E("G4", "Actuator effort", "short", "PERFORMANCE",
            "Control activity: applied-input variation, reversals, dimensionless activity where both spans are declared. OP travel is not valve travel.",
            "Applied input (VP when mapped and fresh, else OP); PV span for the dimensionless ratio.",
            "G4.ACTUATOR_EFFORT", "3.0.0", new[] { "control_activity" }),
        E("G5", "Oscillation (ACF)", "long", "PRIMARY",
            "Dominant period and regularity from the autocorrelation of the detrended shape signal; too few cycles or inadequate sampling reject the estimate.",
            "Enough cycles of the candidate period inside the window (>= 3) at >= 8 samples per period.",
            "G5.ACF_OSCILLATION", "3.0.0", new[] { "acf_series", "preprocessed_signal", "crossing_times" }),
        E("G6", "Spectral (PSD)", "long", "PRIMARY",
            "Welch power spectral density (Hann, declared overlap, segment spanning the declared band) with peak, harmonic and entropy scalars derived from it.",
            "The band the profile declares (tauMin..tauMax); a record long enough for the segment.",
            "G6.WELCH_PSD", "1.0.0", new[] { "psd" }),
        E("G7", "Stiction shape", "long", "SUPPORTING",
            "Per-cycle sine versus triangle fits of the shape signal; rejected cycles are kept with their reason.",
            "A valid period from G5/G6 and complete cycles.",
            "G7.SINE_TRIANGLE_SHAPE", "3.0.0", new[] { "cycle_fit" }),
        E("G8", "Lag asymmetry", "long", "SUPPORTING",
            "Cross-correlation non-reciprocity between the applied input and PV over positive and negative lags (XCORR_ASYMMETRY_V1). It is a lag asymmetry index, not an odd-harmonic spectrum, and never decisive on its own; bicoherence is not installed.",
            "Applied input and PV over the same support.",
            "G8.XCORR_ASYMMETRY_V1", "3.0.0", new[] { "lag_structure" }),
        E("G9", "Phase geometry", "long", "SUPPORTING",
            "PV versus applied-input cycle polygons: area, bounding box, corners and turning angles on the points actually scored; supporting under the correct policy.",
            "Complete cycles from G5/G6.",
            "G9.PHASE_GEOMETRY", "3.0.0", new[] { "cycle_polygon", "normalized_pairs", "corners" }),
        E("G10", "Actuator limits", "long", "PRIMARY",
            "Time at the actual applied limits from the engineering range (fallback 0-100 flagged), dwell episodes in seconds, VP tracking error where VP is mapped; VP presence is not confirmation.",
            "Applied input; engineering limits (or the flagged fallback).",
            "G10.SATURATION", "3.0.0", new[] { "actuator_limits", "dwell_events" }),
        E("G11", "Measurement health", "long", "BLOCKING",
            "PV freeze episodes, spikes and quantisation, with the transmitter's NE107 lanes (F/C/S/M) and eligibility intervals per role; absence of health is NOT_CONFIGURED, never OK.",
            "PV; an instrument binding for the health lanes.",
            "G11.SENSOR_FREEZE", "3.0.0", new[] { "measurement", "freeze_events", "eligibility_intervals" }),
        E("G12", "System response", "fusion", "CONTEXT",                // its verdict cell lives on the fused row; its evidence is event-keyed (response job)
            "Event-keyed response analysis: eligibility, event capture, observed metrics with censoring, bounded estimation on the actual applied input, holdout validation, model-domain controller outputs; no process gain from set-point response alone.",
            "A qualified reference or applied-input event with stable pre-support; VP fresh when it is the applied input.",
            "G12.SYSTEM_RESPONSE", "1.0.0", new[] { "response_event", "accepted_samples", "input_reconstruction", "y_fit", "y_predict", "prediction_interval", "confidence_interval", "baseline", "target", "response_times", "residuals", "residual_acf", "excitation_rank", "candidate_models", "delay_objective_curve", "parameter_intervals", "bode", "rejection_reasons" }),
        E("G13", "Interaction", "long", "SUPPORTING",                    // analysed on the long tier; the fused row shares its method run id
            "Aligned peer analysis over the loop's accepted support: per configured peer the nearest-sample alignment with a shared support mask, normalised cross-correlation over +/- lag_max_s and Welch magnitude-squared coherence in the loop's band. A peer is associated only when coherence and |xcorr| both clear their floors on enough shared support; an unobserved peer is UNAVAILABLE, no peers is NOT_CONFIGURED. Pairwise association is not causal direction.",
            "Peer links in the registry; the peers' samples over compatible support (min_compatible_support_s).",
            "G13.ALIGNED_PEER_ANALYSIS_V1", "1.0.0", new[] { "interaction", "aligned_series", "cross_correlation", "coherence" }),
        E("G14", "Final-element confirmation", "fusion", "CONFIRMATION",
            "Fault-scoped confirmation: CONFIRMED only from a positive non-following record (VP tracking error over a dwell with valid VP quality, or an approved test record); healthy tracking contradicts; the subtype cannot exceed the evidence scope.",
            "VP mapped, fresh and GOOD over the qualifying interval.",
            "G14.FAULT_SCOPED_CONFIRMATION", "2.0.0", new[] { "confirmation_record" }),
        E("G15", "Decision", "fusion", "FUSION",
            "Observations, hypotheses and the leading hypothesis by ranked selection (argmax, not an additive waterfall), with evidence scores labelled uncalibrated, condition and availability states, revision history.",
            "The tier results of the same support.",
            "G15.FUSION", "3.0.0", new[] { "decision_record" }),
    };

    private static GateEntry E(string gate, string name, string tier, string role, string definition, string preconditions, string methodId, string version, string[] kinds)
        => new(gate, name, tier, role, definition, preconditions, new GateMethod(gate, methodId, version, "INSTALLED"), kinds, NoProperties, "INSTALLED", null);

    public static IReadOnlyList<GateEntry> Catalogue() => Entries;

    /// <summary>Kept for the pages that only need key / name / tier.</summary>
    public static readonly GateDef[] Defs = Entries.Select(e => new GateDef(e.Gate, e.Name, e.Tier)).ToArray();

    /// <summary>Installed method per gate, derived from the catalogue so the two can never disagree.</summary>
    public static readonly GateMethod[] InstalledMethods = Entries.Select(e => e.Method).ToArray();
}
