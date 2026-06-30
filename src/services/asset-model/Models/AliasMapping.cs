namespace Traverse.AssetModel.Models;

/// <summary>
/// Maps legacy paths (from reference app or existing AMS) to canonical UNS paths.
/// Enables backward compatibility during migration.
/// </summary>
public class AliasMapping
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// The legacy path to be mapped (e.g., AF path, OPC tag path).
    /// </summary>
    public required string LegacyPath { get; set; }
    
    /// <summary>
    /// The canonical UNS contextual path this maps to.
    /// </summary>
    public required string CanonicalPath { get; set; }
    
    /// <summary>
    /// Source system identifier (e.g., "PI-AF", "OPC-DA", "reference-app").
    /// </summary>
    public required string SourceSystem { get; set; }
    
    /// <summary>
    /// Whether this mapping is active.
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    public DateTimeOffset CreatedAt { get; set; }
}
