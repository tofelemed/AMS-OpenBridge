using System.Reflection;
using System.Text.Json;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

/// <summary>
/// v2.5 Task 3C.1: the FACTORY layer (catalogue starting values + the response job's defaults) and
/// the PROFILE layer per class pack, as the jar exported them (contracts/gate-config/v1/factory-layer.json,
/// embedded). A fresh draft's layers start from these so its first resolution restates exactly what
/// the engine runs today - the same values, now visible and governable.
/// </summary>
public static class FactoryLayers
{
    private static readonly Lazy<JsonElement?> Loaded = new(() =>
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Traverse.CplmApi.Config.factory-layer.json");
        if (stream is null) return null;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.Clone();
    });

    public static bool Available => Loaded.Value is not null;

    public static JsonElement Factory()
    {
        if (Loaded.Value is { } root && root.TryGetProperty("factory", out var f)) return f;
        // no exported layer in this build: the catalogue's own starting values
        var defaults = PropertyCatalogue.Current.Properties.Where(p => p.Default is not null).ToDictionary(p => p.Property, p => p.Default!);
        return JsonDocument.Parse(JsonSerializer.Serialize(defaults)).RootElement.Clone();
    }

    public static JsonElement? Profile(string profileId)
    {
        if (Loaded.Value is { } root && root.TryGetProperty("profiles", out var ps) && ps.TryGetProperty(profileId, out var p)) return p;
        return null;
    }

    public static IReadOnlyList<string> ProfileIds()
    {
        if (Loaded.Value is { } root && root.TryGetProperty("profiles", out var ps)) return ps.EnumerateObject().Select(p => p.Name).ToList();
        return Array.Empty<string>();
    }

    /// <summary>The initial layer stack of a fresh draft for the scope: FACTORY, then (for PROFILE / LOOP / REGIME scopes) the PROFILE pack, then an empty layer of the scope's own kind.</summary>
    public static JsonElement InitialLayers(string site, string scopeKind, string scopeRef, string? profileId)
    {
        var layers = new List<object>();
        var factory = Factory();
        layers.Add(new { kind = "FACTORY", @ref = (string?)null, ordinal = 0, content = factory, content_hash = CanonicalJson.Sha256(factory) });
        var empty = JsonDocument.Parse("{}").RootElement;
        if (scopeKind == "SITE")
        {
            layers.Add(new { kind = "SITE", @ref = (string?)site, ordinal = 1, content = empty, content_hash = CanonicalJson.Sha256(empty) });
        }
        else
        {
            layers.Add(new { kind = "SITE", @ref = (string?)site, ordinal = 1, content = empty, content_hash = CanonicalJson.Sha256(empty) });
            var pid = scopeKind == "PROFILE" ? scopeRef : profileId;
            var profile = pid is null ? null : Profile(pid);
            if (scopeKind == "PROFILE")
            {
                var content = profile ?? empty;
                layers.Add(new { kind = "PROFILE", @ref = (string?)pid, ordinal = 2, content, content_hash = CanonicalJson.Sha256(content) });
            }
            else
            {
                if (pid is not null)
                {
                    var content = profile ?? empty;
                    layers.Add(new { kind = "PROFILE", @ref = (string?)pid, ordinal = 2, content, content_hash = CanonicalJson.Sha256(content) });
                }
                if (scopeKind == "REGIME")
                {
                    layers.Add(new { kind = "LOOP", @ref = (string?)scopeRef.Split('@')[0], ordinal = 3, content = empty, content_hash = CanonicalJson.Sha256(empty) });
                    layers.Add(new { kind = "REGIME", @ref = (string?)scopeRef, ordinal = 4, content = empty, content_hash = CanonicalJson.Sha256(empty) });
                }
                else
                {
                    layers.Add(new { kind = "LOOP", @ref = (string?)scopeRef, ordinal = 3, content = empty, content_hash = CanonicalJson.Sha256(empty) });
                }
            }
        }
        return JsonDocument.Parse(JsonSerializer.Serialize(layers)).RootElement.Clone();
    }
}
