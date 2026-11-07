// CHG-146 - retire and restore a loop. Never a delete: tags, links, signal assets, bindings, events and
// every analytics row stay. Two flags carry the state because two readers need it: ingestion reads
// loop_registry.is_active, the fleet SQL reads monitoring.enabled.
namespace Traverse.CplmApi.Services;

public enum LoopRetireOutcome { NotFound, Changed, Unchanged }

public sealed record CpmLoopRetireRequest(string? Reason);

public static class LoopRetireSql
{
    /// <summary>Only a loop that is still active or monitored is touched, so a second retire writes nothing.</summary>
    public const string Retire = """
        UPDATE cpm.loop_registry
        SET is_active = FALSE,
            monitoring = jsonb_set(monitoring, '{enabled}', 'false', true),
            updated_at = NOW()
        WHERE loop_id = @loopId
          AND (is_active OR COALESCE((monitoring->>'enabled')::boolean, FALSE))
        """;

    /// <summary>Only a retired loop is touched: an active loop whose monitoring was switched off by hand keeps that choice.</summary>
    public const string Restore = """
        UPDATE cpm.loop_registry
        SET is_active = TRUE,
            monitoring = jsonb_set(monitoring, '{enabled}', 'true', true),
            updated_at = NOW()
        WHERE loop_id = @loopId
          AND is_active = FALSE
        """;
}
