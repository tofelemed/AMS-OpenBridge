using System.Buffers;
using System.Text;
using System.Text.Json;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Pipeline;

/// <summary>One merged loop sample on the traverse.cpa.loop.samples.v1 wire
/// (docs/ot-data-integration/09 §4): frozen contract fields + additive enrichment.</summary>
public sealed record LoopTuple(
    string LoopId, long EventTsMs, long IngestTsMs, double Pv, double Sp, double Op, double? Vp,
    string Mode, string Quality, string LoopType,
    string Site, string? Area, string? Unit, string? AssetUuid, string? SourceFcs,
    IReadOnlyDictionary<string, double> Extras)
{
    /// <summary>Contract fields first (read by Flink CplmNormalizedSample and
    /// RawLoopIotDbConsumer), enrichment extensions after — every existing consumer
    /// reads named fields and ignores the rest.</summary>
    public string ToJson()
    {
        var buffer = new ArrayBufferWriter<byte>(256);
        using (var w = new Utf8JsonWriter(buffer))
        {
            w.WriteStartObject();
            w.WriteString("loop_id", LoopId);
            w.WriteNumber("event_ts_ms", EventTsMs);
            // Wall clock at emission. event_ts_ms is the PROCESS time from OT; this
            // is the only place ingestion time survives, so end-to-end lag and
            // gateway clock drift stay measurable without polluting event time.
            w.WriteNumber("ingest_ts_ms", IngestTsMs);
            w.WriteNumber("pv", Pv);
            w.WriteNumber("sp", Sp);
            w.WriteNumber("op", Op);
            if (Vp is { } vp) w.WriteNumber("vp", vp);
            w.WriteString("mode", Mode);
            w.WriteString("quality", Quality);
            w.WriteString("loop_type", LoopType);
            if (!string.IsNullOrEmpty(Site)) w.WriteString("site", Site);
            if (!string.IsNullOrEmpty(Area)) w.WriteString("area", Area);
            if (!string.IsNullOrEmpty(Unit)) w.WriteString("unit", Unit);
            if (!string.IsNullOrEmpty(AssetUuid)) w.WriteString("asset_uuid", AssetUuid);
            if (!string.IsNullOrEmpty(SourceFcs)) w.WriteString("source_fcs", SourceFcs);
            foreach (var (key, value) in Extras) w.WriteNumber(key, value);
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }
}

/// <summary>
/// The stateful heart (doc 03 §5.2): per-loop last-known values, a steady grid
/// (default 5 s), forward-fill for on-change signals. Never emits before pv/sp/op
/// have each been seen — the Flink engine silently discards incomplete tuples. A
/// member whose OT quality tag is bad emits quality BAD instead of skipping the
/// tick: bad ticks feed the exclusion gates, skipped ticks just vanish. Deterministic:
/// the emission CADENCE comes from the caller's nowMs, so tests drive a fake clock.
/// Tuples are stamped with the newest OT source timestamp among their members —
/// event_ts_ms is process time, not ingestion time — and a tick whose members have
/// all gone quiet is skipped rather than re-stamped.
/// </summary>
public sealed class LoopJoiner
{
    private sealed class Member { public double Value; public long TsMs; public bool Good; }

    private sealed class LoopState
    {
        public RegistryLoop Loop = default!;
        public string? SourceFcs;
        public readonly Dictionary<string, Member> Members = new(StringComparer.Ordinal); // pv/sp/op/vp
        public readonly Dictionary<string, Member> Extras = new(StringComparer.Ordinal);  // p/i/d/gw/…
        public string? Mode;
        public long ModeTsMs;
        /// <summary>Newest source ts already published for this loop. event_ts_ms must
        /// advance strictly: two tuples sharing a timestamp are ONE row in IoTDB
        /// (device+timestamp is the key), so the second would silently overwrite.</summary>
        public long LastEmittedTsMs;
        public long NextTickMs;
    }

    private readonly Dictionary<string, LoopState> _loops = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public int ActiveLoops { get { lock (_gate) return _loops.Count; } }

    /// <summary>Ticks that produced no tuple because no member advanced. A steadily
    /// climbing value means a loop has gone quiet — otherwise invisible, since the
    /// old behaviour was to keep republishing the same forward-filled values.</summary>
    public long SkippedNoAdvance { get; private set; }

    public void Accept(RegistryLoop loop, string sourceFcs, MappedParameter mapped,
        OtLoopPayload payload, LoopIngestSettings cfg, long nowMs)
    {
        lock (_gate)
        {
            if (!_loops.TryGetValue(loop.LoopId, out var state))
                _loops[loop.LoopId] = state = new LoopState { NextTickMs = NextGridBoundary(nowMs, cfg.GridSeconds) };
            state.Loop = loop;
            state.SourceFcs = sourceFcs;

            if (mapped.Role == "mode")
            {
                state.Mode = mapped.ModeString;
                state.ModeTsMs = payload.TsMs;
                return;
            }

            var bucket = mapped.IsTupleMember ? state.Members : state.Extras;
            if (!bucket.TryGetValue(mapped.Role, out var member))
                bucket[mapped.Role] = member = new Member();
            member.Value = mapped.NumericValue!.Value;
            member.TsMs = payload.TsMs;
            member.Good = IsGood(payload.Quality);
        }
    }

    /// <summary>Emit one tuple per loop whose grid boundary has passed. After a pause
    /// (Kafka stall, gap), the loop fast-forwards to the latest boundary ≤ now — no
    /// catch-up emission of skipped boundaries (late data is dropped downstream anyway).</summary>
    public List<LoopTuple> Tick(long nowMs, LoopIngestSettings cfg)
    {
        var grid = cfg.GridSeconds * 1000L;
        var output = new List<LoopTuple>();
        lock (_gate)
        {
            foreach (var state in _loops.Values)
            {
                if (nowMs < state.NextTickMs) continue;
                var tick = nowMs / grid * grid; // latest boundary ≤ now (≥ the scheduled one)
                state.NextTickMs = tick + grid;

                if (!state.Members.TryGetValue("pv", out var pv) ||
                    !state.Members.TryGetValue("sp", out var sp) ||
                    !state.Members.TryGetValue("op", out var op))
                    continue; // incomplete — downstream would silently discard anyway

                // event_ts_ms is the PROCESS timestamp from OT, never the grid boundary:
                // an industrial record has to carry the instant the plant produced it, so
                // it lines up with the DCS trend, the SOE and the historian. We take the
                // newest source ts among the tuple members — the instant the tuple is
                // "as of" — and never synthesise one.
                var sourceTs = Math.Max(pv.TsMs, Math.Max(sp.TsMs, op.TsMs));
                var hasVp = state.Members.TryGetValue("vp", out var vp);
                if (hasVp) sourceTs = Math.Max(sourceTs, vp!.TsMs);
                sourceTs = Math.Max(sourceTs, state.ModeTsMs);

                // Nothing new arrived since the last publish: every member is a
                // forward-fill of already-published values. Emitting would repeat an
                // event_ts_ms, and IoTDB keys rows by (device, timestamp) — the repeat
                // would overwrite the original rather than add a sample. Skip instead;
                // a stalled loop must look like a gap, not like fresh steady data.
                if (sourceTs <= state.LastEmittedTsMs) { SkippedNoAdvance++; continue; }
                state.LastEmittedTsMs = sourceTs;

                // Quality is OT's verdict, nothing else: worst-of the quality tags on
                // pv/sp/op. We deliberately do NOT age values out — a setpoint untouched
                // for an hour is unchanged, not untrustworthy, and only the source can
                // say a value is bad. A gateway that stops publishing altogether is
                // already covered by the no-advance skip above (it emits nothing rather
                // than republishing forward-filled values).
                var bad = !pv.Good || !sp.Good || !op.Good;

                output.Add(new LoopTuple(
                    LoopId: state.Loop.LoopId,
                    EventTsMs: sourceTs,
                    IngestTsMs: nowMs,
                    Pv: pv.Value, Sp: sp.Value, Op: op.Value,
                    Vp: hasVp ? vp!.Value : null,
                    Mode: state.Mode ?? "UNKNOWN",
                    Quality: bad ? "BAD" : "GOOD",
                    LoopType: state.Loop.LoopType,
                    Site: state.Loop.Site, Area: state.Loop.Area, Unit: state.Loop.Unit,
                    AssetUuid: state.Loop.AssetUuid, SourceFcs: state.SourceFcs,
                    Extras: state.Extras.ToDictionary(kv => kv.Key, kv => kv.Value.Value, StringComparer.Ordinal)));
            }
        }
        return output;
    }

    internal static long NextGridBoundary(long nowMs, int gridSeconds)
    {
        var grid = gridSeconds * 1000L;
        return (nowMs / grid + 1) * grid;
    }

    /// <summary>Same rule the Flink engine applies: good = starts with g/G or OPC numeric ≥ 192.</summary>
    private static bool IsGood(string quality) =>
        quality.StartsWith("g", StringComparison.OrdinalIgnoreCase) ||
        (int.TryParse(quality, out var q) && q >= 192);
}
