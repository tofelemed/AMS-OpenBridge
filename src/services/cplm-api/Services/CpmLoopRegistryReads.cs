using System.Text.Json;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-023 — the registry read path (GET /loops, GET /loops/{id}).
///
/// The list used to hydrate every loop with two more awaited round trips each — 1 + 2L
/// queries in series on one connection, ~0.45 s for the lab's 230 loops — and nine CPM
/// pages mount it. <see cref="LoadAllAsync"/> reads the tag map once and the links once
/// and groups them in memory; <see cref="LoadOneAsync"/> keeps the per-loop shape.
/// Both go through the same <see cref="Hydrate"/>, and the tests prove the batched list
/// equals the per-loop hydration loop for loop.
/// </summary>
public static class CpmLoopRegistryReads
{
    public const string RegistrySelect = """
        SELECT loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
               is_active, monitoring::text AS monitoring, tags::text AS tags, threshold_profile_id,
               engineering::text AS engineering, timezone,
               service_family, dynamic_class, objective_type, topology, command_path, acquisition::text AS acquisition, classification_source,
               created_at, updated_at
        FROM cpm.loop_registry
        """;

    private static readonly IReadOnlyList<(string SignalRole, string UnsPath, string? SourceTag)> NoMappings = Array.Empty<(string, string, string?)>();

    public static async Task<IReadOnlyList<CpmLoopDto>> LoadAllAsync(NpgsqlConnection conn)
    {
        var rows = (await conn.QueryAsync(RegistrySelect + " ORDER BY loop_id")).ToList();

        var tagsByLoop = (await conn.QueryAsync<(string LoopId, string SignalRole, string UnsPath, string? SourceTag)>("""
                SELECT loop_id, signal_role, uns_path, source_tag FROM cpm.loop_tag_map WHERE is_active = TRUE
                """))
            .GroupBy(t => t.LoopId, StringComparer.Ordinal)
            .ToDictionary(g => g.Key,
                          g => (IReadOnlyList<(string SignalRole, string UnsPath, string? SourceTag)>)g.Select(t => (t.SignalRole, t.UnsPath, t.SourceTag)).ToList(),
                          StringComparer.Ordinal);

        // Same set the per-loop UNION produced: a loop's outgoing links, plus incoming PEER
        // links seen from its side. UNION deduplicated, so a HashSet of the record does too.
        var linksByLoop = new Dictionary<string, HashSet<CpmLoopLinkDto>>(StringComparer.Ordinal);
        foreach (var l in await conn.QueryAsync<(string FromLoopId, string ToLoopId, string RelType, string Origin)>(
                     "SELECT from_loop_id, to_loop_id, rel_type, origin FROM cpm.loop_link"))
        {
            Add(linksByLoop, l.FromLoopId, new CpmLoopLinkDto(l.ToLoopId, l.RelType, l.Origin));
            if (l.RelType == "PEER")
                Add(linksByLoop, l.ToLoopId, new CpmLoopLinkDto(l.FromLoopId, l.RelType, l.Origin));
        }

        var result = new List<CpmLoopDto>(rows.Count);
        foreach (var row in rows)
        {
            string loopId = row.loop_id;
            var mappings = tagsByLoop.TryGetValue(loopId, out var t) ? t : NoMappings;
            var links = linksByLoop.TryGetValue(loopId, out var ls) ? Sorted(ls) : Array.Empty<CpmLoopLinkDto>();
            result.Add(Hydrate(row, mappings, links));
        }
        return result;
    }

