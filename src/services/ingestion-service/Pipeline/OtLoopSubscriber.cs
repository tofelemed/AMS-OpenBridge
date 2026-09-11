using System.Text;
using System.Threading.Channels;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Protocol;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// One MQTT_LOOP_SAMPLES pipeline: managed MQTT client (stable client id, QoS 1,
/// persistent session, auto-reconnect) → bounded channel → parse/validate/resolve/map
/// → per-loop joiner → Kafka tuples keyed by loop_id. Invalid/unknown messages go to
/// the OT DLQ and the parking inventory — never silently dropped. Backpressure: a full
/// channel (and a stalled Kafka publish) slows MQTT consumption; QoS-1 messages queue
/// at the broker under the persistent session.
/// </summary>
public sealed class OtLoopSubscriber : IAsyncDisposable
{
    private readonly DataSourceRow _row;
    private readonly string _password;
    private readonly LoopIngestSettings _settings;
    private readonly IReadOnlyList<string> _topics;
    private readonly MqttQualityOfServiceLevel _qos;
    private readonly CplmRegistryClient _registryClient;
    private readonly ILoopSampleSink _sink;
    private readonly UnknownSourceInventory _inventory;
    private readonly UnknownSourceRepository _unknownRepo;
    private readonly DataSourceRepository _configRepo;
    private readonly SubscriberStatus _status;
    private readonly ILogger _logger;

