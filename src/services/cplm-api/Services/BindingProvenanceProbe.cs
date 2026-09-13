using System.Net.Http.Json;
using System.Text.Json;

namespace Traverse.CplmApi.Services;

/// <summary>
/// CHG-024 — readiness's binding-provenance check (Phase 4.7): does each mapped signal
/// resolve through the asset model, or only by path fallback? A fallback binding derives
/// a different sparkplug device id, so it can look resolved while pointing at nothing.
///
/// Was: one GET /resolve per mapped role, five awaited round trips with a 5 s budget each,
/// on every loop click in the Explorer. Now: the mapped roles go to the resolver's
/// POST /resolve/batch in ONE request (aligned by index) and each role's <c>provenance</c>
/// is read from its slot. Labels, their order and the message text are unchanged.
///
/// The gateway-injected identity headers are forwarded: since the Plan 04 lockdown
/// binding-resolver requires <c>binding.resolve</c>, and an anonymous probe got 401 and
/// reported every role "(unreachable)" — so this check could never pass for ANY loop.
/// </summary>
public static class BindingProvenanceProbe
{
    public static readonly string[] Roles = { "pv", "sp", "op", "vp", "mode" };
    public static readonly string[] ForwardedHeaders = { "X-Auth-Subject", "X-Auth-Username", "X-Auth-Role", "X-Auth-Permissions" };

    public static async Task<(bool Ok, string? Message)> CheckAsync(
        HttpClient client, string resolverBaseUrl, JsonElement tags,
        IReadOnlyDictionary<string, string> forwardHeaders, ILogger logger, CancellationToken ct)
    {
        if (tags.ValueKind != JsonValueKind.Object) return (false, "No signal mappings to check.");

        var probes = new List<(string Role, string Path)>();
        foreach (var role in Roles)
        {
            if (!tags.TryGetProperty(role, out var t) || t.ValueKind != JsonValueKind.String) continue;
            var path = t.GetString();
            if (string.IsNullOrWhiteSpace(path)) continue;
            probes.Add((role, path!));
        }
        if (probes.Count == 0) return (true, null);

        // Ordered by the probe order above, not by completion, so the message text
        // is deterministic for the same loop.
        var labels = await ProbeBatchAsync(client, resolverBaseUrl.TrimEnd('/'), probes, forwardHeaders, logger, ct);
        var fallbacks = labels.Where(l => l is not null).ToList();

        return fallbacks.Count == 0
            ? (true, null)
            : (false, $"Resolved by path fallback, not the asset model: {string.Join(", ", fallbacks)}. " +
                      "Register these signals as assets — a fallback binding derives a different device id and may point at nothing.");
    }

    /// <summary>One label per probe: null when it resolves via the asset model, else the role (with a reason when unreachable).</summary>
    private static async Task<string?[]> ProbeBatchAsync(
        HttpClient client, string baseUrl, List<(string Role, string Path)> probes,
        IReadOnlyDictionary<string, string> forwardHeaders, ILogger logger, CancellationToken ct)
    {
        var labels = new string?[probes.Count];
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/resolve/batch")
            {
                Content = JsonContent.Create(new
                {
                    bindings = probes.Select(p => new { path = p.Path, roles = new[] { "live" } }).ToArray(),
                }),
            };
            foreach (var (name, value) in forwardHeaders)
                if (!string.IsNullOrEmpty(value)) req.Headers.TryAddWithoutValidation(name, value);

            var res = await client.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                for (var i = 0; i < probes.Count; i++) labels[i] = $"{probes[i].Role} (unreachable: HTTP {(int)res.StatusCode})";
                return labels;
            }

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            var bindings = doc.RootElement.TryGetProperty("bindings", out var b) && b.ValueKind == JsonValueKind.Array
                ? b.EnumerateArray().ToList()
                : new List<JsonElement>();

            for (var i = 0; i < probes.Count; i++)
            {
                // Aligned by index. A short or malformed answer is not trusted for the
                // roles it does not cover — they are reported, not assumed fine.
                var provenance = i < bindings.Count && bindings[i].ValueKind == JsonValueKind.Object
                    && bindings[i].TryGetProperty("provenance", out var p) ? p.GetString() : null;
                labels[i] = string.Equals(provenance, "asset-model", StringComparison.OrdinalIgnoreCase) ? null : probes[i].Role;
            }
            return labels;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // caller abandoned the request — not a provenance verdict
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Binding provenance batch probe failed");
            for (var i = 0; i < probes.Count; i++) labels[i] = $"{probes[i].Role} (unreachable)";
            return labels;
        }
    }
}
