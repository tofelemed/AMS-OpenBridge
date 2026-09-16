using System.Text;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Protocol;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Health;

/// <summary>
/// v2.5 Task 1H.2 (spec v6 §4.3-4.5): the isolated subscriber for one INSTRUMENTAL_HEALTH data
/// source. Separate from OtLoopSubscriber / LoopParameterMapper by design: it never joins
/// samples, and a bad health feed can never stall OT sample ingestion. Per message: topic shape
/// → strict contract validation → dedupe (idempotent / conflict) → epoch discipline (park an
/// event that precedes its epoch's snapshot) → forward to Kafka wrapped with what only the
/// gateway knows. Everything refused goes to the health DLQ with a reason.
/// </summary>
public sealed class InstrumentalHealthSubscriber : IAsyncDisposable
{
    private readonly DataSourceRow _row;
    private readonly string _password;
    private readonly InstrumentalHealthSettings _settings;
    private readonly IInstrumentalHealthSink _sink;
    private readonly SubscriberStatus _status;
    private readonly ILogger _logger;
    private readonly HealthDedupe _dedupe = new();
    private readonly EpochTracker _epochs = new();
    private readonly Channel<(string Topic, byte[] Payload, bool Retained)> _channel =
        Channel.CreateBounded<(string, byte[], bool)>(new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.Wait });
    private readonly CancellationTokenSource _cts = new();
    private readonly List<Task> _workers = new();
    private IManagedMqttClient? _client;

    public InstrumentalHealthSubscriber(DataSourceRow row, string password, InstrumentalHealthSettings settings,
        IInstrumentalHealthSink sink, SubscriberStatus status, ILogger logger)
    {
        _row = row; _password = password; _settings = settings; _sink = sink; _status = status; _logger = logger;
    }

    private string Name => _row.Name;

    public async Task StartAsync(CancellationToken hostCt)
    {
        var ct = _cts.Token;
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
        _ = InstrumentalHealthValidator.SchemaCount;   // fail fast if the embedded contract is missing

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
            return Task.CompletedTask;
        };
        _client.ConnectingFailedAsync += e =>
        {
            _status.Connected = false;
            _status.ConnectionError = e.Exception?.Message ?? "connect failed";
            return Task.CompletedTask;
        };
        _client.ApplicationMessageReceivedAsync += async e =>
        {
            var payload = e.ApplicationMessage.PayloadSegment.Count > 0 ? e.ApplicationMessage.PayloadSegment.ToArray() : Array.Empty<byte>();
            await _channel.Writer.WriteAsync((e.ApplicationMessage.Topic, payload, e.ApplicationMessage.Retain), ct);
        };
        await _client.StartAsync(new ManagedMqttClientOptionsBuilder()
            .WithClientOptions(options!)
            .WithAutoReconnectDelay(TimeSpan.FromSeconds(5))
            .Build());
        var filters = _settings.SubscriptionFilters();
        await _client.SubscribeAsync(filters.Select(t =>
            new MqttTopicFilterBuilder().WithTopic(t).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce).Build()).ToList());
        _logger.LogInformation("[{Name}] subscribed to {Filters} (qos 1); allowed sources: {Sources}",
            Name, string.Join(", ", filters), string.Join(", ", _settings.AllowedSourceIds));
        _workers.Add(Task.Run(() => ConsumeLoopAsync(ct), ct));
    }

    private async Task ConsumeLoopAsync(CancellationToken ct)
    {
        await foreach (var (topic, body, retained) in _channel.Reader.ReadAllAsync(ct))
        {
            try { await ProcessAsync(topic, body, retained, ct); }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) { _logger.LogError(ex, "[{Name}] health pipeline error on {Topic}", Name, topic); }
        }
    }

    /// <summary>One message end to end; the pure decision is <see cref="ProcessOne"/>.</summary>
    internal async Task ProcessAsync(string topic, byte[] body, bool retained, CancellationToken ct)
    {
        IngestionMetrics.MessagesReceived(Name);
        Interlocked.Increment(ref _status.MessagesReceived);
        _status.LastMessageAt = DateTimeOffset.UtcNow;
        var outcome = ProcessOne(topic, body, retained, DateTimeOffset.UtcNow, out var key, out var json, out var dlq);
        switch (outcome)
        {
            case Outcome.Forward:
                if (!_sink.Enabled) return;
                try { await _sink.PublishAsync(key!, json!, ct); Interlocked.Increment(ref _status.TuplesEmitted); }
                catch (Exception ex) { Interlocked.Increment(ref _status.KafkaFailures); _logger.LogError(ex, "[{Name}] Kafka publish failed", Name); }
                break;
            case Outcome.Duplicate:
                Interlocked.Increment(ref _status.HealthDuplicates);
                break;
            case Outcome.DeadLetter:
                if (dlq!.Reason == HealthDlqReasons.IntegrityConflict) Interlocked.Increment(ref _status.HealthConflicts);
                if (dlq.Reason == HealthDlqReasons.EpochWithoutSnapshot) Interlocked.Increment(ref _status.Parked);
                else Interlocked.Increment(ref _status.DeadLettered);
                _logger.LogWarning("[{Name}] health message refused ({Reason}): {Detail} [{Topic}]", Name, dlq.Reason, dlq.Detail, topic);
                if (!_sink.Enabled) return;
                try { await _sink.PublishDeadLetterAsync(key ?? topic, dlq, ct); }
                catch (Exception ex) { Interlocked.Increment(ref _status.KafkaFailures); _logger.LogError(ex, "[{Name}] DLQ publish failed", Name); }
                break;
        }
    }

    public enum Outcome { Forward, Duplicate, DeadLetter }

    /// <summary>The pure decision for one message: what to forward, or why to refuse it.</summary>
    public Outcome ProcessOne(string topic, byte[] body, bool retained, DateTimeOffset receivedAt,
        out string? key, out string? json, out DeadLetterRecord? dlq)
    {
        key = null; json = null; dlq = null;
        var receivedMs = receivedAt.ToUnixTimeMilliseconds();
        if (!HealthTopic.TryParse(_settings.TopicPrefix, topic, out var parsed, out var terr))
        {
            dlq = new DeadLetterRecord(HealthDlqReasons.TopicShape, _row.ConfigId, topic, Snippet(body), receivedMs, terr);
            return Outcome.DeadLetter;
        }
        var verdict = InstrumentalHealthValidator.Validate(parsed!, body, _settings, receivedAt, out var observation);
        if (!verdict.Ok)
        {
            dlq = new DeadLetterRecord(verdict.Reason!, _row.ConfigId, topic, Snippet(body), receivedMs, verdict.Detail);
            return Outcome.DeadLetter;
        }
        var flags = new List<string>();
        if (parsed!.Kind != HealthTopicKind.Availability)
        {
            switch (_dedupe.Check(observation!))
            {
                case DedupeVerdict.Duplicate:
                    return Outcome.Duplicate;
                case DedupeVerdict.Conflict:
                    dlq = new DeadLetterRecord(HealthDlqReasons.IntegrityConflict, _row.ConfigId, topic, Snippet(body), receivedMs,
                        $"observation {HealthDedupe.Key(observation!)} was already received with a different payload");
                    key = parsed.DeviceId;
                    return Outcome.DeadLetter;
            }
            var seq = _epochs.Check(observation!);
            if (seq.Action == SequenceAction.Park)
            {
                dlq = new DeadLetterRecord(seq.Reason!, _row.ConfigId, topic, Snippet(body), receivedMs,
                    "an event/incomplete state for a producer epoch whose complete snapshot has not arrived; replay after the snapshot");
                key = parsed.DeviceId;
                return Outcome.DeadLetter;
            }
            if (seq.Action == SequenceAction.Flag) flags.Add(seq.Reason!);
        }
        key = parsed.Kind == HealthTopicKind.Availability ? parsed.SourceId! : parsed.DeviceId!;
        json = InstrumentalHealthValidator.Wrap(observation!, parsed, topic, retained, _row.Username, _row.ConfigId, receivedAt, flags);
        return Outcome.Forward;
    }

    private static string Snippet(byte[] body)
    {
        var s = Encoding.UTF8.GetString(body, 0, Math.Min(body.Length, 2048));
        return body.Length > 2048 ? s + "…" : s;
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _channel.Writer.TryComplete();
        try { await Task.WhenAll(_workers); } catch { /* cancelled */ }
        if (_client is not null)
        {
            try { await _client.StopAsync(); } catch { /* best effort */ }
            _client.Dispose();
        }
        _cts.Dispose();
    }
}
