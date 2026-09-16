using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

public sealed record InvestigationView(Guid RefId, string LoopId, Guid? MethodRunId, Guid[] EvidenceIds, string Note, string Outcome,
    string? CreatedBy, DateTime CreatedAt, string? UpdatedBy, DateTime UpdatedAt, bool Pinned);

/// <summary>
/// v2.5 Task 2D.2 (spec §3.4, R24; NR-062): analytics.investigation_reference. Creating a reference
/// pins the manifests it names (the retention sweeper skips pinned evidence); the outcome is a
/// person's explicit statement, INCONCLUSIVE until then.
/// </summary>
public sealed class InvestigationStore
{
    public static readonly string[] Outcomes = { "WORK_COMPLETED", "PERFORMANCE_RESTORED", "INCONCLUSIVE" };
    private readonly NpgsqlDataSource _db;

    public InvestigationStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    /// <summary>The evidence ids that do NOT exist (an investigation never references evidence the store has never seen).</summary>
    public async Task<Guid[]> MissingEvidenceAsync(IEnumerable<Guid> evidenceIds, CancellationToken ct)
    {
        var ids = evidenceIds.Distinct().ToArray();
        if (ids.Length == 0) return Array.Empty<Guid>();
        await using var conn = await _db.OpenConnectionAsync(ct);
        var known = (await conn.QueryAsync<Guid>("SELECT evidence_id FROM analytics.evidence_manifest WHERE evidence_id = ANY(@ids)", new { ids })).ToHashSet();
        return ids.Where(i => !known.Contains(i)).ToArray();
    }

    public async Task<InvestigationView> CreateAsync(string loopId, Guid? methodRunId, Guid[] evidenceIds, string note, string outcome, string? actor, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync("""
            INSERT INTO analytics.investigation_reference (ref_id, loop_id, method_run_id, evidence_ids, note, outcome, created_by, updated_by)
            VALUES (@id, @loop, @run, @evidence, @note, @outcome, @actor, @actor)
            """, new { id, loop = loopId, run = methodRunId, evidence = evidenceIds, note, outcome, actor }, tx);
        if (evidenceIds.Length > 0)
            await conn.ExecuteAsync("UPDATE analytics.evidence_manifest SET pinned = TRUE, retention_class = 'PINNED' WHERE evidence_id = ANY(@ids)", new { ids = evidenceIds }, tx);
        await tx.CommitAsync(ct);
        return (await GetAsync(id, ct))!;
    }

    public async Task<InvestigationView?> SetOutcomeAsync(Guid refId, string outcome, string? note, string? actor, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var n = await conn.ExecuteAsync("""
            UPDATE analytics.investigation_reference
            SET outcome = @outcome, note = COALESCE(@note, note), updated_by = @actor, updated_at = NOW()
            WHERE ref_id = @id
            """, new { id = refId, outcome, note, actor });
        return n == 0 ? null : await GetAsync(refId, ct);
    }

    public async Task<InvestigationView?> GetAsync(Guid refId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync(Select + " WHERE ref_id = @id", new { id = refId });
        return r is null ? null : Map(r);
    }

    public async Task<IReadOnlyList<InvestigationView>> ForLoopAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync(Select + " WHERE lower(loop_id) = lower(@loop) ORDER BY created_at DESC", new { loop = loopId });
        return rows.Select(Map).ToList();
    }

    private const string Select = "SELECT ref_id, loop_id, method_run_id, evidence_ids, note, outcome, created_by, created_at, updated_by, updated_at, pinned FROM analytics.investigation_reference";

    private static InvestigationView Map(dynamic r) => new((Guid)r.ref_id, (string)r.loop_id, (Guid?)r.method_run_id, (Guid[])r.evidence_ids, (string)r.note,
        (string)r.outcome, (string?)r.created_by, (DateTime)r.created_at, (string?)r.updated_by, (DateTime)r.updated_at, (bool)r.pinned);
}