    public static async Task<CpmLoopDto?> LoadOneAsync(NpgsqlConnection conn, string loopId)
    {
        var row = await conn.QueryFirstOrDefaultAsync(RegistrySelect + " WHERE loop_id = @loopId", new { loopId });
        if (row is null) return null;

        var mappings = (await conn.QueryAsync<(string SignalRole, string UnsPath, string? SourceTag)>("""
            SELECT signal_role, uns_path, source_tag FROM cpm.loop_tag_map
            WHERE loop_id = @loopId AND is_active = TRUE
            """, new { loopId })).ToList();

        var links = (await conn.QueryAsync<CpmLoopLinkDto>("""
            SELECT to_loop_id AS ToLoopId, rel_type AS RelType, origin AS Origin
            FROM cpm.loop_link WHERE from_loop_id = @loopId
            UNION
            SELECT from_loop_id, rel_type, origin
            FROM cpm.loop_link WHERE to_loop_id = @loopId AND rel_type = 'PEER'
            """, new { loopId })).ToList();

        return Hydrate(row, mappings, Sorted(links));
    }

    /// <summary>CHG-201: the active mappings with their source tags → the DTO, with the source tag per role (null when none).</summary>
    public static CpmLoopDto Hydrate(dynamic row, IReadOnlyList<(string SignalRole, string UnsPath, string? SourceTag)> mappings, IReadOnlyList<CpmLoopLinkDto> links)
    {
        CpmLoopDto dto = Hydrate(row, mappings.Select(m => (m.SignalRole, m.UnsPath)).ToList(), links);
        return dto with { SourceTags = SourceTagsOf(mappings) };
    }

