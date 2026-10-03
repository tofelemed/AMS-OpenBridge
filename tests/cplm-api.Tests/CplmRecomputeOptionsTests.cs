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

    [Fact]
    public void TheLabNameIsOnlyTheLastResort()
    {
        Assert.Equal("kafka:9092", CplmRecomputeOptions.EffectiveBootstrapServers(null, null));
    }
}
