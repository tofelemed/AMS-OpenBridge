using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AMS.Api.Services;
using AMS.Infrastructure.Kafka;
using System.Text.Json;

namespace AMS.Api.BackgroundServices;

/// <summary>
/// CPLM Phase 3 (3.5) — loop historian writer: consumes traverse.cpa.loop.samples.v1 and
/// persists samples into IoTDB at root.&lt;site&gt;.cpm.&lt;loop&gt;.{pv,sp,op,vp,mode}.
/// Modelling the loop as ONE IoTDB device with pv/sp/op/vp/mode as measurements
/// makes multi-signal trend reads align for free (intake decision, 6.4).
///
/// Ported from CPA's RawLoopIotDbConsumer with the plan-mandated fixes:
///   * batched writes (accumulate per loop, flush at 500 rows or 5 s) instead
///     of one fire-and-forget REST call per sample
///   * explicit CREATE TIMESERIES (DOUBLE / TEXT) before first write per device
///   * offsets stored only after a successful flush (at-least-once); IoTDB
///     writes are idempotent by (device, timestamp), so redelivery is safe
/// </summary>
public sealed class RawLoopIotDbConsumer : BackgroundService
{
    private static readonly string[] Measurements = { "pv", "sp", "op", "vp", "mode" };
    private static readonly Dictionary<string, string> MeasurementTypes = new()
    {
        ["pv"] = "DOUBLE", ["sp"] = "DOUBLE", ["op"] = "DOUBLE", ["vp"] = "DOUBLE", ["mode"] = "TEXT"
    };
    private const int FlushRows = 500;
    private static readonly TimeSpan FlushInterval = TimeSpan.FromSeconds(5);
    /// <summary>CHG-020 — pause between retries while IoTDB is refusing writes.</summary>
    private static readonly TimeSpan StallBackoff = TimeSpan.FromSeconds(5);
    /// <summary>
    /// CHG-020 — how many rows must be rejected with none landing before we call it a
    /// server fault rather than bad data. One rejected row on its own proves nothing;
    /// five consecutive individually-rejected samples in a homogeneous stream is not a
    /// data problem. At ~120 samples/s this threshold is reached within one flush.
    /// </summary>
    private const int MinRejectedForServerVerdict = 5;

    private readonly ILogger<RawLoopIotDbConsumer> _logger;
    private readonly IotDbWriteClient _iotdb;
    private readonly CplmOptions _cplm;
    private readonly string _bootstrap;

    public RawLoopIotDbConsumer(
        ILogger<RawLoopIotDbConsumer> logger,
        IotDbWriteClient iotdb,
        IOptions<CplmOptions> cplmOptions,
        IOptions<KafkaOptions> kafka)
    {
        _logger = logger;
        _iotdb = iotdb;
        _cplm = cplmOptions.Value;
        _bootstrap = kafka.Value.BootstrapServers;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_iotdb.Enabled)
        {
            _logger.LogInformation("RawLoopIotDbConsumer disabled (IotDb:Enabled=false).");
            return;
        }

        await Task.Yield();
        var config = new ConsumerConfig
        {
            BootstrapServers = _bootstrap,
            GroupId = "traverse-cpa-iotdb-raw-loop",
            // Earliest: on first deploy, backfill the historian from what the
            // topic retains (7 d) so evidence trends have history immediately.
            AutoOffsetReset = AutoOffsetReset.Earliest,
            EnableAutoCommit = true,
            EnableAutoOffsetStore = false
        };

        using var consumer = new ConsumerBuilder<string, string>(config).Build();
        consumer.Subscribe(_cplm.SamplesTopic);
        _logger.LogInformation("RawLoopIotDbConsumer started: {Topic} → IoTDB {Root}.<loop>", _cplm.SamplesTopic, _iotdb.LoopRootPrefix);

        // device → pending rows; offsets stored only when the whole buffer flushes.
        var pending = new Dictionary<string, List<(long Ts, IReadOnlyList<object?> Values)>>();
        var pendingOffsets = new List<ConsumeResult<string, string>>();
        var lastFlush = DateTime.UtcNow;
        long written = 0;
        // CHG-020 — while IoTDB refuses writes we stop consuming rather than keep
        // buffering (or worse, keep discarding). The buffer is retried as-is.
        var paused = false;
        var stalledSince = DateTime.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var cr = consumer.Consume(TimeSpan.FromMilliseconds(500));
                if (cr != null && !string.IsNullOrWhiteSpace(cr.Message.Value))
                {
                    if (TryParse(cr, out var device, out var row))
                    {
                        if (!pending.TryGetValue(device, out var rows))
                            pending[device] = rows = new List<(long, IReadOnlyList<object?>)>();
                        rows.Add(row);
                    }
                    // Unparseable/keyless samples advance with the next flush.
                    pendingOffsets.Add(cr);
                }

