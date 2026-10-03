using Traverse.CplmApi.Services;
using Xunit;

/// <summary>
/// CHG-036 (2026-10-03): cplm-api handed the bounded replay/reconstruction job "--brokers kafka:9092" (the option's
/// lab-shaped default) whenever CplmRecompute:BootstrapServers was unset, while the service itself talked to the
/// plant's Kafka:BootstrapServers. The job reads the parameter-update topic in main(), so Flink refused every
/// submission at Marun. The recompute brokers now follow the service's own Kafka setting unless overridden.
/// </summary>
public class CplmRecomputeOptionsTests
{
    [Fact]
    public void FallsBackToTheServicesOwnKafkaBrokersWhenUnset()
    {
        Assert.Equal("kafka-1:9092,kafka-2:9092", CplmRecomputeOptions.EffectiveBootstrapServers(null, "kafka-1:9092,kafka-2:9092"));
        Assert.Equal("kafka-1:9092,kafka-2:9092", CplmRecomputeOptions.EffectiveBootstrapServers("  ", "kafka-1:9092,kafka-2:9092"));
    }

    [Fact]
    public void AnExplicitRecomputeSettingWins()
    {
        Assert.Equal("replay-kafka:9092", CplmRecomputeOptions.EffectiveBootstrapServers("replay-kafka:9092", "kafka-1:9092"));
    }

    /// <summary>
    /// CHG-036, fourth cause: the replay job read the historian at root.&lt;registry site&gt;.cpm.&lt;loop&gt; and found nothing at
    /// Marun (registry site hdpe, writer prefix root.site1.cpm). cplm-api now hands the job the exact device the writer
    /// uses: its own IotDbWrite:LoopRootPrefix plus the SafeNode loop name.
    /// </summary>
    [Fact]
    public void HistorianDeviceIsTheWritersPrefixPlusTheSafeNodeName()
    {
        Assert.Equal("root.site1.cpm.PIC30611", CplmRecomputeOptions.HistorianDevice("root.site1.cpm", "PIC30611"));
        Assert.Equal("root.plant.cpm.FIC_10409", CplmRecomputeOptions.HistorianDevice("root.plant.cpm.", "FIC-10409"));
        Assert.Equal("root.site1.cpm._101FIC", CplmRecomputeOptions.HistorianDevice(null, "101FIC"));
    }

    [Fact]
    public void TheLabNameIsOnlyTheLastResort()
    {
        Assert.Equal("kafka:9092", CplmRecomputeOptions.EffectiveBootstrapServers(null, null));
    }
}
