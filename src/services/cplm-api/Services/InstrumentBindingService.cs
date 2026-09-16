using System.Text.Json;
using System.Text.RegularExpressions;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Traverse.CplmApi.Services;

public sealed record InstrumentBinding(
    Guid BindingId, string LoopId, string SignalRole, string DeviceId, string? InstallationId, string SourceId,
    DateTime ValidFrom, DateTime? ValidTo, string ApprovedBy, DateTime ApprovedAt, string? Note);

public sealed record CreateBindingRequest(
    string SignalRole, string DeviceId, string? InstallationId, string SourceId, DateTime? ValidFrom, string? Note);

public sealed class BindingConflictException : Exception
{
    public BindingConflictException(string message) : base(message) { }
}

public sealed class BindingValidationException : Exception
{
    public string Field { get; }
    public BindingValidationException(string field, string message) : base(message) { Field = field; }
}

public interface IInstrumentBindingService
{
    Task<InstrumentBinding> CreateAsync(string loopId, CreateBindingRequest req, string actor, CancellationToken ct);
    Task<IReadOnlyList<InstrumentBinding>> ListAsync(string loopId, CancellationToken ct);
    /// <summary>Re-broadcast every loop's bindings (startup / operator resync).</summary>
    Task<int> PublishAllAsync(CancellationToken ct);
}

/// <summary>Pure as-of resolution over a binding history (spec v6 §4.2; NR-041).</summary>
public static class BindingResolution
{
    /// <summary>The binding in force for a role at <paramref name="at"/>: valid_from ≤ at &lt; valid_to (open = ∞).</summary>
    public static InstrumentBinding? AsOf(IEnumerable<InstrumentBinding> history, string signalRole, DateTime at) =>
        history.Where(b => string.Equals(b.SignalRole, signalRole, StringComparison.OrdinalIgnoreCase)
                           && b.ValidFrom <= at && (b.ValidTo is null || at < b.ValidTo))
               .OrderByDescending(b => b.ValidFrom)
               .FirstOrDefault();
}

/// <summary>
/// v2.5 Task 1H.3 (spec v6 §4.2): effective-dated PRIMARY device bindings per loop signal.
/// A new binding closes the previous open one at its valid_from (a temporal split, so history
/// resolves the device installed at that time); an overlap is refused by the database's
/// exclusion constraint and surfaces as 409. Identity is explicit — never inferred from a tag
/// substring.
/// </summary>
public sealed class InstrumentBindingService : IInstrumentBindingService
{
    private static readonly HashSet<string> Roles = new(StringComparer.Ordinal) { "PV", "SP", "OP", "VP", "MODE" };
    private static readonly Regex Id = new("^[A-Za-z0-9][A-Za-z0-9._:-]*$", RegexOptions.Compiled);
    public const string BindingAttribute = "cplm.loop.binding";
    private readonly NpgsqlDataSource _db;
    private readonly IProducer<string, string>? _producer;
    private readonly string _metadataTopic;
    private readonly ILogger<InstrumentBindingService>? _logger;

    /// <summary>Test constructor: no broadcast.</summary>
    public InstrumentBindingService([FromKeyedServices("cplm")] NpgsqlDataSource db)
    {
        _db = db;
        _producer = null;
        _metadataTopic = "";
    }

