// 2026-09-18 Gate Configuration redesign: "what does each loop run under?" for a whole scope in one
// read. The rule is /effective's (the ACTIVE bundle of the most specific scope: LOOP > PROFILE > SITE,
// else the factory layer), applied in memory over the site's active rows - one registry read plus one
// active-rows read per site instead of one /effective call per loop.
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Services.Config;

public sealed record EffectiveSummaryRow(string LoopId, string DisplayName, string Site, string? Area, string? Unit, string LoopType, string ProfileId,
    string State, string? ScopeKind, string? ScopeRef, Guid? BundleId, string? ContentHash, DateTimeOffset? Since);

public static class EffectiveSummary
{
    public const string NoActiveBundle = "NO_ACTIVE_BUNDLE";

    /// <summary>One row per loop; the state is filled in from the bundle rows by the caller (a bundle's state is not on the active row).</summary>
    public static IReadOnlyList<EffectiveSummaryRow> Resolve(IEnumerable<CpmLoopDto> loops, IReadOnlyDictionary<string, IReadOnlyList<ConfigStore.ActiveRow>> activeBySite)
    {
        var rows = new List<EffectiveSummaryRow>();
        foreach (var loop in loops)
        {
            var profileId = ConfigStore.ProfileIdFor(loop.LoopType);
            var active = activeBySite.TryGetValue(loop.Site, out var a) ? a : Array.Empty<ConfigStore.ActiveRow>();
            ConfigStore.ActiveRow? hit = null;
            foreach (var (kind, reference) in new[] { ("LOOP", loop.LoopId), ("PROFILE", profileId), ("SITE", "") })
            {
                hit = active.FirstOrDefault(r => r.ScopeKind == kind && string.Equals(r.ScopeRef, reference, StringComparison.OrdinalIgnoreCase));
                if (hit is not null) break;
            }
            rows.Add(new EffectiveSummaryRow(loop.LoopId, loop.DisplayName, loop.Site, loop.Area, loop.Unit, loop.LoopType, profileId,
                hit is null ? NoActiveBundle : "ACTIVE", hit?.ScopeKind, hit?.ScopeRef, hit?.BundleId, hit?.ContentHash, hit?.Since));
        }
        return rows;
    }
}
