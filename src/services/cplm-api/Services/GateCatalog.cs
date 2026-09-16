namespace Traverse.CplmApi.Services;

/// <summary>
/// The 17 gates in evaluation order (G0–G4 short, G5–G11 long, G12–G15 fusion) and the
/// method each one is backed by in THIS build. Moved out of CpmAnalyticsController in v2.5
/// (Task 0.4) so the capability manifest, the gate catalogue and the tests share one list.
///
/// <para>State semantics (spec v6 §5.3): INSTALLED = a numerical method produces the
/// gate; LEGACY_FLAG_ONLY = the gate is a boolean stamped from registry/broadcast
/// evidence, not an analysis (R01 G12, R09 G13, R02 G14). Phase 2 replaces those.</para>
/// </summary>
public static class GateCatalog
{
    public sealed record GateDef(string Key, string Name, string Tier);

    public sealed record GateMethod(string Gate, string MethodId, string Version, string State);

    public static readonly GateDef[] Defs =
    {
        new("G0",  "Data quality",        "short"),
        new("G1",  "Mode / service",      "short"),
        new("G2",  "SP activity",         "short"),
        new("G2r", "Operating region",    "short"),
        new("G3",  "Base performance",    "short"),
        new("G4",  "Actuator effort",     "short"),
        new("G5",  "Oscillation (ACF)",   "long"),
        new("G6",  "Spectral (FFT)",      "long"),
        new("G7",  "Stiction shape",      "long"),
        new("G8",  "Horch oddness",       "long"),
        new("G9",  "Phase geometry",      "long"),
        new("G10", "Valve / saturation",  "long"),
        new("G11", "Sensor health",       "long"),
        new("G12", "Step-test evidence",  "fusion"),
        new("G13", "Disturbance context", "fusion"),
        new("G14", "VP confirmation",     "fusion"),
        new("G15", "Diagnosis band",      "fusion")
    };

    /// <summary>
    /// Installed method per gate. Versions are the engine's calculation version for real
    /// methods; flag-only gates are labelled so a UI never presents them as analyses.
    /// </summary>
    public static readonly GateMethod[] InstalledMethods =
    {
        new("G0",  "G0.DATA_QUALITY",        "3.0.0",  "INSTALLED"),
        new("G1",  "G1.MODE_SERVICE",        "3.0.0",  "INSTALLED"),
        new("G2",  "G2.SP_STABILITY",        "3.0.0",  "INSTALLED"),
        new("G2r", "G2r.OPERATING_REGION",   "3.0.0",  "INSTALLED"),
        new("G3",  "G3.BASE_PERFORMANCE",    "3.0.0",  "INSTALLED"),
        new("G4",  "G4.ACTUATOR_EFFORT",     "3.0.0",  "INSTALLED"),
        new("G5",  "G5.ACF_OSCILLATION",     "3.0.0",  "INSTALLED"),
        new("G6",  "G6.FFT_SPECTRAL",        "3.0.0",  "INSTALLED"),
        new("G7",  "G7.SINE_TRIANGLE_SHAPE", "3.0.0",  "INSTALLED"),
        new("G8",  "G8.XCORR_ASYMMETRY",     "3.0.0",  "INSTALLED"),
        new("G9",  "G9.PHASE_GEOMETRY",      "3.0.0",  "INSTALLED"),
        new("G10", "G10.SATURATION",         "3.0.0",  "INSTALLED"),
        new("G11", "G11.SENSOR_FREEZE",      "3.0.0",  "INSTALLED"),
        new("G12", "G12.STEP_TEST_FLAG",     "legacy", "LEGACY_FLAG_ONLY"),
        new("G13", "G13.PEER_LINK_FLAG",     "legacy", "LEGACY_FLAG_ONLY"),
        new("G14", "G14.VP_PRESENCE",        "legacy", "LEGACY_FLAG_ONLY"),
        new("G15", "G15.FUSION",             "3.0.0",  "INSTALLED")
    };
}
