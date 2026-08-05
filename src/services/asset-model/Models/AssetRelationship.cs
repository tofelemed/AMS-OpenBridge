namespace Traverse.AssetModel.Models;

/// <summary>
/// A non-hierarchical edge between two assets. The asset table's parent_id covers
/// containment (site → area → unit → device); this covers everything else:
/// which loops sit beside each other, which feeds which.
///
/// CPLM's G13 (disturbance context) reads PEER/UPSTREAM_OF edges: without them
/// the disturbance soft-block never fires and an oscillating loop that is being
/// disturbed from upstream is diagnosed as stiction. Displays and alarm
/// correlation want the same edges, which is why this lives in the shared asset
/// model rather than in the cpm schema.
/// </summary>
public class AssetRelationship
{
    public Guid Id { get; set; }

    /// <summary>Source asset. For UPSTREAM_OF, this is the upstream one.</summary>
    public required Guid FromAssetId { get; set; }

    /// <summary>Target asset. For UPSTREAM_OF, this is the downstream one.</summary>
    public required Guid ToAssetId { get; set; }

    /// <summary>
    /// One of: PEER, UPSTREAM_OF, DOWNSTREAM_OF, CASCADE_PRIMARY, CASCADE_SECONDARY.
    /// Enforced by a CHECK constraint in SQL and by <see cref="AssetRelationshipTypes"/>
    /// at the API boundary.
    /// </summary>
    public required string RelType { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>User or service that created the edge (audit trail for governance).</summary>
    public string? CreatedBy { get; set; }
}

/// <summary>Valid <see cref="AssetRelationship.RelType"/> values.</summary>
public static class AssetRelationshipTypes
{
    public const string Peer = "PEER";
    public const string UpstreamOf = "UPSTREAM_OF";
    public const string DownstreamOf = "DOWNSTREAM_OF";
    public const string CascadePrimary = "CASCADE_PRIMARY";
    public const string CascadeSecondary = "CASCADE_SECONDARY";

    public static readonly string[] All =
        { Peer, UpstreamOf, DownstreamOf, CascadePrimary, CascadeSecondary };

    public static bool IsValid(string? relType) =>
        relType is not null && Array.Exists(All, t => t == relType.ToUpperInvariant());

    /// <summary>
    /// PEER is conceptually symmetric but stored as one directed row, so a peer
    /// query must look in both directions. UPSTREAM_OF/DOWNSTREAM_OF are inverses.
    /// </summary>
    public static string? Inverse(string relType) => relType.ToUpperInvariant() switch
    {
        Peer => Peer,
        UpstreamOf => DownstreamOf,
        DownstreamOf => UpstreamOf,
        CascadePrimary => CascadeSecondary,
        CascadeSecondary => CascadePrimary,
        _ => null
    };
}
