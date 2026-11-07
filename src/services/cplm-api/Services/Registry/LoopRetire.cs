// CHG-146 - retire and restore a loop. Never a delete: tags, links, signal assets, bindings, events and
// every analytics row stay. Two flags carry the state because two readers need it: ingestion reads
// loop_registry.is_active, the fleet SQL reads monitoring.enabled.
namespace Traverse.CplmApi.Services;

public enum LoopRetireOutcome { NotFound, Changed, Unchanged }

/// <summary>The outcome and the id as stored (the request may differ in case).</summary>
public sealed record LoopRetireResult(LoopRetireOutcome Outcome, string? LoopId);

public sealed record CpmLoopRetireRequest(string? Reason);

public static class LoopRetireSql
{
    public const int MaxReasonLength = 500;

    /// <summary>Only a loop that is still active or monitored is touched, so a second retire writes nothing.
    /// The monitoring flag it had is kept in monitoring.enabled_before_retire for Restore.</summary>
    public const string Retire = """
        UPDATE cpm.loop_registry
        SET is_active = FALSE,
            monitoring = jsonb_set(
                jsonb_set(monitoring, '{enabled_before_retire}',
                          to_jsonb(COALESCE((monitoring->>'enabled')::boolean, FALSE)), true),
                '{enabled}', 'false', true),
            updated_at = NOW()
        WHERE lower(loop_id) = lower(@loopId)
          AND (is_active OR COALESCE((monitoring->>'enabled')::boolean, FALSE))
        RETURNING loop_id
        """;

    /// <summary>Only a retired loop is touched. monitoring.enabled returns to its value before the retire
    /// (true when none was kept) and the kept key goes.</summary>
    public const string Restore = """
        UPDATE cpm.loop_registry
        SET is_active = TRUE,
            monitoring = jsonb_set(monitoring - 'enabled_before_retire', '{enabled}',
                                   COALESCE(monitoring->'enabled_before_retire', 'true'::jsonb), true),
            updated_at = NOW()
        WHERE lower(loop_id) = lower(@loopId)
          AND is_active = FALSE
        RETURNING loop_id
        """;

    public const string StoredId = "SELECT loop_id FROM cpm.loop_registry WHERE lower(loop_id) = lower(@loopId)";
}
