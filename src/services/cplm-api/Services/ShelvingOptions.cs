namespace Traverse.CplmApi.Services;

/// <summary>CHG-032 — "Cplm:Shelving" section. Defaults are the plant's; the lab overrides nothing.</summary>
public sealed class ShelvingOptions
{
    public const string SectionName = "Cplm:Shelving";
    /// <summary>Longest shelf an operator may set (ISA-18.2 §12: a site-defined maximum). Hours.</summary>
    public int MaxHours { get; set; } = EventShelvingRules.DefaultMaxHours;
    /// <summary>How often expired shelves are flipped to EXPIRED and recorded. Seconds.</summary>
    public int SweepSeconds { get; set; } = 60;
    public bool SweepEnabled { get; set; } = true;
}
