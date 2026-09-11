using System.Security.Claims;
using Traverse.Auth;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Ops endpoints for the OT subscriber pipeline. Public surface rides the existing
/// gateway route (/api/ingestion/* → this service), so no gateway change is needed.
/// </summary>
public static class PipelineEndpoints
{
    public static void MapPipelineEndpoints(this WebApplication app)
    {
        // ── GET /stats — one row per running subscriber ─────────────────────
        app.MapGet("/stats", (SubscriberStatusRegistry registry) =>
            Results.Ok(registry.Snapshot()))
            .RequireAuthorization(Perms.IngestionView);

        // ── GET /loop-health — why each registered loop is or is not flowing ──
        // Answers "why is this loop dark?" without an MQTT inventory. `?state=held`
        // is the one that matters: those loops can NEVER emit until the OT side
        // publishes the named signal.
        app.MapGet("/loop-health", (string? state, string? loopId, SubscriberStatusRegistry registry) =>
        {
            var results = new List<object>();
            foreach (var status in registry.List())
            {
                var rows = status.LoopHealth ?? Array.Empty<LoopHealthRow>();
                var filtered = rows
                    .Where(r => state is null || string.Equals(r.State, state, StringComparison.OrdinalIgnoreCase))
                    .Where(r => loopId is null || string.Equals(r.LoopId, loopId, StringComparison.OrdinalIgnoreCase))
                    // Worst first: held before idle before flowing, so the actionable
                    // rows are on screen without paging.
                    .OrderBy(r => r.State switch
                    {
                        LoopHealthState.Held => 0,
                        LoopHealthState.Silent => 1,
                        LoopHealthState.Idle => 2,
                        _ => 3,
                    })
                    .ThenBy(r => r.LoopId, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                results.Add(new
                {
                    configId = status.ConfigId,
                    name = status.Name,
                    summary = LoopHealthSummary.From(rows).ToPayload(),
                    loops = filtered,
                });
            }
            return Results.Ok(results);
        }).RequireAuthorization(Perms.IngestionView);

        // ── GET /unknown-sources — the reviewable parking inventory ─────────
        app.MapGet("/unknown-sources", async (
            Guid? configId, int? limit, UnknownSourceRepository repo, CancellationToken ct) =>
        {
            var capped = Math.Clamp(limit ?? 200, 1, 1000);
            var rows = await repo.ListAsync(configId, capped, ct);
            return Results.Ok(rows.Select(r => new
            {
                configId = r.ConfigId,
                reason = r.Reason,
                sourceKey = r.SourceKey,
                firstSeen = r.FirstSeen,
                lastSeen = r.LastSeen,
                messageCount = r.MessageCount,
                lastTopic = r.LastTopic,
                lastPayload = r.LastPayload,
            }));
        }).RequireAuthorization(Perms.IngestionView);

        // ── POST /data-sources/{id}/reload — restart that subscriber ────────
        app.MapPost("/data-sources/{id:guid}/reload", async (
            Guid id, ClaimsPrincipal user, DataSourceRepository repo,
            SubscriberStatusRegistry registry, IAuditEmitter audit) =>
        {
            var row = await repo.GetAsync(id);
            if (row is null) return Results.NotFound();
            registry.RequestReload(id);
            audit.Emit("ingestion.datasource.reloaded", UserName(user), id.ToString(), new { row.Name });
            return Results.Accepted($"/data-sources/{id}", new { requested = true });
        }).RequireAuthorization(Perms.IngestionManage);
    }

    private static string UserName(ClaimsPrincipal user) =>
        user.FindFirst("preferred_username")?.Value
        ?? user.FindFirst(ClaimTypes.Name)?.Value
        ?? user.FindFirst("sub")?.Value
        ?? "unknown";
}
