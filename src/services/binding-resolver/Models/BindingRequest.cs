namespace Traverse.BindingResolver.Models;

/// <summary>
/// Request to resolve a logical path to transport bindings.
/// </summary>
public record BindingRequest
{
    /// <summary>
    /// The contextual path to resolve (e.g., houston/crude1/pump101.discharge_press)
    /// </summary>
    public required string Path { get; init; }
    
    /// <summary>
    /// The data role(s) to resolve: live, history, alarm, or all
    /// </summary>
    public string[] Roles { get; init; } = ["all"];
}

/// <summary>
/// Batch binding request for multiple paths.
/// </summary>
public record BatchBindingRequest
{
    public required BindingRequest[] Bindings { get; init; }
}
