// Extraction Phase 3 COPY of AMS.Api Services/CpmLoopRegistryService.cs — mechanical transforms only
// (namespace, literal v1 routes, no Asp.Versioning). The AMS.Api original keeps
// serving until Phase 6 deletes it; behavior changes are forbidden in either copy.
using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;
using Traverse.CplmApi.Services.Registry;

namespace Traverse.CplmApi.Services;

/// <summary>Evidence publishing: the cplm.loop.evidence / cplm.loop.engineering broadcast to the Flink control plane (split from CpmLoopRegistryService, v2.5 2G.1; no behaviour change).</summary>
public sealed partial class CpmLoopRegistryService
{
    // ── Evidence publishing (the G13 path) ──────────────────────────────────

    public async Task<CpmBulkRepublishResult> BulkRepublishEvidenceAsync(IReadOnlyList<string> loopIds, CancellationToken ct)
    {
        await EnsureSchemaAsync(ct);
        // One existence query for the whole set (was a 3-query GetAsync per loop).
        HashSet<string> registered;
        await using (var conn = await _dataSource.OpenConnectionAsync(ct))
        {
            registered = (await conn.QueryAsync<string>(
                "SELECT loop_id FROM cpm.loop_registry WHERE loop_id = ANY(@ids)",
                new { ids = loopIds.Distinct(StringComparer.Ordinal).ToArray() })).ToHashSet(StringComparer.Ordinal);
        }
        var steps = new BulkRepublish.Steps(
            Exists: id => Task.FromResult(registered.Contains(id)),
            ProjectLinks: id => ProjectLinksAsync(id, ct),
            ProjectSignalAssets: ids => ProjectSignalAssetsBatchAsync(ids, ct),
            PublishEvidence: ids => PublishEvidenceBatchAsync(ids, ct));
        return await BulkRepublish.RunAsync(loopIds, steps, ct);
    }

    /// <summary>
    /// Batch form of <see cref="PublishEvidenceAsync"/>. The per-loop version
    /// costs a connection, three round trips and an awaited Kafka delivery each;
    /// this reads the whole set in two queries, mirrors peer status in two
    /// UPDATEs, and pipelines the produces behind a single flush.
    /// </summary>
    public async Task PublishEvidenceBatchAsync(IReadOnlyList<string> loopIds, CancellationToken ct)
    {
        if (loopIds.Count == 0) return;
        var ids = loopIds.ToArray();
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var peers = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var (loop, peer) in await conn.QueryAsync<(string Loop, string Peer)>("""
            SELECT from_loop_id, to_loop_id FROM cpm.loop_link WHERE from_loop_id = ANY(@ids)
            UNION
            SELECT to_loop_id, from_loop_id FROM cpm.loop_link WHERE to_loop_id = ANY(@ids) AND rel_type = 'PEER'
            """, new { ids }))
        {
            if (!peers.TryGetValue(loop, out var list)) peers[loop] = list = new List<string>();
            list.Add(peer);
        }

        var rows = (await conn.QueryAsync<(string LoopId, string? Monitoring, string? Engineering, string? CommandPath)>("""
            SELECT loop_id, monitoring::text, engineering::text, command_path
            FROM cpm.loop_registry WHERE loop_id = ANY(@ids)
            """, new { ids })).ToList();
        // v2.5 (2G.1): the loop model dimensions ride the same envelope as cplm.loop.model
        var models = (await conn.QueryAsync(CpmLoopRegistryReads.RegistrySelect + " WHERE loop_id = ANY(@ids)", new { ids }))
            .ToDictionary(r => (string)r.loop_id, r => CpmLoopRegistryReads.ReadModel(r), StringComparer.Ordinal);

        // Keep the registry's own mirror of peer status truthful for readiness
        // reads — two set-based UPDATEs instead of one per loop.
        var withPeers = rows.Where(r => peers.ContainsKey(r.LoopId)).Select(r => r.LoopId).ToArray();
        var withoutPeers = rows.Where(r => !peers.ContainsKey(r.LoopId)).Select(r => r.LoopId).ToArray();
        const string mirrorSql = """
            UPDATE cpm.loop_registry
            SET monitoring = jsonb_set(monitoring, '{evidence,peerLinksConfigured}', @configured::jsonb, true),
                updated_at = NOW()
            WHERE loop_id = ANY(@ids)
            """;
        if (withPeers.Length > 0)
            await conn.ExecuteAsync(mirrorSql, new { ids = withPeers, configured = "true" });
        if (withoutPeers.Length > 0)
            await conn.ExecuteAsync(mirrorSql, new { ids = withoutPeers, configured = "false" });

