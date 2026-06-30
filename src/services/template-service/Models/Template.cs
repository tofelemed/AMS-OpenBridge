using System.Text.Json;

namespace Traverse.TemplateService.Models;

/// <summary>
/// Represents a reusable element template.
/// Templates define parameterized symbols that can be instantiated with path substitution.
/// </summary>
public class ElementTemplate
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// Template name (e.g., "Centrifugal Pump", "Control Valve").
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Template category for organization (e.g., "Rotating Equipment", "Valves", "Vessels").
    /// </summary>
    public required string Category { get; set; }
    
    /// <summary>
    /// Optional description.
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// Template icon or thumbnail (base64 SVG or URL).
    /// </summary>
    public string? Icon { get; set; }
    
    /// <summary>
    /// Current published version number.
    /// </summary>
    public int? PublishedVersion { get; set; }
    
    /// <summary>
    /// Latest draft version number.
    /// </summary>
    public int DraftVersion { get; set; } = 1;
    
    /// <summary>
    /// Owner user ID.
    /// </summary>
    public required string OwnerId { get; set; }
    
    /// <summary>
    /// Whether this is a system template (read-only for users).
    /// </summary>
    public bool IsSystem { get; set; }
    
    public bool IsDeleted { get; set; }
    
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    
    public ICollection<TemplateVersion> Versions { get; set; } = new List<TemplateVersion>();
    public ICollection<TemplateParameter> Parameters { get; set; } = new List<TemplateParameter>();
}

/// <summary>
/// Versioned snapshot of a template definition.
/// </summary>
public class TemplateVersion
{
    public Guid Id { get; set; }
    
    public Guid TemplateId { get; set; }
    public ElementTemplate Template { get; set; } = null!;
    
    public int Version { get; set; }
    
    /// <summary>
    /// JSON definition of the template's canvas items.
    /// Bindings use parameter placeholders like {{basePath}}.discharge_press
    /// </summary>
    public required JsonDocument Definition { get; set; }
    
    /// <summary>
    /// Default size when instantiated.
    /// </summary>
    public int DefaultWidth { get; set; } = 200;
    public int DefaultHeight { get; set; } = 200;
    
    public required string Status { get; set; }
    public string? ChangeNote { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// Defines a parameter that can be substituted during template instantiation.
/// </summary>
public class TemplateParameter
{
    public Guid Id { get; set; }
    
    public Guid TemplateId { get; set; }
    public ElementTemplate Template { get; set; } = null!;
    
    /// <summary>
    /// Parameter name (used as placeholder in bindings).
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Human-readable label for the parameter.
    /// </summary>
    public required string Label { get; set; }
    
    /// <summary>
    /// Parameter type: path, string, number, boolean.
    /// </summary>
    public required string Type { get; set; }
    
    /// <summary>
    /// Default value if not provided during instantiation.
    /// </summary>
    public string? DefaultValue { get; set; }
    
    /// <summary>
    /// Whether this parameter is required.
    /// </summary>
    public bool Required { get; set; } = true;
    
    /// <summary>
    /// Description/help text for the parameter.
    /// </summary>
    public string? Description { get; set; }
}

/// <summary>
/// Represents a template instantiation in a display.
/// Stores the resolved parameter values for an instance.
/// </summary>
public class TemplateInstance
{
    /// <summary>
    /// Instance ID (matches canvas item ID).
    /// </summary>
    public required string Id { get; set; }
    
    /// <summary>
    /// Source template ID.
    /// </summary>
    public Guid TemplateId { get; set; }
    
    /// <summary>
    /// Template version used.
    /// </summary>
    public int TemplateVersion { get; set; }
    
    /// <summary>
    /// Resolved parameter values.
    /// Key = parameter name, Value = resolved value
    /// </summary>
    public Dictionary<string, string> Parameters { get; set; } = new();
}
