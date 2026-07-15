using System.Text.Json;

namespace Traverse.DisplayService.Models;

// ── Phase 5 (V2) — display management & governance entities ────────────────────
// Folders, ACLs, personal views, favorites, recent-access and version comments.

/// <summary>A node in the display folder tree. Null <see cref="ParentId"/> = a root folder.</summary>
public class Folder
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public Guid? ParentId { get; set; }
    public string OwnerId { get; set; } = "system";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>
/// A grant of read/edit access on a display OR a folder to a user or a role. Folder grants inherit
/// to every display in (and below) the folder. Ownership and the Admin role bypass ACLs entirely.
/// </summary>
public class DisplayAcl
{
    public Guid Id { get; set; }
    public Guid? DisplayId { get; set; }
    public Guid? FolderId { get; set; }
    /// <summary>"user" or "role".</summary>
    public required string PrincipalType { get; set; }
    /// <summary>A username (when PrincipalType="user") or a role name like "Operator".</summary>
    public required string Principal { get; set; }
    /// <summary>"read" or "edit".</summary>
    public required string Access { get; set; }
    public string CreatedBy { get; set; } = "system";
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// An operator-owned, non-versioned view. Same snapshot schema as a controlled display, but private
/// to a user (or explicitly shared). The config-only trigger applies here too.
/// </summary>
public class PersonalView
{
    public Guid Id { get; set; }
    public required string UserId { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public int Width { get; set; } = 1920;
    public int Height { get; set; } = 1080;
    public string BackgroundColor { get; set; } = "var(--ams-canvas-bg)";
    public required JsonDocument Config { get; set; }
    public Guid? SourceDisplayId { get; set; }
    public bool IsShared { get; set; }
    public string[] SharedWith { get; set; } = Array.Empty<string>();
    public bool IsDeleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>A per-user favourite pointing at either a controlled display or a personal view.</summary>
public class ViewFavorite
{
    public Guid Id { get; set; }
    public required string UserId { get; set; }
    public Guid? DisplayId { get; set; }
    public Guid? PersonalViewId { get; set; }
    public int DisplayOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>Server-side "recently opened" — one row per (user, display), last-access wins.</summary>
public class RecentDisplay
{
    public required string UserId { get; set; }
    public Guid DisplayId { get; set; }
    public DateTimeOffset AccessedAt { get; set; }
}

/// <summary>A review comment on a display, optionally scoped to a specific version.</summary>
public class DisplayComment
{
    public Guid Id { get; set; }
    public Guid DisplayId { get; set; }
    public int? Version { get; set; }
    public string Author { get; set; } = "system";
    public required string Body { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
