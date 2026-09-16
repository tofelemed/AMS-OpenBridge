namespace Traverse.CplmApi.BackgroundServices;

/// <summary>CPLM consumer configuration ("Cplm" section); defaults match the deployed topics.</summary>
public sealed class CplmOptions
{
    public const string SectionName = "Cplm";
    public string SamplesTopic { get; set; } = "traverse.cpa.loop.samples.v1";
    public string GateResultsTopic { get; set; } = "traverse.cpa.clpm.gate.results.v1";
    public string ShortFeatureTopic { get; set; } = "traverse.cpa.clpm.feature.short.v1";
    public string LongFeatureTopic { get; set; } = "traverse.cpa.clpm.feature.long.v1";
    /** v2.5 (Task 1D.5): fast-path G10/G11 conditions from CplmConditionStreamJob. */
    public string ConditionTopic { get; set; } = "traverse.cpa.clpm.condition.v1";
    /** v2.5 (Task 1G.3): evidence manifests + chunks from the engine jobs, keyed by method_run_id. */
    public string EvidenceTopic { get; set; } = "traverse.cpa.clpm.gate.evidence.v1";
    /** v2.5 (Task 1H.5): Instrumental NE107 observations (gateway-wrapped) and the Flink health contexts. */
    public string InstrumentHealthTopic { get; set; } = "traverse.cpa.instrument.health.v1";
    public string InstrumentHealthContextTopic { get; set; } = "traverse.cpa.context.instrument-health.v1";
    /** v2.5 (Task 2B.2): G12 system-response results, one record per captured event. */
    public string ResponseTopic { get; set; } = "traverse.cpa.clpm.response.results.v1";
    /// <summary>v2.5 (Phase 3): governed gate configuration - immutable bundles out, worker ACKs / CAPABILITY records in.</summary>
    public string GateConfigTopic { get; set; } = "traverse.cpa.context.gate-config.v1";
    public string GateConfigAcksTopic { get; set; } = "traverse.cpa.context.gate-config.acks.v1";
    public string ConsumerGroupId { get; set; } = "traverse-cpa-cplm-results";
}
