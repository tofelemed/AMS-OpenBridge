using System.Text.Json;

namespace Traverse.DisplayService.Models;

/// <summary>
/// Represents an HMI display definition.
/// Displays are controlled artifacts (versioned, reviewed) and do NOT store process values.
/// </summary>
public class Display
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// Human-readable display name.
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Display category: overview, detail, faceplate, trend, alarm.
    /// </summary>
    public required string Category { get; set; }
    
    /// <summary>
    /// Optional description for documentation.
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// ISA-101 hierarchy path for navigation organization.
    /// </summary>
    public string? HierarchyPath { get; set; }
    
    /// <summary>
    /// Canvas width in pixels.
    /// </summary>
    public int Width { get; set; } = 1920;
    
    /// <summary>
    /// Canvas height in pixels.
    /// </summary>
    public int Height { get; set; } = 1080;
    
    /// <summary>
    /// Canvas background — a theme token by default so the display follows day/night.
    /// </summary>
    public string BackgroundColor { get; set; } = "var(--ams-canvas-bg)";

    /// <summary>
    /// Current published version number (null if never published).
    /// </summary>
    public int? PublishedVersion { get; set; }

    /// <summary>
    /// When the current published version actually went live.
    /// NOT the same as the version's CreatedAt: publish flips an EXISTING draft row's status, so
    /// CreatedAt is the SAVE time. A draft saved Monday and published Friday would report Monday.
    /// </summary>
    public DateTimeOffset? PublishedAt { get; set; }

    /// <summary>Who published the current version.</summary>
    public string? PublishedBy { get; set; }

    /// <summary>
    /// Design-mode SVG preview, regenerated on publish. NEVER contains process values — a thumbnail is
    /// rendered from the design-mode view precisely so a screenshot of the display list can't leak
    /// plant data.
    /// </summary>
    public string? ThumbnailSvg { get; set; }
    public DateTimeOffset? ThumbnailAt { get; set; }

    /// <summary>
    /// ISA-101 display hierarchy (Clause 6.3): 1=overview, 2=unit control, 3=unit detail,
    /// 4=support/diagnostic. `Category` was doing double duty for this.
    /// </summary>
    public short? Level { get; set; }

    /// <summary>
    /// Latest draft version number.
    /// </summary>
    public int DraftVersion { get; set; } = 1;
    
    /// <summary>
    /// Owner user ID.
    /// </summary>
    public required string OwnerId { get; set; }
    
    /// <summary>
    /// Soft-delete flag.
    /// </summary>
    public bool IsDeleted { get; set; }
    
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    
    public ICollection<DisplayVersion> Versions { get; set; } = new List<DisplayVersion>();
}

/// <summary>
/// Represents a versioned snapshot of a display.
/// Contains the full canvas definition (items, bindings, layout).
/// </summary>
public class DisplayVersion
{
    public Guid Id { get; set; }
    
    public Guid DisplayId { get; set; }
    public Display Display { get; set; } = null!;
    
    /// <summary>
    /// Version number (1, 2, 3...).
    /// </summary>
    public int Version { get; set; }
    
    /// <summary>
    /// JSON snapshot of the display definition.
    /// Contains items, bindings, layout - but NO process values.
    /// </summary>
    public required JsonDocument Snapshot { get; set; }
    
    /// <summary>
    /// Version status: draft, published, archived.
    /// </summary>
    public required string Status { get; set; }
    
    /// <summary>
    /// Optional change description for audit trail.
    /// </summary>
    public string? ChangeNote { get; set; }
    
    /// <summary>
    /// User who created this version.
    /// </summary>
    public required string CreatedBy { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When this version was published (null if it never was). See Display.PublishedAt.</summary>
    public DateTimeOffset? PublishedAt { get; set; }

    /// <summary>Who published this version.</summary>
    public string? PublishedBy { get; set; }
}

/// <summary>
/// Represents a canvas item (symbol) within a display.
/// This is the structure stored in DisplayVersion.Snapshot.items[].
/// </summary>
public class CanvasItem
{
    public required string Id { get; set; }
    
    /// <summary>
    /// Symbol type identifier (e.g., "ind.numeric", "equip.pump", "chart.trend").
    /// </summary>
    public required string Type { get; set; }
    
    /// <summary>
    /// Position on canvas in pixels.
    /// </summary>
    public required Position Position { get; set; }
    
    /// <summary>
    /// Size in pixels.
    /// </summary>
    public required Size Size { get; set; }
    
    /// <summary>
    /// Data bindings - maps property names to UNS contextual paths.
    /// Example: { "value": "houston/crude1/pump101.discharge_press" }
    /// </summary>
    public Dictionary<string, string>? Bindings { get; set; }
    
    /// <summary>
    /// Display label (static text, not a process value).
    /// </summary>
    public string? Label { get; set; }
    
    /// <summary>
    /// Formatting options (decimals, unit display, etc.).
    /// </summary>
    public Formatting? Formatting { get; set; }
    
    /// <summary>
    /// Visual style options (colors, borders, etc.).
    /// </summary>
    public Dictionary<string, object>? Style { get; set; }
    
    /// <summary>
    /// Rotation angle in degrees.
    /// </summary>
    public double Rotation { get; set; }
    
    /// <summary>
    /// Z-index for layering.
    /// </summary>
    public int ZIndex { get; set; }
    
    /// <summary>
    /// Whether the item is locked (cannot be moved in designer).
    /// </summary>
    public bool Locked { get; set; }
    
    /// <summary>
    /// Group ID if this item is part of a group.
    /// </summary>
    public string? GroupId { get; set; }
}

public class Position
{
    public double X { get; set; }
    public double Y { get; set; }
}

public class Size
{
    public double Width { get; set; }
    public double Height { get; set; }
}

public class Formatting
{
    public int Decimals { get; set; } = 1;
    public string? Unit { get; set; }
    public bool ShowTrend { get; set; }
}
