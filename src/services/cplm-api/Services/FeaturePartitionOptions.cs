namespace Traverse.CplmApi.Services;

/// <summary>CHG-033 — "Cplm:Partitions" section: the plant's partitioned result tables. Defaults are the plant's; the lab overrides nothing.</summary>
public sealed class FeaturePartitionOptions
{
    public const string SectionName = "Cplm:Partitions";
    public bool Enabled { get; set; } = true;
    /// <summary>How often the pass runs. Minutes (floor 5).</summary>
    public int MaintenanceMinutes { get; set; } = 60;
    /// <summary>Days ahead of today that must have a partition (a gateway clock ahead of ours still lands in a real day, never in DEFAULT).</summary>
    public int LookaheadDays { get; set; } = 2;
    /// <summary>CREATE / DROP of a partition takes a brief ACCESS EXCLUSIVE lock on the parent: yield to a long reader instead of queuing the writer behind it.</summary>
    public int LockTimeoutSeconds { get; set; } = 5;
}
