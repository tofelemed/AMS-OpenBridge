using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

/// <summary>
/// JSON readers shared by the CPLM result consumer's persist paths (split out of
/// CplmResultConsumerService in v2.5 for the file-size rule; no behaviour changed).
/// </summary>
internal static class ResultPayloadReader
{
    internal static string? GetString(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    /// <summary>Missing/null/non-numeric → 0.0, never NULL (CPA-compatible; ranking depends on it).</summary>
    internal static double GetDouble(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number
           && p.TryGetDouble(out var v) ? v : 0.0;

    /// <summary>
    /// P1-8 - preserves "the engine did not compute this" as SQL NULL instead of
    /// collapsing it to 0.0. The engine now emits JSON null for metrics it never
    /// calculated (window failed G0 / too few samples); writing 0.0 made those
    /// indistinguishable from a real measurement, so mae = 0 read as perfect
    /// control and every fleet average was dragged toward zero by the windows
    /// that never ran. A genuinely-absent key stays 0.0 for back-compat with
    /// producers that predate the change.
    /// </summary>
    internal static object GetDoubleOrNull(JsonElement r, string name)
    {
        if (!r.TryGetProperty(name, out var p)) return 0.0;              // key absent: legacy producer
        if (p.ValueKind != JsonValueKind.Number) return DBNull.Value;     // explicit null / wrong type: "not computed"
        return p.TryGetDouble(out var v) ? v : DBNull.Value;
    }

    internal static int GetInt(JsonElement r, string name)
        => r.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number
           && p.TryGetInt32(out var v) ? v : 0;

    /// <summary>True when windowEndMs is present, numeric and positive — the
    /// minimum for a row keyed on the hypertable's NOT NULL window_end column.</summary>
    internal static bool HasUsableWindowEnd(JsonElement r)
        => r.TryGetProperty("windowEndMs", out var p) && p.ValueKind == JsonValueKind.Number
           && p.TryGetInt64(out var ms) && ms > 0;

    internal static void AddTimestamp(NpgsqlCommand cmd, string param, JsonElement r, string msField)
    {
        object value = DBNull.Value;
        if (r.TryGetProperty(msField, out var p) && p.ValueKind == JsonValueKind.Number
            && p.TryGetInt64(out var ms) && ms > 0)
            value = DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
        cmd.Parameters.AddWithValue(param, value);
    }

    internal static string Snippet(string json) => json.Length <= 200 ? json : json[..200] + "…";
}
