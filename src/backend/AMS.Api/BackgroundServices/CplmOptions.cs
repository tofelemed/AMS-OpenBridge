namespace AMS.Api.BackgroundServices;

/// <summary>
/// Extraction Phase 6 — extracted from the deleted CplmResultConsumerService.cs
/// because RawLoopIotDbConsumer (which stays: raw loop samples → IoTDB
/// historian, its own consumer group) reads SamplesTopic from it. The result/
/// frame consumers that used the other fields now live in cplm-api.
/// </summary>
public sealed class CplmOptions
{
    public const string SectionName = "Cplm";
    public string SamplesTopic { get; set; } = "loop.samples.v1";
    public string GateResultsTopic { get; set; } = "clpm.gate.results.v1";
    public string ShortFeatureTopic { get; set; } = "clpm.feature.short.v1";
    public string LongFeatureTopic { get; set; } = "clpm.feature.long.v1";
    public string ConsumerGroupId { get; set; } = "ams-api-cplm-results";
}