    private readonly LoopRegistryCache _registry;
    private readonly LoopJoiner _joiner = new();
    private readonly Channel<(string Topic, byte[] Payload)> _channel =
        Channel.CreateBounded<(string, byte[])>(new BoundedChannelOptions(10_000)
        { FullMode = BoundedChannelFullMode.Wait });
    private readonly Dictionary<string, long> _lastLogTicks = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly List<Task> _workers = new();
    private IManagedMqttClient? _client;
    private long _lastTouchMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); // first stamp ≥30 s after start
    private long _lastSkipped;
    private long _lastHealthMs;
    private readonly LoopStateRepository? _stateRepo;
    private long _lastStateSaveMs;
    /// <summary>Persist cadence. Slow on purpose: the value of the store is surviving a
    /// restart, not being current to the second, and a write storm would cost more than
    /// the few minutes of re-learning it saves.</summary>
    private const int StateSaveIntervalMs = 60_000;
    /// <summary>A loop emitting nothing for this long is reported `idle`. Six grid
    /// ticks at the 5 s default: long enough that a steady loop with slow-moving
    /// signals is not flagged, short enough to notice a source going quiet.</summary>
    private int IdleAfterSeconds => Math.Max(30, _settings.GridSeconds * 6);
    private long _receivedSinceTouch;

    private string Name => _status.Name;

    public OtLoopSubscriber(DataSourceRow row, string password, LoopIngestSettings settings,
        IReadOnlyList<string> topics, int qos, CplmRegistryClient registryClient,
        ILoopSampleSink sink, UnknownSourceInventory inventory, UnknownSourceRepository unknownRepo,
        DataSourceRepository configRepo, SubscriberStatus status, ILogger logger,
        LoopRegistryCache? registry = null, LoopStateRepository? stateRepo = null)
    {
        _stateRepo = stateRepo;
        _row = row; _password = password; _settings = settings; _topics = topics;
        _qos = (MqttQualityOfServiceLevel)Math.Clamp(qos, 0, 2);
        _registryClient = registryClient; _sink = sink; _inventory = inventory;
        _unknownRepo = unknownRepo; _configRepo = configRepo; _status = status; _logger = logger;
        _registry = registry ?? new LoopRegistryCache(); // tests pre-seed; a failed refresh keeps the seed
    }

    public async Task StartAsync(CancellationToken hostCt)
    {
        var ct = _cts.Token;

        // First registry pull before subscribing — a failure still starts the subscriber
        // (everything parks, visibly) and the refresh loop keeps retrying.
        await _registry.RefreshAsync(_registryClient, _logger, hostCt);
        _status.RegistryLoops = _registry.Count;
        _status.RegistryRefreshedAt = _registry.LastRefreshed;

        var mqtt = ProfileConfig.FromJson(_row.ProfileConfig).Mqtt;
        var clientId = DataSourceDto.DeriveClientId(_row.ConfigId, mqtt);
        var timeout = TimeSpan.FromSeconds(_row.TimeoutSeconds > 0 ? _row.TimeoutSeconds : 30);
        if (!MqttClientOptionsFactory.TryBuild(_row, _password, clientId,
                cleanSession: mqtt?.CleanSession ?? false,
                sessionExpirySeconds: (uint)Math.Max(0, mqtt?.SessionExpirySeconds ?? 86400),
                timeout, out var options, out var error))
        {
            _status.ConnectionError = error;
            _logger.LogError("[{Name}] cannot build MQTT options: {Error}", Name, error);
            return;
        }

        _client = new MqttFactory().CreateManagedMqttClient();
        _client.ConnectedAsync += _ =>
        {
            _status.Connected = true;
            _status.ConnectionError = null;
            _logger.LogInformation("[{Name}] connected to {Url} as {ClientId}", Name, _row.ConnectionUrl, clientId);
            return Task.CompletedTask;
        };
        _client.DisconnectedAsync += e =>
        {
            if (_status.Connected) IngestionMetrics.MqttReconnect(Name);
            _status.Connected = false;
            _status.ConnectionError = e.Exception?.Message ?? e.ReasonString ?? e.Reason.ToString();
            RateLimitedLog("mqtt-disconnect", LogLevel.Warning,
                "[{Name}] MQTT disconnected: {Reason} — managed client will reconnect", Name, _status.ConnectionError);
            return Task.CompletedTask;
        };
        _client.ConnectingFailedAsync += e =>
        {
            _status.Connected = false;
            _status.ConnectionError = e.Exception?.Message ?? "connect failed";
            RateLimitedLog("mqtt-connect-fail", LogLevel.Warning,
                "[{Name}] MQTT connect failed: {Reason} — retrying", Name, _status.ConnectionError);
            return Task.CompletedTask;
        };
        _client.ApplicationMessageReceivedAsync += async e =>
        {
            var payload = e.ApplicationMessage.PayloadSegment.Count > 0
                ? e.ApplicationMessage.PayloadSegment.ToArray()
                : Array.Empty<byte>();
            await _channel.Writer.WriteAsync((e.ApplicationMessage.Topic, payload), ct);
        };

        await _client.StartAsync(new ManagedMqttClientOptionsBuilder()
            .WithClientOptions(options!)
            .WithAutoReconnectDelay(TimeSpan.FromSeconds(5))
            .Build());
        await _client.SubscribeAsync(_topics.Select(t =>
            new MqttTopicFilterBuilder().WithTopic(t).WithQualityOfServiceLevel(_qos).Build()).ToList());
        _logger.LogInformation("[{Name}] subscribed to {Topics} (qos {Qos}); registry has {Loops} loops",
            Name, string.Join(", ", _topics), (int)_qos, _registry.Count);

        await SeedFromStateStoreAsync(ct);

        _workers.Add(Task.Run(() => ConsumeLoopAsync(ct), ct));
        _workers.Add(Task.Run(() => GridLoopAsync(ct), ct));
        _workers.Add(Task.Run(() => RegistryLoopAsync(ct), ct));
        _workers.Add(Task.Run(() => FlushLoopAsync(ct), ct));
    }

    // ── per-message pipeline ────────────────────────────────────────────────
    private async Task ConsumeLoopAsync(CancellationToken ct)
    {
        await foreach (var (topic, body) in _channel.Reader.ReadAllAsync(ct))
        {
            try { await ProcessAsync(topic, body, ct); }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                RateLimitedLog("pipeline-error", LogLevel.Error,
                    "[{Name}] pipeline error on {Topic}: {Message}", Name, topic, ex.Message);
            }
        }
    }

    private async Task ProcessAsync(string topic, byte[] body, CancellationToken ct)
    {
        IngestionMetrics.MessagesReceived(Name);
        Interlocked.Increment(ref _status.MessagesReceived);
        Interlocked.Increment(ref _receivedSinceTouch);
        _status.LastMessageAt = DateTimeOffset.UtcNow;
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        if (!OtTopicParser.TryParse(_settings.TopicTemplate, topic, out var id, out var terr))
        {
            await DeadLetterAsync(DlqReasons.TopicShapeMismatch, topic, body, terr, key: null, ct);
            return;
        }

        var payload = OtPayloadParser.Parse(body, nowMs, _settings.FutureSkewMaxSeconds, out var reason, out var detail);
        if (payload is null)
        {
            await DeadLetterAsync(reason!, topic, body, detail, key: id!.LoopTag, ct);
            return;
        }

        if (!OtConsistencyValidator.Validate(id!, payload, out reason, out detail))
        {
            await DeadLetterAsync(reason!, topic, body, detail, key: id!.LoopTag, ct);
            return;
        }

        // Warn-only checks: class naming and source units are advisory (assessment §5).
        if (!string.IsNullOrEmpty(id!.ProcessClass) &&
            (Contradicts(id.ProcessClass, payload.Line) || Contradicts(id.ProcessClass, payload.ProcessUnit)))
            IngestionMetrics.ClassMismatchWarning(Name);

        if (!_registry.TryResolve(id.LoopTag, out var loop))
        {
            var sourceKey = $"{id.Site}|{id.Fcs}|{id.LoopTag}";
            _inventory.Record(_row.ConfigId, DlqReasons.LoopNotRegistered, sourceKey, topic, RawJson(body));
            IngestionMetrics.MessagesParked(Name, DlqReasons.LoopNotRegistered);
            Interlocked.Increment(ref _status.Parked);
            await DeadLetterAsync(DlqReasons.LoopNotRegistered, topic, body, null, key: sourceKey, ct);
            return;
        }

        if (!LoopParameterMapper.TryMap(id.Parameter, payload, _settings, out var mapped, out reason))
        {
            var sourceKey = $"{loop.LoopId}|{id.Parameter}";
            _inventory.Record(_row.ConfigId, reason!, sourceKey, topic, RawJson(body));
            IngestionMetrics.MessagesParked(Name, reason!);
            Interlocked.Increment(ref _status.Parked);
            await DeadLetterAsync(reason!, topic, body, $"parameter '{id.Parameter}'", key: sourceKey, ct);
            return;
        }

        // A MODE the engine cannot read is not an error anywhere — it is simply
        // counted not-auto, and G1 then excludes every window of the loop while G0
        // stays green. Say so here, or the whole fleet goes dark in silence.
        if (mapped!.Role == "mode" && !ModeVocabulary.IsRecognised(mapped.ModeString))
        {
            IngestionMetrics.ModeUnrecognised(Name);
            RateLimitedLog($"mode-unrecognised-{mapped.ModeString}", LogLevel.Warning,
                "[{Name}] MODE '{Mode}' (loop {Loop}) is not in the engine's vocabulary — " +
                "it will count as NOT auto and G1 will exclude this loop. Add it to " +
                "profile_config.loop_ingest.mode_value_map (e.g. 1=AUT, 2=MAN, 3=CAS, 4=IMAN).",
                Name, mapped.ModeString ?? "(null)", loop.LoopId);
        }

        IngestionMetrics.SourceLatency(nowMs - payload.TsMs);
        _joiner.Accept(loop, id.Fcs, mapped!, payload, _settings, nowMs);
    }

    private async Task DeadLetterAsync(string reason, string topic, byte[] body, string? detail,
        string? key, CancellationToken ct)
    {
        IngestionMetrics.MessagesDeadLettered(Name, reason);
        Interlocked.Increment(ref _status.DeadLettered);
        RateLimitedLog($"dlq-{reason}", LogLevel.Warning,
            "[{Name}] {Reason} on {Topic}: {Detail}", Name, reason, topic, detail ?? "-");
        if (!_sink.Enabled) return;
        try
        {
            var record = new DeadLetterRecord(reason, _row.ConfigId, topic, RawJson(body),
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), detail);
            await _sink.PublishDeadLetterAsync(key ?? topic, record, ct);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            // A DLQ outage must not halt the pipeline — the counter carries the truth.
            IngestionMetrics.KafkaPublishFailure(Name);
            RateLimitedLog("dlq-publish-fail", LogLevel.Error,
                "[{Name}] DLQ publish failed: {Message}", Name, ex.Message);
        }
    }

    /// <summary>Restore last-known values saved by a previous run. Best-effort by
    /// design: a state store that is empty, unreachable or stale must degrade to
    /// today's behaviour (wait for the wire) and never block ingestion from starting.</summary>
    private async Task SeedFromStateStoreAsync(CancellationToken ct)
    {
        if (_stateRepo is null) return;
        try
        {
            var rows = await _stateRepo.LoadAsync(_row.ConfigId, ct);
            if (rows.Count == 0) return;
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var seeded = 0;
            foreach (var row in rows)
            {
                // Only for loops still registered and active: a retired loop must not be
                // resurrected from the store.
                if (!_registry.TryResolve(row.LoopId, out var loop)) continue;
                _joiner.Seed(loop, row.SourceFcs,
                    row.Members.ToDictionary(kv => kv.Key, kv => (kv.Value.V, kv.Value.Ts, kv.Value.Good)),
                    row.Extras.ToDictionary(kv => kv.Key, kv => (kv.Value.V, kv.Value.Ts, kv.Value.Good)),
                    row.ModeToken, row.ModeTsMs ?? 0, row.LastEmittedTsMs, _settings, nowMs);
                seeded++;
            }
            _logger.LogInformation(
                "[{Name}] restored last-known values for {Seeded} loop(s) from the state store " +
                "({Stored} stored) - signals that have not changed since are available immediately",
                Name, seeded, rows.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[{Name}] could not restore loop state - starting from the wire only", Name);
        }
    }

    /// <summary>Persist what we have learned. Failures are logged and retried on the next
    /// cycle; losing a save costs re-learning, losing ingestion costs data.</summary>
    private async Task SaveStateAsync(CancellationToken ct)
    {
        if (_stateRepo is null) return;
        try
        {
            var snapshot = _joiner.StateSnapshot();
            if (snapshot.Count == 0) return;
            await _stateRepo.SaveAsync(_row.ConfigId, snapshot.Select(x => new LoopStateRow(
                x.LoopId,
                x.Members.ToDictionary(kv => kv.Key, kv => new StoredMember(kv.Value.Value, kv.Value.TsMs, kv.Value.Good)),
                x.Extras.ToDictionary(kv => kv.Key, kv => new StoredMember(kv.Value.Value, kv.Value.TsMs, kv.Value.Good)),
                x.ModeToken, x.ModeTsMs == 0 ? null : x.ModeTsMs, x.LastEmittedTsMs, x.SourceFcs)), ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[{Name}] loop-state save failed - will retry", Name);
        }
    }

    /// <summary>Merge what the joiner has heard with what the registry expects, so a
    /// loop that has never published anything appears as `silent` rather than simply
    /// being absent from the audit. Refreshed at most every 10 s -- the answer only
    /// changes on the grid cadence and this walks the whole fleet.</summary>
    private void PublishLoopHealth(long nowMs)
    {
        if (nowMs - _lastHealthMs < 10_000) return;
        _lastHealthMs = nowMs;

        var rows = _joiner.HealthSnapshot(nowMs, IdleAfterSeconds).ToList();
        var known = new HashSet<string>(rows.Select(r => r.LoopId), StringComparer.OrdinalIgnoreCase);
        foreach (var loop in _registry.ActiveLoops())
        {
            if (known.Contains(loop.LoopId)) continue;
            rows.Add(new LoopHealthRow(
                LoopId: loop.LoopId,
                State: LoopHealthState.Silent,
                Missing: LoopHealthRow.RequiredRoles,   // nothing has ever arrived
                Seen: Array.Empty<string>(),
                ModeSeen: false,
                LastSourceTsMs: null,
                LastEmittedTsMs: null,
                SecondsSinceEmit: null,
                SkippedTicks: 0,
                SourceFcs: null));
        }

        _status.LoopHealth = rows;
        IngestionMetrics.LoopHealth(Name, LoopHealthSummary.From(rows));
    }

    // ── grid ticker: emit merged tuples ─────────────────────────────────────
    private async Task GridLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var tuples = _joiner.Tick(nowMs, _settings);
            var skipped = _joiner.SkippedNoAdvance;
            IngestionMetrics.TicksSkipped(Name, skipped - _lastSkipped);
            _lastSkipped = skipped;
            _status.ActiveLoops = _joiner.ActiveLoops;
            IngestionMetrics.JoinerActiveLoops(Name, _joiner.ActiveLoops);
            PublishLoopHealth(nowMs);
            // A loop gaining a role it never had is exactly what the store exists to
            // keep: on a source that publishes a setpoint twice a week, that value is
            // the hardest to re-acquire. Save it now rather than risk the 60 s window.
            var gainedMember = _joiner.ConsumeNewMemberFlag();
            if (gainedMember || nowMs - _lastStateSaveMs >= StateSaveIntervalMs)
            {
                _lastStateSaveMs = nowMs;
                await SaveStateAsync(ct);
            }

            foreach (var tuple in tuples)
            {
                if (!_sink.Enabled) break;
                while (!ct.IsCancellationRequested)
                {
                    try
                    {
                        await _sink.PublishTupleAsync(tuple, ct);
                        Interlocked.Increment(ref _status.TuplesEmitted);
                        IngestionMetrics.TuplesEmitted(Name);
                        break;
                    }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception ex)
                    {
                        // Designed backpressure: stall here; the channel fills; the broker queues.
                        Interlocked.Increment(ref _status.KafkaFailures);
                        IngestionMetrics.KafkaPublishFailure(Name);
                        RateLimitedLog("kafka-publish-fail", LogLevel.Error,
                            "[{Name}] Kafka publish failed (retrying): {Message}", Name, ex.Message);
                        await Task.Delay(2000, ct);
                    }
                }
            }

            await TouchLastDataReceivedThrottledAsync(nowMs, ct);
        }
    }

    private async Task TouchLastDataReceivedThrottledAsync(long nowMs, CancellationToken ct)
    {
        if (Interlocked.Read(ref _receivedSinceTouch) == 0 || nowMs - _lastTouchMs < 30_000) return;
        _lastTouchMs = nowMs;
        Interlocked.Exchange(ref _receivedSinceTouch, 0);
        try { await _configRepo.TouchLastDataReceivedAsync(_row.ConfigId, ct); }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            RateLimitedLog("touch-fail", LogLevel.Warning,
                "[{Name}] last_data_received update failed: {Message}", Name, ex.Message);
        }
    }

    // ── registry refresh: new loops flow without redeploy ───────────────────
    private async Task RegistryLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_settings.RegistryRefreshSeconds));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await _registry.RefreshAsync(_registryClient, _logger, ct);
            _status.RegistryLoops = _registry.Count;
            _status.RegistryRefreshedAt = _registry.LastRefreshed;
        }
    }

    // ── parking inventory flush ─────────────────────────────────────────────
    private async Task FlushLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        while (await timer.WaitForNextTickAsync(ct))
            await _inventory.FlushAsync(_unknownRepo, _logger, ct);
    }

    // ── helpers ─────────────────────────────────────────────────────────────
    private static bool Contradicts(string topicValue, string? payloadValue) =>
        !string.IsNullOrEmpty(payloadValue) &&
        !string.Equals(topicValue, payloadValue, StringComparison.OrdinalIgnoreCase);

    private static string RawJson(byte[] body)
    {
        var text = Encoding.UTF8.GetString(body);
        // The parking column is JSONB — wrap non-JSON payloads so the upsert cannot fail.
        return text.Length > 0 && (text[0] == '{' || text[0] == '[')
            ? text
            : System.Text.Json.JsonSerializer.Serialize(new { raw = text });
    }

    /// <summary>At most one log line per key per 30 s — the metrics carry exact counts.</summary>
    private void RateLimitedLog(string logKey, LogLevel level, string template, params object?[] args)
    {
        var now = Environment.TickCount64;
        lock (_lastLogTicks)
        {
            if (_lastLogTicks.TryGetValue(logKey, out var last) && now - last < 30_000) return;
            _lastLogTicks[logKey] = now;
        }
        _logger.Log(level, template, args);
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _channel.Writer.TryComplete();
        if (_client is not null)
        {
            try { await _client.StopAsync(); } catch { /* shutting down */ }
            _client.Dispose();
        }
        try { await Task.WhenAll(_workers).WaitAsync(TimeSpan.FromSeconds(5)); }
        catch { /* workers observed cancellation */ }
        try { await _inventory.FlushAsync(_unknownRepo, _logger, CancellationToken.None); }
        catch { /* final flush is best-effort */ }
        // Save last-known values on the way out: a planned restart should lose nothing,
        // and the periodic save may be up to a minute stale.
        try { await SaveStateAsync(CancellationToken.None); }
        catch { /* final save is best-effort */ }
        _cts.Dispose();
    }
}
