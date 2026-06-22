using System.Security.Cryptography;
using System.Text;

namespace AMS.Infrastructure.Kafka;

/// <summary>
/// Kafka partition keys and versioned deterministic alarm instance identity.
/// Must match Flink <c>AlarmKeys</c>. See docs/production-contracts.md §1.
/// </summary>
public static class AlarmPartitionKeys
{
    /// <summary>Increment when instance-key formula or normalization rules change.</summary>
    public const int InstanceKeySchemaVersion = 1;

    private const string V1Prefix = "v1|";

    public static string AssetKey(Guid serverId, string sourceName) =>
        $"{serverId}|{Normalize(sourceName)}";

    public static string AssetKey(string? serverId, string? sourceName) =>
        $"{Normalize(serverId)}|{Normalize(sourceName)}";

    /// <summary>Versioned ISA-18.2 instance id — activeTime is NOT part of identity.</summary>
    public static string AlarmInstanceKey(
        Guid serverId,
        string sourceName,
        string conditionName,
        string? subConditionName) =>
        AlarmInstanceKeyV1(serverId, sourceName, conditionName, subConditionName);

    public static string AlarmInstanceKeyV1(
        Guid serverId,
        string sourceName,
        string conditionName,
        string? subConditionName) =>
        $"{V1Prefix}{serverId}|{Normalize(sourceName)}|{Normalize(conditionName)}|{Normalize(subConditionName)}";

    /// <summary>
    /// Cross-version correlation for KPIs/SOE — stable when instance key formula changes.
    /// v2 migrations may remap via alias table; family id persists across versions.
    /// </summary>
    public static string LogicalAlarmFamilyId(
        Guid serverId,
        string sourceName,
        string conditionName,
        string? subConditionName) =>
        $"{serverId}|{Normalize(sourceName)}|{Normalize(conditionName)}|{Normalize(subConditionName)}";

    public static Guid LogicalAlarmFamilyUuid(string familyId) =>
        DeterministicAlarmId($"family|{familyId}");

    /// <summary>Matches Java <c>UUID.nameUUIDFromBytes(versionedInstanceKey)</c>.</summary>
    public static Guid DeterministicAlarmId(string instanceKey)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes(instanceKey));
        hash[6] = (byte)((hash[6] & 0x0F) | 0x30);
        hash[8] = (byte)((hash[8] & 0x3F) | 0x80);
        return new Guid(hash.AsSpan(0, 16));
    }

    private static string Normalize(string? s) => string.IsNullOrWhiteSpace(s) ? "" : s.Trim();
}