        var published = 0;
        foreach (var (loopId, monitoringJson, engineeringJson, commandPath) in rows)
        {
            var links = peers.TryGetValue(loopId, out var l) ? l : new List<string>();
            var monitoring = ParseJson(monitoringJson);
            var stepTest = monitoring.TryGetProperty("evidence", out var ev)
                && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

            var parameters = new List<Dictionary<string, string>>
            {
                new()
                {
                    ["name"] = "cplm.loop.evidence",
                    ["value"] = JsonSerializer.Serialize(new Dictionary<string, object>
                    {
                        ["hasPeerLinks"] = links.Count > 0,
                        ["hasStepTest"] = stepTest,
                        ["peers"] = links
                    })
                }
            };

            if (EngineeringParameter(engineeringJson, commandPath) is { } engParam) parameters.Add(engParam);
            if (models.TryGetValue(loopId, out var modelDto)) parameters.Add(ModelParameter(modelDto));

            var envelope = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["calcInstanceId"] = loopId,
                ["parameters"] = parameters
            });

            try
            {
                // Produce (not ProduceAsync): queue every message, then wait once
                // at the flush below instead of a round trip per loop.
                _producer.Produce(_options.MetadataTopic,
                    new Message<string, string> { Key = loopId, Value = envelope },
                    report =>
                    {
                        if (report.Error.IsError)
                            _logger.LogWarning("Loop evidence publish failed for {LoopId}: {Reason}",
                                loopId, report.Error.Reason);
                    });
                published++;
            }
            catch (Exception ex)
            {
                // Never fail onboarding on a broadcast hiccup: the topic is
                // compacted and a later publish recovers.
                _logger.LogWarning(ex, "Could not queue loop evidence for {LoopId}", loopId);
            }
        }

        try { _producer.Flush(TimeSpan.FromSeconds(30)); }
        catch (Exception ex) { _logger.LogWarning(ex, "Evidence flush did not complete"); }
        _logger.LogInformation("Published loop evidence for {Count} loop(s)", published);
    }

    public async Task PublishEvidenceAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var links = (await conn.QueryAsync<string>("""
            SELECT to_loop_id FROM cpm.loop_link WHERE from_loop_id = @loopId
            UNION
            SELECT from_loop_id FROM cpm.loop_link WHERE to_loop_id = @loopId AND rel_type = 'PEER'
            """, new { loopId })).ToList();

        var row = await conn.QueryFirstOrDefaultAsync<(string? Monitoring, string? Engineering, string? CommandPath)>(
            "SELECT monitoring::text, engineering::text, command_path FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId });
        var modelRow = await conn.QueryFirstOrDefaultAsync(CpmLoopRegistryReads.RegistrySelect + " WHERE loop_id = @loopId", new { loopId });
        var monitoringJson = row.Monitoring;
        var monitoring = ParseJson(monitoringJson);
        var stepTest = monitoring.TryGetProperty("evidence", out var ev)
            && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

        // Keep the registry's own mirror of peer status truthful for readiness reads.
        await conn.ExecuteAsync("""
            UPDATE cpm.loop_registry
            SET monitoring = jsonb_set(monitoring, '{evidence,peerLinksConfigured}', @configured::jsonb, true),
                updated_at = NOW()
            WHERE loop_id = @loopId
            """, new { loopId, configured = links.Count > 0 ? "true" : "false" });

        var evidence = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["hasPeerLinks"] = links.Count > 0,
            ["hasStepTest"] = stepTest,
            ["peers"] = links
        });

        // Envelope shape consumed by CplmParameterSetBroadcastSupport.applyUpdateToState:
        // parameters[].name lands in broadcast state under "<calcInstanceId>:<name>",
        // which is exactly the key applyLoopEvidence reads.
        var parameters = new List<Dictionary<string, string>>
        {
            new() { ["name"] = "cplm.loop.evidence", ["value"] = evidence }
        };

        // P3-8 - broadcast the OP and PV engineering ranges so the engine can normalize a
        // non-0-100 OP (e.g. a 0-1 valve fraction) and scale the good-error band to the
        // PV span before gate evaluation. Merge-only key applied AFTER profile
        // resolution; it can never clobber the class pack. CHG-082: it also carries vpApplicability.
        if (EngineeringParameter(row.Engineering, row.CommandPath) is { } engParam) parameters.Add(engParam);
        if (modelRow is not null) parameters.Add(ModelParameter(CpmLoopRegistryReads.ReadModel(modelRow)));

        var envelope = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["calcInstanceId"] = loopId,
            ["parameters"] = parameters
        });

        try
        {
            await _producer.ProduceAsync(_options.MetadataTopic,
                new Message<string, string> { Key = loopId, Value = envelope }, ct);
            _logger.LogInformation(
                "Published loop evidence for {LoopId}: peers={PeerCount} stepTest={StepTest}",
                loopId, links.Count, stepTest);
        }
        catch (Exception ex)
        {
            // Never fail onboarding on a broadcast hiccup: the topic is compacted
            // and a later publish (or PublishAllEvidenceAsync at startup) recovers.
            _logger.LogWarning(ex, "Could not publish loop evidence for {LoopId}", loopId);
        }
    }

    /// <summary>v2.5 (2G.1): the cplm.loop.model attribute - the five dimensions, the acquisition contract and the classification source.</summary>
    private static Dictionary<string, string> ModelParameter(CpmLoopModelDto m) => new()
    {
        ["name"] = "cplm.loop.model",
        ["value"] = LoopModelDimensions.BroadcastJson(new LoopModelDimensions.Resolved(m.ServiceFamily, m.DynamicClass, m.ObjectiveType, m.Topology, m.CommandPath, m.Acquisition, m.ClassificationSource)),
    };

    /// <summary>Retirement broadcast for one loop. Retained verbatim from the
    /// single-delete path so the broadcast consumer's contract does not move.</summary>
    private static string TombstoneEnvelope(string loopId) =>
        JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["__tombstone"] = true,
            ["key"] = loopId
        });
}