                var total = pending.Sum(kv => kv.Value.Count);
                if (total == 0 && pendingOffsets.Count > 0 && DateTime.UtcNow - lastFlush >= FlushInterval)
                {
                    foreach (var off in pendingOffsets) consumer.StoreOffset(off);
                    pendingOffsets.Clear();
                    lastFlush = DateTime.UtcNow;
                    continue;
                }
                if (total == 0 || (total < FlushRows && DateTime.UtcNow - lastFlush < FlushInterval))
                    continue;

                // CHG-020 - rejected rows are collected, not dropped in place. Whether
                // they are poison or collateral of an unavailable server cannot be known
                // per row; it is decided once, below, for the flush as a whole.
                var rejected = new List<(string Device, long Ts, IReadOnlyList<object?> Values)>();
                var landed = 0;
                var serverDown = false;
                foreach (var (device, rows) in pending)
                {
                    await _iotdb.EnsureTimeseriesAsync(device, MeasurementTypes, stoppingToken);
                    var outcome = await InsertBisectingAsync(device, rows, rejected, stoppingToken);
                    landed += outcome.Landed;
                    if (outcome.ServerDown) { serverDown = true; break; }
                }

                // The discriminator. A single bad value cannot stop its 499 neighbours from
                // landing, so if NOTHING landed the fault is the server, not the data -
                // hold the offsets and let Kafka keep the samples.
                var infrastructureFault = serverDown || (landed == 0 && rejected.Count >= MinRejectedForServerVerdict);
                if (infrastructureFault)
                {
                    if (stalledSince == DateTime.MinValue) stalledSince = DateTime.UtcNow;
                    if (!paused && consumer.Assignment.Count > 0)
                    {
                        consumer.Pause(consumer.Assignment);
                        paused = true;
                    }
                    LogStall(rejected.Count, stalledSince);
                    // Buffer and offsets are deliberately KEPT: the same rows are retried
                    // until they land. IoTDB keys on (device, timestamp), so replay is a
                    // no-op once it recovers.
                    await Task.Delay(StallBackoff, stoppingToken);
                    continue;
                }

                if (landed == 0 && rejected.Count > 0)
                {
                    // Too few rows to tell one bad value from a dead server, and pausing
                    // here would be self-defeating: it stops the very siblings arriving
                    // that would settle it. Keep the buffer, keep reading - the next flush
                    // either lands something (so these are poison) or reaches the verdict
                    // threshold (so the server is down).
                    if (stalledSince == DateTime.MinValue) stalledSince = DateTime.UtcNow;
                    lastFlush = DateTime.UtcNow;
                    continue;
                }

                if (paused)
                {
                    consumer.Resume(consumer.Assignment);
                    paused = false;
                    _logger.LogWarning(
                        "IoTDB writes recovered after {Stalled}; resuming consumption, {Landed} buffered sample(s) written",
                        DateTime.UtcNow - stalledSince, landed);
                }
                stalledSince = DateTime.MinValue;

                // Genuine poison: siblings landed, these did not. Dropping is correct -
                // no retry will ever make a malformed value insertable.
                foreach (var bad in rejected) LogPoisonDrop(bad.Device, bad.Ts, bad.Values);

