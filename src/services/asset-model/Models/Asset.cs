namespace Traverse.AssetModel.Models;

/// <summary>
/// Represents an asset in the Unified Namespace hierarchy.
/// The contextual path is the canonical source of truth; all other paths are derived.
/// Pattern: site/area/unit/device.measurement (area optional, measurement optional for devices)
/// </summary>
public class Asset
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// The canonical contextual path following ISA-95 hierarchy.
    /// Format: site/area/unit/device[.measurement]
    /// Example: houston/refinery/crude1/pump101.discharge_press
    /// </summary>
    public required string ContextualPath { get; set; }
    
    /// <summary>
    /// Human-readable display name for UI.
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Asset type: Site, Area, Unit, Device, or Measurement.
    /// </summary>
    public required AssetType Type { get; set; }
    
    /// <summary>
    /// Optional description for documentation.
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// Engineering unit for measurements (e.g., PSI, degC, m3/hr).
    /// </summary>
    public string? EngineeringUnit { get; set; }
    
    /// <summary>
    /// Low engineering limit for HMI scaling.
    /// </summary>
    public double? LoEngLimit { get; set; }
    
    /// <summary>
    /// High engineering limit for HMI scaling.
    /// </summary>
    public double? HiEngLimit { get; set; }

    /// <summary>
    /// Asset type/template name (e.g. "Tank", "Pump", "CrudeUnit"). Enables "assets of the same
    /// type" queries for collections / asset context switching (Phase 4). Distinct from the 1–5
    /// hierarchy level in <see cref="Type"/>.
    /// </summary>
    public string? Template { get; set; }

    /// <summary>
    /// Reference to parent asset ID (null for root sites).
    /// </summary>
    public Guid? ParentId { get; set; }
    
    /// <summary>
    /// Soft-delete flag.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    // ───────────────────────────────────────────────────────────────────────────
    // Transport overrides — stored, nullable, null = derive from ContextualPath
    //
    // Why these exist: the derived transports below assume the data for an asset
    // lives where its PATH TEXT says (IoTDB root.<path>, sparkplug <unit>_<device>).
    // That holds for plant signals fed through the UNS pipeline, but not for
    // signals whose pipeline keys storage by something else — CPLM loop signals
    // land in IoTDB at root.<site>.cpm.<loopId>.<role> (keyed by LOOP id, from
    // RawLoopIotDbConsumer) and publish live under the ams_site1/ams_edge1 edge
    // with device = sanitized loopId (LoopLiveRbeJob → sparkplug-edge-node).
    // Without an override, registering such a signal as an asset yields a binding
    // with asset-model provenance that points at a location nothing writes —
    // "resolved" and empty. The overrides let the asset state where its data
    // actually is; consumers (binding-resolver, Trend, displays) are unchanged
    // because the computed properties below fall back through them.
    // ───────────────────────────────────────────────────────────────────────────

    public string? IoTDbPathOverride { get; set; }
    public string? SparkplugGroupOverride { get; set; }
    public string? SparkplugEdgeNodeOverride { get; set; }
    public string? SparkplugDeviceOverride { get; set; }
    public string? SparkplugMetricOverride { get; set; }

    // ───────────────────────────────────────────────────────────────────────────
    // Derived paths — override wins, else computed from ContextualPath
    // ───────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// IoTDB time-series path. Override, else root.{contextual_path with / → .}
    /// Example: root.houston.refinery.crude1.pump101.discharge_press
    /// </summary>
    public string IoTDbPath =>
        IoTDbPathOverride ?? $"root.{ContextualPath.Replace('/', '.').Replace(' ', '_')}";

    /// <summary>
    /// Sparkplug B group identifier. Override, else derived from site level.
    /// Example: houston
    /// </summary>
    public string SparkplugGroup => SparkplugGroupOverride ?? ContextualPath.Split('/')[0];

    /// <summary>
    /// Sparkplug B edge node. Override, else site + edge convention.
    /// For compatibility with existing AMS: {site}_edge1
    /// </summary>
    public string SparkplugEdgeNode =>
        SparkplugEdgeNodeOverride ?? $"{ContextualPath.Split('/')[0]}_edge1";

    /// <summary>
    /// Sparkplug B device ID. Override, else derived from unit/device portion.
    /// Example: crude1_pump101
    /// </summary>
    public string SparkplugDevice
    {
        get
        {
            if (SparkplugDeviceOverride is not null) return SparkplugDeviceOverride;
            var parts = ContextualPath.Split('/');
            return parts.Length >= 4
                ? $"{parts[^2]}_{parts[^1].Split('.')[0]}"
                : parts[^1].Split('.')[0];
        }
    }

    /// <summary>
    /// Sparkplug metric name. Override, else the measurement portion after the device.
    /// Example: discharge_press
    /// </summary>
    public string? SparkplugMetric
    {
        get
        {
            if (SparkplugMetricOverride is not null) return SparkplugMetricOverride;
            var lastPart = ContextualPath.Split('/')[^1];
            var dotIndex = lastPart.IndexOf('.');
            return dotIndex >= 0 ? lastPart[(dotIndex + 1)..] : null;
        }
    }
    
    /// <summary>
    /// Full Sparkplug B topic for DDATA messages.
    /// Example: spBv1.0/houston/DDATA/houston_edge1/crude1_pump101
    /// </summary>
    public string SparkplugTopic => $"spBv1.0/{SparkplugGroup}/DDATA/{SparkplugEdgeNode}/{SparkplugDevice}";
    
    /// <summary>
    /// Alarm source identifier for alarm pipeline.
    /// Format: {site}:{unit}:{device}
    /// Example: houston:crude1:pump101
    /// </summary>
    public string AlarmSource
    {
        get
        {
            var parts = ContextualPath.Split('/');
            var site = parts[0];
            var unit = parts.Length >= 3 ? parts[^2] : "default";
            var device = parts[^1].Split('.')[0];
            return $"{site}:{unit}:{device}";
        }
    }
    
    /// <summary>
    /// Redis snapshot key for real-time values.
    /// Example: snapshot:metric:houston:houston_edge1:crude1_pump101:discharge_press
    /// </summary>
    public string? RedisSnapshotKey
    {
        get
        {
            var metric = SparkplugMetric;
            return metric != null 
                ? $"snapshot:metric:{SparkplugGroup}:{SparkplugEdgeNode}:{SparkplugDevice}:{metric}"
                : null;
        }
    }
}

public enum AssetType
{
    Site = 1,
    Area = 2,
    Unit = 3,
    Device = 4,
    Measurement = 5
}
