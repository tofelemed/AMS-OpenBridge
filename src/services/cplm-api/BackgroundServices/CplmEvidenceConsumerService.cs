// v2.5 Task 1G.3 (spec v6 R12 transport; NR-058): persists the evidence artifacts the Flink
// engine jobs publish on traverse.cpa.clpm.gate.evidence.v1 - one EVIDENCE_MANIFEST followed
// by its EVIDENCE_CHUNKs, keyed by method_run_id. Own consumer group, single member
// (SingleMemberGuard). A manifest becomes COMPLETE only when every chunk is present and every
// checksum verifies (EvidenceAssembly); a mismatch is FAILED with the reason. Never early.
using System.Text.Json;
using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.BackgroundServices;

public sealed class CplmEvidenceConsumerService : BackgroundService
{
    public const string ConsumerName = "evidence";
    private readonly ILogger<CplmEvidenceConsumerService> _logger;
    private readonly IEvidenceBlobStore _store;
    private readonly CplmOptions _options;
    private readonly IConsumer<string, string> _consumer;
    private readonly ConsumerHeartbeat _heartbeat;
    private readonly SingleMemberGuard _guard;
    private DateTimeOffset _lastReconcile = DateTimeOffset.MinValue;

    public CplmEvidenceConsumerService(
        ILogger<CplmEvidenceConsumerService> logger,
        IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafkaOptions,
        IOptions<CplmOptions> cplmOptions,
        ConsumerHeartbeat heartbeat,
        SingleMemberGuard guard,
        IEvidenceBlobStore store)
    {
        _logger = logger;
        _store = store;
        _options = cplmOptions.Value;
        _heartbeat = heartbeat;
        _guard = guard;
        var group = _options.ConsumerGroupId.Replace("-results", "") + "-evidence";
        _consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = kafkaOptions.Value.BootstrapServers,
            GroupId = group,
            GroupInstanceId = group + "-sole",
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false,
            // chunks are up to 256 KiB base64-wrapped
            FetchMaxBytes = 4 * 1024 * 1024,
            MaxPartitionFetchBytes = 2 * 1024 * 1024,
        })
        .SetPartitionsAssignedHandler((_, parts) => _guard.VerifySoleMembership(ConsumerName, parts))
        .Build();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        _consumer.Subscribe(_options.EvidenceTopic);
        _logger.LogInformation("CplmEvidenceConsumerService subscribed to {Topic}", _options.EvidenceTopic);
        while (!stoppingToken.IsCancellationRequested)
        {
            _heartbeat.Report(ConsumerName, "CONSUMING");
            ConsumeResult<string, string>? result = null;
            try
            {
                result = _consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (result is null)
                {
                    await MaybeReconcileAsync(stoppingToken);
                    continue;
                }
                if (!string.IsNullOrWhiteSpace(result.Message.Value))
                    await ApplyAsync(result.Message.Value, stoppingToken);
                _consumer.StoreOffset(result);
                _heartbeat.ReportLag(ConsumerName, (long)(DateTimeOffset.UtcNow - result.Message.Timestamp.UtcDateTime).TotalMilliseconds);
            }
            catch (ConsumeException ex) { _logger.LogError(ex, "Kafka consume error in CplmEvidenceConsumerService"); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error persisting evidence record; offset not stored");
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
        }
        _consumer.Close();
    }

    internal async Task ApplyAsync(string json, CancellationToken ct)
    {
        JsonElement root;
        try { root = JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { _logger.LogWarning("Unparseable evidence record skipped"); return; }
        var kind = root.TryGetProperty("record_kind", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString() : null;
        if (!root.TryGetProperty("evidence_id", out var idEl) || !Guid.TryParse(idEl.GetString(), out var evidenceId))
        {
            _logger.LogWarning("Evidence record without evidence_id skipped ({Kind})", kind);
            return;
        }
        switch (kind)
        {
            case "EVIDENCE_MANIFEST":
            {
                // CHG-099: a reconstruction beside a held original is stored under its own id; evaluate that row
                var stored = await _store.UpsertManifestAsync(root, ct);
                await EvaluateAsync(stored is { } s && s != Guid.Empty ? s : evidenceId, ct);
                break;
            }
            case "EVIDENCE_CHUNK":
            {
                var chunkNo = root.TryGetProperty("chunk_no", out var n) && n.TryGetInt32(out var v) ? v : -1;
                var sha = root.TryGetProperty("sha256", out var s) ? s.GetString() ?? "" : "";
                var payload = root.TryGetProperty("payload_b64", out var p) ? Convert.FromBase64String(p.GetString() ?? "") : Array.Empty<byte>();
                var chunk = new EvidenceChunkSpec(chunkNo, sha, payload);
                // CHG-099: the row that declares this chunk (the original, or a reconstruction stored beside it); none =
                // already stored (redelivery) or its manifest is gone - dropped, never appended to another row's chunks
                if (await _store.ResolveChunkTargetAsync(evidenceId, chunkNo, sha, ct) is not { } target)
                {
                    _logger.LogDebug("Evidence chunk {No} of {Id}: no manifest awaits it (stored already or swept); skipped", chunkNo, evidenceId);
                    return;
                }
                if (!EvidenceAssembly.ChunkIsSelfConsistent(chunk))
                {
                    // A chunk that does not hash to its own checksum was damaged in transit:
                    // the manifest can never complete from it; say so on the manifest it was declared by.
                    await _store.SetReadinessAsync(target, "FAILED", $"CHUNK_CORRUPT:{chunkNo}", ct);
                    _logger.LogError("Evidence chunk {No} of {Id} is corrupt; manifest FAILED", chunkNo, target);
                    return;
                }
                evidenceId = target;
                var known = await _store.PutChunkAsync(evidenceId, chunkNo, sha, payload, ct);
                if (!known)
                {
                    // CHG-049: the sweeper removed the manifest (TRANSIENT age/budget) before its chunks were consumed; nothing can complete it
                    _logger.LogWarning("Evidence chunk {No} of {Id} has no manifest (swept); skipped", chunkNo, evidenceId);
                    return;
                }
                await EvaluateAsync(evidenceId, ct);
                break;
            }
            default:
                _logger.LogWarning("Unknown evidence record kind {Kind} skipped", kind);
                break;
        }
    }

    private async Task EvaluateAsync(Guid evidenceId, CancellationToken ct)
    {
        var m = await _store.GetManifestAsync(evidenceId, ct);
        if (m is null || m.Readiness is "COMPLETE" or "FAILED" or "EXPIRED") return;
        if (await _store.CountChunksAsync(evidenceId, ct) < m.ChunkCount) return;   // CHG-049: PENDING without reading payloads
        var chunks = await _store.GetChunksAsync(evidenceId, ct);
        var verdict = EvidenceAssembly.Evaluate(
            new EvidenceManifestSpec(m.EvidenceId, m.ChunkCount, m.TotalBytes, m.Sha256, m.ChunkSha256), chunks);
        switch (verdict.Readiness)
        {
            case EvidenceReadiness.Complete:
                await _store.SetReadinessAsync(evidenceId, "COMPLETE", null, ct);
                break;
            case EvidenceReadiness.Failed:
                await _store.SetReadinessAsync(evidenceId, "FAILED", verdict.Reason, ct);
                _logger.LogError("Evidence manifest {Id} FAILED: {Reason}", evidenceId, verdict.Reason);
                break;
            default:
                break;   // PENDING: more chunks to come
        }
    }

    private async Task MaybeReconcileAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - _lastReconcile < TimeSpan.FromSeconds(60)) return;
        _lastReconcile = DateTimeOffset.UtcNow;
        try
        {
            var linked = await _store.ReconcileGateResultIdsAsync(ct);
            if (linked > 0) _logger.LogInformation("Linked {Count} evidence manifest(s) to their result rows", linked);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Evidence reconcile failed; will retry"); }
    }
}