                written += landed;
                foreach (var off in pendingOffsets) consumer.StoreOffset(off);
                if (written > 0 && written % 5000 < FlushRows)
                    _logger.LogInformation("RawLoopIotDbConsumer wrote {Count} samples across {Devices} device(s)", written, pending.Count);
                pending.Clear();
                pendingOffsets.Clear();
                lastFlush = DateTime.UtcNow;
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "RawLoopIotDbConsumer error");
                pending.Clear();
                pendingOffsets.Clear();
                // Never stay paused on a path that just discarded the buffer we were
                // holding for - that would wedge the partition with nothing to retry.
                if (paused)
                {
                    consumer.Resume(consumer.Assignment);
                    paused = false;
                    stalledSince = DateTime.MinValue;
                }
                await Task.Delay(500, stoppingToken);
            }
        }

        consumer.Close();
    }

    private bool TryParse(ConsumeResult<string, string> cr, out string device, out (long, IReadOnlyList<object?>) row)
    {
        device = "";
        row = default;
        try
        {
            using var doc = JsonDocument.Parse(cr.Message.Value);
            var r = doc.RootElement;
            var loopId = GetString(r, "loop_id") ?? GetString(r, "tagId") ?? cr.Message.Key;
            if (string.IsNullOrWhiteSpace(loopId))
            {
                // P2-18 - these two rejects were silent returns while offsets
                // advanced, so a producer field rename would stop the historian
                // gaining data with ZERO diagnostics. Rate-limited so a bad
                // producer cannot flood the log.
                LogParseDrop("missing loop_id/tagId/key", cr);
                return false;
            }

            long ts;
            if (r.TryGetProperty("event_ts_ms", out var t1) && t1.TryGetInt64(out var v1)) ts = v1;
            else if (r.TryGetProperty("timestamp", out var t2) && t2.TryGetInt64(out var v2)) ts = v2;
            else
            {
                LogParseDrop("missing/non-integer event_ts_ms/timestamp", cr);
                return false;
            }

            device = $"{_iotdb.LoopRootPrefix}.{IotDbWriteClient.SafeNode(loopId)}";
            row = (ts, new object?[]
            {
                GetDouble(r, "pv"), GetDouble(r, "sp"), GetDouble(r, "op"),
                GetDouble(r, "vp"), GetString(r, "mode")
            });
            return true;
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Unparseable loop sample skipped");
            return false;
        }
    }

    /// <summary>How much of one device's batch landed, and whether the server was up at all.</summary>
    private readonly record struct BatchOutcome(int Landed, bool ServerDown);

    /// <summary>
    /// P2-17 - insert a device's batch, splitting it only as far as a rejection forces.
    /// IoTDB rejects a multi-row INSERT atomically, so one bad value takes its neighbours
    /// with it; halving isolates it in O(log n) statements.
    ///
    /// CHG-020 fixed two things here. It now retries each HALF before descending - the
    /// previous version split straight to singles, so a rejected 500-row batch always cost
    /// 500 statements, never the O(log n) the comment claimed. And it no longer decides on
    /// its own that a row is poison: rejected rows go into <paramref name="rejected"/> and
    /// the caller rules on them once it knows whether anything landed. An
    /// <c>Unavailable</c> answer aborts the split immediately - there is no point bisecting
    /// a server that is not reading the statements.
    /// </summary>
    private async Task<BatchOutcome> InsertBisectingAsync(
        string device,
        IReadOnlyList<(long TimestampMs, IReadOnlyList<object?> Values)> rows,
        List<(string Device, long Ts, IReadOnlyList<object?> Values)> rejected,
        CancellationToken ct)
    {
        if (rows.Count == 0) return new BatchOutcome(0, false);

        var outcome = await _iotdb.InsertBatchAsync(device, Measurements, rows, ct);
        if (outcome == IotDbWriteOutcome.Ok) return new BatchOutcome(rows.Count, false);
        if (outcome == IotDbWriteOutcome.Unavailable) return new BatchOutcome(0, true);

        if (rows.Count == 1)
        {
            rejected.Add((device, rows[0].TimestampMs, rows[0].Values));
            return new BatchOutcome(0, false);
        }

        var mid = rows.Count / 2;
        var left = await InsertBisectingAsync(device, rows.Take(mid).ToList(), rejected, ct);
        if (left.ServerDown) return left;
        var right = await InsertBisectingAsync(device, rows.Skip(mid).ToList(), rejected, ct);
        return new BatchOutcome(left.Landed + right.Landed, right.ServerDown);
    }

    private long _poisonDrops;

    /// <summary>Count every dropped sample - a silent drop is how the last hole went unnoticed.</summary>
    private void LogPoisonDrop(string device, long ts, IReadOnlyList<object?> values)
    {
        _poisonDrops++;
        _logger.LogError(
            "Dropping poison sample for {Device} at ts={Ts} after IoTDB rejected it alone ({Total} dropped so far): {Values}",
            device, ts, _poisonDrops, string.Join(",", values));
    }

    private DateTime _lastStallLog = DateTime.MinValue;

    /// <summary>
    /// The state the previous code could not report: IoTDB is refusing everything, so the
    /// consumer is holding its offsets and no longer reading. Loud once a minute - the
    /// samples are safe in Kafka for as long as its retention, and no longer after that.
    /// </summary>
    private void LogStall(int held, DateTime since)
    {
        if (DateTime.UtcNow - _lastStallLog < TimeSpan.FromMinutes(1)) return;
        _lastStallLog = DateTime.UtcNow;
        _logger.LogError(
            "IoTDB is rejecting every write ({Held} sample(s) held, stalled for {For}). Consumption is PAUSED and "
            + "offsets are NOT being stored - samples stay in Kafka and will be written on recovery, but are lost "
            + "if the outage outlives topic retention. Check IoTDB disk and health.",
            held, DateTime.UtcNow - since);
    }

    private long _parseDrops;
    private DateTime _lastParseDropLog = DateTime.MinValue;

    /// <summary>P2-18 - count every drop, log at most once per minute with the total.</summary>
    private void LogParseDrop(string why, ConsumeResult<string, string> cr)
    {
        _parseDrops++;
        if (DateTime.UtcNow - _lastParseDropLog < TimeSpan.FromMinutes(1)) return;
        _lastParseDropLog = DateTime.UtcNow;
        var sample = cr.Message.Value;
        _logger.LogWarning(
            "RawLoopIotDbConsumer dropped {Total} unparseable sample(s) so far; latest: {Why}; payload head: {Head}",
            _parseDrops, why, sample.Length <= 160 ? sample : sample[..160]);
    }

    private static string? GetString(JsonElement r, string name) =>
        r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    private static double? GetDouble(JsonElement r, string name)
    {
        if (!r.TryGetProperty(name, out var p)) return null;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetDouble(out var d)) return d;
        if (p.ValueKind == JsonValueKind.String && double.TryParse(p.GetString(), out var ds)) return ds;
        return null;
    }
}
