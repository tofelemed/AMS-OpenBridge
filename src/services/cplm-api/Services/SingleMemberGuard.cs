using Confluent.Kafka;
using Confluent.Kafka.Admin;

namespace Traverse.CplmApi.Services;

/// <summary>
/// Technical enforcement of the CPLM single-consumer-group-member rule (GAP STR-06).
///
/// The CPLM result and event-frame consumers MUST be the only member of their consumer
/// group. If a second member joins — a second cplm-api replica, or a stale ams-api image
/// still carrying the pre-Phase-6 consumers — Kafka simply splits the partitions between
/// them. Each member then persists only the windows on its own partitions, silently, with
/// no error logged anywhere: the result is half-written CPLM history that looks healthy.
///
/// Until now the only protection was the Cplm:ConsumersEnabled flag plus the convention
/// that nobody scales the service. This class turns that convention into a check:
///
///   * static membership (GroupInstanceId) makes the intended member's identity explicit
///     and stops a restart from triggering a needless rebalance;
///   * on every partition assignment we compare the assigned partitions against the topic's
///     real partition count. Holding a strict subset means somebody else holds the rest.
///
/// A split is reported as CRITICAL and surfaced on /health rather than throwing: killing
/// the process would just hand all partitions to the other member and hide the problem.
/// The operator needs to see it and stop the duplicate.
/// </summary>
public sealed class SingleMemberGuard
{
    private readonly ILogger<SingleMemberGuard> _logger;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly string _bootstrapServers;

    /// <summary>Set when a partition split is detected; surfaced by /health.</summary>
    public volatile bool SplitDetected;
    public string? SplitDetail { get; private set; }

    public SingleMemberGuard(
        ILogger<SingleMemberGuard> logger,
        ConsumerHeartbeat heartbeat,
        string bootstrapServers)
    {
        _logger           = logger;
        _heartbeat        = heartbeat;
        _bootstrapServers = bootstrapServers;
    }

    /// <summary>
    /// Verifies that <paramref name="assigned"/> covers every partition of every subscribed
    /// topic. Call from the consumer's partitions-assigned handler.
    /// </summary>
    public void VerifySoleMembership(string consumerName, List<TopicPartition> assigned)
    {
        try
        {
            var expected = GetPartitionCounts(assigned.Select(p => p.Topic).Distinct());
            var actual   = assigned
                .GroupBy(p => p.Topic)
                .ToDictionary(g => g.Key, g => g.Count());

            var shortfalls = expected
                .Where(kv => actual.TryGetValue(kv.Key, out var got) ? got < kv.Value : kv.Value > 0)
                .Select(kv => $"{kv.Key}: holding {(actual.TryGetValue(kv.Key, out var g) ? g : 0)}/{kv.Value}")
                .ToList();

            if (shortfalls.Count == 0)
            {
                if (SplitDetected)
                    _logger.LogWarning("[{Consumer}] partition assignment is whole again; split cleared.", consumerName);
                SplitDetected = false;
                SplitDetail   = null;
                return;
            }

            SplitDetected = true;
            SplitDetail   = string.Join("; ", shortfalls);

            _logger.LogCritical(
                "[{Consumer}] CONSUMER GROUP SPLIT DETECTED — this process holds only part of its topics ({Detail}). " +
                "Another member is consuming the rest, so each is persisting a SUBSET of CPLM windows with no error. " +
                "Find and stop the duplicate consumer (a second cplm-api replica, or an ams-api image predating the " +
                "Phase-6 cutover). See docs/cplm-consumer-cutover-runbook.md.",
                consumerName, SplitDetail);

            _heartbeat.Report(consumerName, "GROUP_SPLIT");
        }
        catch (Exception ex)
        {
            // Never let the guard break consumption — a metadata lookup failure is not
            // evidence of a split.
            _logger.LogWarning(ex, "[{Consumer}] could not verify sole group membership", consumerName);
        }
    }

    private Dictionary<string, int> GetPartitionCounts(IEnumerable<string> topics)
    {
        using var admin = new AdminClientBuilder(
            new AdminClientConfig { BootstrapServers = _bootstrapServers }).Build();

        var metadata = admin.GetMetadata(TimeSpan.FromSeconds(10));
        var wanted   = topics.ToHashSet(StringComparer.Ordinal);

        return metadata.Topics
            .Where(t => wanted.Contains(t.Topic) && t.Error.Code == ErrorCode.NoError)
            .ToDictionary(t => t.Topic, t => t.Partitions.Count, StringComparer.Ordinal);
    }
}
