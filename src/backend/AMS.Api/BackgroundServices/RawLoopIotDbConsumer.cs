using Confluent.Kafka;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using AMS.Api.Services;
using AMS.Infrastructure.Kafka;
using System.Text.Json;

namespace AMS.Api.BackgroundServices;

/// <summary>
/// CPLM Phase 3 (3.5) — loop historian writer: consumes loop.samples.v1 and
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
            GroupId = "ams-iotdb-raw-loop",
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

                var allOk = true;
                foreach (var (device, rows) in pending)
                {
                    await _iotdb.EnsureTimeseriesAsync(device, MeasurementTypes, stoppingToken);
                    var ok = await _iotdb.InsertBatchAsync(device, Measurements, rows, stoppingToken);
                    if (!ok)
                    {
                        // P2-17 - one malformed value used to reject the whole
                        // 500-row statement; offsets were withheld, the identical
                        // batch was redelivered, and the partition wedged forever
                        // behind a single poison row. Bisect: good halves land,
                        // the poison narrows to ONE row which is dropped loudly.
                        ok = await InsertBisectingAsync(device, rows, stoppingToken);
                    }
                    if (ok) written += rows.Count; else allOk = false;
                }

                if (allOk)
                {
                    foreach (var off in pendingOffsets) consumer.StoreOffset(off);
                    if (written > 0 && written % 5000 < FlushRows)
                        _logger.LogInformation("RawLoopIotDbConsumer wrote {Count} samples across {Devices} device(s)", written, pending.Count);
                }
                else
                {
                    _logger.LogWarning("IoTDB flush failed for at least one device; offsets not stored, batch will be redelivered");
                }
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

    /// <summary>
    /// P2-17 - recursively split a rejected batch. IoTDB rejects a multi-row
    /// INSERT atomically, so one bad value poisons all its neighbours; halving
    /// isolates it in O(log n) inserts. A single failing row is dropped with a
    /// loud log rather than wedging the partition forever - the historian is a
    /// best-effort mirror (Postgres holds the evidence), so availability of the
    /// other 499 rows wins over refusing to progress.
    /// </summary>
    private async Task<bool> InsertBisectingAsync(
        string device,
        IReadOnlyList<(long TimestampMs, IReadOnlyList<object?> Values)> rows,
        CancellationToken ct)
    {
        if (rows.Count == 0) return true;
        if (rows.Count == 1)
        {
            var ok = await _iotdb.InsertBatchAsync(device, Measurements, rows, ct);
            if (!ok)
            {
                _logger.LogError(
                    "Dropping poison sample for {Device} at ts={Ts} after repeated IoTDB rejection: {Values}",
                    device, rows[0].TimestampMs, string.Join(",", rows[0].Values));
            }
            return true; // the poison row is consumed either way
        }
        var mid = rows.Count / 2;
        var left = await InsertBisectingAsync(device, rows.Take(mid).ToList(), ct);
        var right = await InsertBisectingAsync(device, rows.Skip(mid).ToList(), ct);
        return left && right;
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
