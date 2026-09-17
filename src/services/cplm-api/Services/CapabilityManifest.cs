namespace Traverse.CplmApi.Services;

/// <summary>One engine identity observed in stored results (newest first).</summary>
public sealed record EngineVersionRow(
    string? CalculationVersion, string? DynamicsProfileVersion,
    string? SourceCommit, string? JarSha256, string? ContractVersion, DateTime? LastSeen);   // UTC; Npgsql timestamptz → DateTime, which Dapper needs for the ctor match

/// <summary>Identity of this cplm-api build.</summary>
public sealed record ServiceIdentity(string Version, string SourceCommit);

/// <summary>One CAPABILITY record a running CPLM job announced (cpm.config_worker_capability; newest per job). Payload = the record verbatim.</summary>
public sealed record WorkerCapabilityRow(string JobName, string JarSha256, string? SourceCommit, string CatalogueHash, string Payload, DateTime? ReceivedAt);

/// <summary>
/// GET /api/v1/cpm/capabilities — what THIS deployment can do and which builds are
/// producing results (spec v6 §5.3 capability manifest; R26/C07 build identity).
///
/// Pure: the controller supplies the observed engine rows and the service identity; the
/// static catalogues supply the rest. Nothing here is inferred from a version label —
/// two jars with identical "3.0.0"/"2.0.0" strings appear as two <see cref="Engine"/>
/// entries when their commits or jar hashes differ.
/// </summary>
public sealed class CapabilityManifest
{
    public sealed record EngineSection(IReadOnlyList<EngineVersionRow> Observed);

    public ServiceIdentity Service { get; }
    public EngineSection Engine { get; }
    public IReadOnlyList<GateCatalog.GateMethod> Methods { get; }
    public IReadOnlyDictionary<string, string> Topics { get; }
    public IReadOnlyDictionary<string, string> Schemas { get; }
    public object Windows { get; }
    /// <summary>v2.5 3A.2: the configuration capability of the running fleet.</summary>
    public ConfigCapability Config { get; }

    private CapabilityManifest(ServiceIdentity service, EngineSection engine, IReadOnlyList<GateCatalog.GateMethod> methods,
        IReadOnlyDictionary<string, string> topics, IReadOnlyDictionary<string, string> schemas, object windows, ConfigCapability config)
    {
        Service = service; Engine = engine; Methods = methods; Topics = topics; Schemas = schemas; Windows = windows; Config = config;
    }

    public static CapabilityManifest Build(IEnumerable<EngineVersionRow> observedEngines, ServiceIdentity service)
        => Build(observedEngines, service, Array.Empty<WorkerCapabilityRow>());

    public static CapabilityManifest Build(IEnumerable<EngineVersionRow> observedEngines, ServiceIdentity service, IEnumerable<WorkerCapabilityRow> workers)
    {
        var observed = observedEngines
            .OrderByDescending(e => e.LastSeen ?? DateTime.MinValue)
            .ToList();

        var topics = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["samples"]           = "traverse.cpa.loop.samples.v1",
            ["shortFeatures"]     = "traverse.cpa.clpm.feature.short.v1",
            ["longFeatures"]      = "traverse.cpa.clpm.feature.long.v1",
            ["gateResults"]       = "traverse.cpa.clpm.gate.results.v1",
            ["gateEvidence"]      = "traverse.cpa.clpm.gate.evidence.v1",
            ["responseResults"]   = "traverse.cpa.clpm.response.results.v1",
            ["conditions"]        = "traverse.cpa.clpm.condition.v1",
            ["instrumentHealth"]  = "traverse.cpa.instrument.health.v1",
            ["instrumentContext"] = "traverse.cpa.context.instrument-health.v1",
            ["gateConfig"]        = "traverse.cpa.context.gate-config.v1",
            ["gateConfigAcks"]    = "traverse.cpa.context.gate-config.acks.v1",
            ["liveMetrics"]       = "traverse.cpa.live.loop.metrics",
            ["metadata"]          = "traverse.cpa.ams.metadata.updates",
            ["parameterSet"]      = "traverse.cpa.context.parameter-set.v1",
        };
        var schemas = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["tuple"]      = "1.1",     // 1A.1: additive roles{} on the samples message
            ["gateResult"] = "v1",
        };

        return new CapabilityManifest(service, new EngineSection(observed), GateCatalog.InstalledMethods,
            topics, schemas, WindowCatalog.ResolutionsPayload(), ConfigCapability.From(workers));
    }
}
