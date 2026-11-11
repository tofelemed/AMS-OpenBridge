using Traverse.AssetModel.Models;

namespace Traverse.AssetModel.Services;

/// <summary>
/// The filter of the admin listing GET /aliases (G-08), shared by the endpoint and its tests.
/// </summary>
public static class AliasQuery
{
    public static IQueryable<AliasMapping> Filter(IQueryable<AliasMapping> q, string? search, string? source, bool includeInactive)
    {
        if (!includeInactive) q = q.Where(a => a.IsActive);
        if (!string.IsNullOrWhiteSpace(source)) q = q.Where(a => a.SourceSystem == source);
        if (!string.IsNullOrWhiteSpace(search))
        {
            // CHG-172: the search ignores case ("fcs0102" finds FCS0102.PIC30102.PV). Postgres compares
            // lower(column) with the lower-cased text; a substring match never used an index, so none is needed.
            var term = search.ToLowerInvariant();
            q = q.Where(a => a.LegacyPath.ToLower().Contains(term) || a.CanonicalPath.ToLower().Contains(term));
        }
        return q;
    }
}
