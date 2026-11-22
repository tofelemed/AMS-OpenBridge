using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// CHG-107 (System Response plan Phase 2d): a loop's controller tuning history, newest first, as the response engine read
/// it from the plant feed (P / I / D). Each row is in force from validFrom until validTo (null = still in force). The models
/// list carries controllerSnapshotId, which names the row an event ran under.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
public sealed class CpmControllerTuningController : ControllerBase
{
    private readonly NpgsqlDataSource _db;

    public CpmControllerTuningController([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    [HttpGet("loops/{loopId}/controller-tuning")]
    [Authorize(Policy = "analytics.view")]
    public async Task<IActionResult> History(string loopId, [FromQuery] int limit = 50, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 500);
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = (await conn.QueryAsync(new CommandDefinition("""
            SELECT snapshot_id, loop_id, valid_from, valid_to, vendor, algorithm_family, form, native::text AS native,
                   normalized::text AS normalized, adapter_version, source
            FROM cpm.controller_snapshot
            WHERE lower(loop_id) = lower(@loopId)
            ORDER BY valid_from DESC
            LIMIT @limit
            """, new { loopId, limit }, cancellationToken: ct))).Select(Shape).ToList();
        return Ok(new { loopId, count = rows.Count, current = rows.FirstOrDefault(r => r.ValidTo is null), history = rows });
    }

    public sealed record TuningRow(Guid SnapshotId, string LoopId, DateTime ValidFrom, DateTime? ValidTo, string Vendor,
        string AlgorithmFamily, string Form, JsonElement Native, JsonElement Normalized, string AdapterVersion, string Source);

    private static TuningRow Shape(dynamic r) => new(
        (Guid)r.snapshot_id, (string)r.loop_id,
        DateTime.SpecifyKind((DateTime)r.valid_from, DateTimeKind.Utc),
        r.valid_to is null ? null : DateTime.SpecifyKind((DateTime)r.valid_to, DateTimeKind.Utc),
        (string)r.vendor, (string)r.algorithm_family, (string)r.form,
        JsonDocument.Parse((string)r.native).RootElement.Clone(), JsonDocument.Parse((string)r.normalized).RootElement.Clone(),
        (string)r.adapter_version, (string)r.source);
}