    /// <summary>The trimmed source tag per role (upper-cased role, as Tags); a blank tag is no tag; null when no role has one.</summary>
    internal static IReadOnlyDictionary<string, string>? SourceTagsOf(IEnumerable<(string SignalRole, string UnsPath, string? SourceTag)> mappings)
    {
        var tags = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var m in mappings)
            if (!string.IsNullOrWhiteSpace(m.SourceTag)) tags[m.SignalRole.ToUpperInvariant()] = m.SourceTag.Trim();
        return tags.Count == 0 ? null : tags;
    }

    /// <summary>Pure: a registry row plus its active tag map and its links → the DTO.</summary>
    public static CpmLoopDto Hydrate(dynamic row, IReadOnlyList<(string SignalRole, string UnsPath)> tagMap, IReadOnlyList<CpmLoopLinkDto> links)
    {
        string loopId = row.loop_id;
        var tags = tagMap.ToDictionary(t => t.SignalRole.ToUpperInvariant(), t => t.UnsPath);
        var monitoring = ParseJson((string?)row.monitoring);
        var enabled = monitoring.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.True;
        var stepTest = monitoring.TryGetProperty("evidence", out var ev)
            && ev.TryGetProperty("stepTestApproved", out var st) && st.ValueKind == JsonValueKind.True;

        return new CpmLoopDto(
            loopId, (Guid?)row.asset_id, row.display_name, row.site, row.area, row.unit,
            row.loop_type, row.criticality, row.is_active, enabled, tags,
            BuildObservabilityFlags(tags.Keys, links, ParseJson((string?)row.engineering), ReadModel(row).CommandPath), links, stepTest, row.threshold_profile_id,
            ReadRange((string?)row.engineering), (string?)row.timezone, ReadModel(row),
            DateOf(row, "created_at"), DateOf(row, "updated_at"));
    }

    /// <summary>CHG-201: a registry timestamp column as UTC, or null when the row does not carry it (a narrower select).</summary>
    private static DateTime? DateOf(dynamic row, string column)
    {
        if (row is not IDictionary<string, object?> cols || !cols.TryGetValue(column, out var v) || v is null) return null;
        return v switch
        {
            DateTime d => d.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : d.ToUniversalTime(),
            DateTimeOffset o => o.UtcDateTime,
            _ => null,
        };
    }

    /// <summary>v2.5 (2G.1): the stored dimensions; a row that predates the columns reads as the loop_type preset.</summary>
    internal static CpmLoopModelDto ReadModel(dynamic row)
    {
        var stored = Registry.LoopModelDimensions.FromRow((string?)row.service_family, (string?)row.dynamic_class, (string?)row.objective_type,
            (string?)row.topology, (string?)row.command_path, (string?)row.acquisition, (string?)row.classification_source);
        var d = stored ?? Registry.LoopModelDimensions.PresetFor((string)row.loop_type);
        return new CpmLoopModelDto(d.ServiceFamily, d.DynamicClass, d.ObjectiveType, d.Topology, d.CommandPath, d.Acquisition, d.ClassificationSource);
    }

    internal static Registry.LoopModelDimensions.Resolved? StoredModel(dynamic? row) =>
        row is null ? null : Registry.LoopModelDimensions.FromRow((string?)row.service_family, (string?)row.dynamic_class, (string?)row.objective_type,
            (string?)row.topology, (string?)row.command_path, (string?)row.acquisition, (string?)row.classification_source);

    /// <summary>
    /// Flags derived from what the registry knows about the loop's signals and links.
    /// HAS_PEER_LINKS is not stamped here: it is published to the Flink broadcast
    /// (see CpmLoopRegistryService.PublishEvidenceAsync), which is what the gate reads.
    /// CHG-077: a missing input is a flag (and the registry's "Degraded") only where the loop declares it —
    /// a loop declared without a valve position (or without interacting loops) is not missing anything.
    /// </summary>
    internal static List<string> BuildObservabilityFlags(IEnumerable<string> roles, IReadOnlyList<CpmLoopLinkDto> links,
        JsonElement engineering = default, string? commandPath = null)
    {
        var set = new HashSet<string>(roles, StringComparer.OrdinalIgnoreCase);
        var flags = new List<string>();
        if (!set.Contains("VP") && Registry.OptionalInputs.VpApplicability(engineering, commandPath) == Registry.InputApplicability.Expected)
            flags.Add("NO_VP");
        if (links.Count == 0 && Registry.OptionalInputs.PeerApplicability(engineering) == Registry.InputApplicability.Expected)
            flags.Add("NO_UPSTREAM_LINKS");
        return flags;
    }

    internal static CpmEngineeringRange? ReadRange(string? engineeringJson)
    {
        var e = ParseJson(engineeringJson);
        if (e.ValueKind != JsonValueKind.Object) return null;

        static double? Num(JsonElement root, string name) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
                ? v.GetDouble() : null;

        var unit = e.TryGetProperty("pvUnit", out var u) && u.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(u.GetString()) ? u.GetString()!.Trim() : null;
        static string? Str(JsonElement root, string name) =>
            root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
                ? v.GetString()!.Trim() : null;
        var range = new CpmEngineeringRange(
            Num(e, "opMin"), Num(e, "opMax"), Num(e, "pvMin"), Num(e, "pvMax"), unit,
            Str(e, "vpApplicability"), Str(e, "peerApplicability"));
        return range is { OpMin: not null } or { OpMax: not null } or { PvMin: not null } or { PvMax: not null }
                   or { PvUnit: not null } or { VpApplicability: not null } or { PeerApplicability: not null }
            ? range : null;
    }

    /// <summary>Deterministic link order (the per-loop UNION had none) so responses are stable.</summary>
    private static IReadOnlyList<CpmLoopLinkDto> Sorted(IEnumerable<CpmLoopLinkDto> links) =>
        links.OrderBy(l => l.RelType, StringComparer.Ordinal)
             .ThenBy(l => l.ToLoopId, StringComparer.Ordinal)
             .ThenBy(l => l.Origin, StringComparer.Ordinal)
             .ToList();

    private static void Add(Dictionary<string, HashSet<CpmLoopLinkDto>> map, string loopId, CpmLoopLinkDto link)
    {
        if (!map.TryGetValue(loopId, out var set)) map[loopId] = set = new HashSet<CpmLoopLinkDto>();
        set.Add(link);
    }

    private static JsonElement ParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return default;
        try { return JsonDocument.Parse(json).RootElement; }
        catch (JsonException) { return default; }
    }
}