    public InstrumentBindingService([FromKeyedServices("cplm")] NpgsqlDataSource db, IOptions<CpmRegistryOptions> registry,
        ILogger<InstrumentBindingService> logger)
    {
        _db = db;
        _logger = logger;
        _metadataTopic = registry.Value.MetadataTopic;
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = registry.Value.BootstrapServers,
            EnableIdempotence = true,
            Acks = Acks.All,
            MessageSendMaxRetries = 3,
            RetryBackoffMs = 1000,
        }).Build();
    }

    /// <summary>
    /// v2.5 (1H.4): the loop's binding history rides the compacted metadata topic under the
    /// attribute cplm.loop.binding - the same envelope the Flink jobs already broadcast for
    /// cplm.loop.evidence, but under its own Kafka key (loop|binding) so compaction keeps both.
    /// </summary>
    private async Task PublishAsync(string loopId, CancellationToken ct)
    {
        if (_producer is null) return;
        var history = await ListAsync(loopId, ct);
        var value = JsonSerializer.Serialize(new
        {
            loop_id = loopId,
            bindings = history.Select(b => new
            {
                binding_id = b.BindingId,
                signal_role = b.SignalRole,
                device_id = b.DeviceId,
                installation_id = b.InstallationId,
                source_id = b.SourceId,
                valid_from_ms = new DateTimeOffset(DateTime.SpecifyKind(b.ValidFrom, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
                valid_to_ms = b.ValidTo is null ? (long?)null : new DateTimeOffset(DateTime.SpecifyKind(b.ValidTo.Value, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
            }),
        });
        var envelope = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["calcInstanceId"] = loopId,
            ["parameters"] = new[] { new Dictionary<string, string> { ["name"] = BindingAttribute, ["value"] = value } },
        });
        try
        {
            await _producer.ProduceAsync(_metadataTopic, new Message<string, string> { Key = loopId + "|binding", Value = envelope }, ct);
        }
        catch (Exception ex)
        {
            // never fail the binding write on a broadcast hiccup: PublishAllAsync resyncs
            _logger?.LogWarning(ex, "Could not broadcast bindings for {LoopId}", loopId);
        }
    }

    public async Task<int> PublishAllAsync(CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var loops = (await conn.QueryAsync<string>("SELECT DISTINCT loop_id FROM cpm.signal_device_binding_history")).ToList();
        foreach (var loop in loops) await PublishAsync(loop, ct);
        return loops.Count;
    }

    public async Task<InstrumentBinding> CreateAsync(string loopId, CreateBindingRequest req, string actor, CancellationToken ct)
    {
        var role = (req.SignalRole ?? "").Trim().ToUpperInvariant();
        if (!Roles.Contains(role)) throw new BindingValidationException("signalRole", "signalRole must be one of PV, SP, OP, VP, MODE");
        if (string.IsNullOrWhiteSpace(req.DeviceId) || !Id.IsMatch(req.DeviceId.Trim()))
            throw new BindingValidationException("deviceId", "deviceId is required (letters, digits, . _ : -)");
        if (string.IsNullOrWhiteSpace(req.SourceId) || !Id.IsMatch(req.SourceId.Trim()))
            throw new BindingValidationException("sourceId", "sourceId is required (the Instrumental source publishing this device)");
        if (req.InstallationId is not null && req.InstallationId.Length > 0 && !Id.IsMatch(req.InstallationId.Trim()))
            throw new BindingValidationException("installationId", "installationId must be an identifier");
        var from = (req.ValidFrom ?? DateTime.UtcNow).ToUniversalTime();

        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        var open = await conn.QueryFirstOrDefaultAsync<InstrumentBinding>("""
            SELECT binding_id AS BindingId, loop_id AS LoopId, signal_role AS SignalRole, device_id AS DeviceId,
                   installation_id AS InstallationId, source_id AS SourceId, valid_from AS ValidFrom, valid_to AS ValidTo,
                   approved_by AS ApprovedBy, approved_at AS ApprovedAt, note AS Note
            FROM cpm.signal_device_binding_history
            WHERE loop_id = @loopId AND signal_role = @role AND valid_to IS NULL
            """, new { loopId, role }, tx);
        if (open is not null)
        {
            if (open.ValidFrom >= from)
                throw new BindingConflictException($"the current {role} binding ({open.DeviceId}) already starts at {open.ValidFrom:O}; a replacement must start later");
            await conn.ExecuteAsync("UPDATE cpm.signal_device_binding_history SET valid_to = @from WHERE binding_id = @id",
                new { from, id = open.BindingId }, tx);
        }
        var site = await conn.ExecuteScalarAsync<string?>("SELECT site FROM cpm.loop_registry WHERE loop_id = @loopId", new { loopId }, tx);
        if (site is null) throw new BindingValidationException("loopId", $"loop '{loopId}' is not registered");
        try
        {
            var created = await conn.QuerySingleAsync<InstrumentBinding>("""
                INSERT INTO cpm.signal_device_binding_history
                    (site, loop_id, signal_role, device_id, installation_id, source_id, valid_from, approved_by, note)
                VALUES (@site, @loopId, @role, @device, @installation, @source, @from, @actor, @note)
                RETURNING binding_id AS BindingId, loop_id AS LoopId, signal_role AS SignalRole, device_id AS DeviceId,
                          installation_id AS InstallationId, source_id AS SourceId, valid_from AS ValidFrom, valid_to AS ValidTo,
                          approved_by AS ApprovedBy, approved_at AS ApprovedAt, note AS Note
                """, new
                {
                    site, loopId, role, device = req.DeviceId.Trim(), installation = string.IsNullOrWhiteSpace(req.InstallationId) ? null : req.InstallationId.Trim(),
                    source = req.SourceId.Trim(), from, actor, note = req.Note
                }, tx);
            await tx.CommitAsync(ct);
            await PublishAsync(loopId, ct);
            return created;
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.ExclusionViolation)
        {
            throw new BindingConflictException($"a {role} binding for {loopId} already covers {from:O} (overlapping primaries are refused)");
        }
    }

    public async Task<IReadOnlyList<InstrumentBinding>> ListAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<InstrumentBinding>("""
            SELECT binding_id AS BindingId, loop_id AS LoopId, signal_role AS SignalRole, device_id AS DeviceId,
                   installation_id AS InstallationId, source_id AS SourceId, valid_from AS ValidFrom, valid_to AS ValidTo,
                   approved_by AS ApprovedBy, approved_at AS ApprovedAt, note AS Note
            FROM cpm.signal_device_binding_history
            WHERE lower(loop_id) = lower(@loopId)
            ORDER BY signal_role, valid_from DESC
            """, new { loopId })).ToList();
    }
}
