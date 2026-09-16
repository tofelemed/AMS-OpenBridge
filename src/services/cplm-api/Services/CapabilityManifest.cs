namespace Traverse.CplmApi.Services;

/// <summary>One engine identity observed in stored results (newest first).</summary>
public sealed record EngineVersionRow(
    string? CalculationVersion, string? DynamicsProfileVersion,
    string? SourceCommit, string? JarSha256, string? ContractVersion, DateTime? LastSeen);   // UTC; Npgsql timestamptz → DateTime, which Dapper needs for the ctor match

/// <summary>Identity of this cplm-api build.</summary>
public sealed record ServiceIdentity(string Version, string SourceCommit);

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

    private CapabilityManifest(ServiceIdentity service, EngineSection engine, IReadOnlyList<GateCatalog.GateMethod> methods,
        IReadOnlyDictionary<string, string> topics, IReadOnlyDictionary<string, string> schemas, object windows)
    {
        Service = service; Engine = engine; Methods = methods; Topics = topics; Schemas = schemas; Windows = windows;
    }

    public static CapabilityManifest Build(IEnumerable<EngineVersionRow> observedEngines, ServiceIdentity service)
    {
        var observed = observedEngines
            .OrderByDescending(e => e.LastSeen ?? DateTime.MinValue)
            .ToList();

        var topics = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["samples"]       = "traverse.cpa.loop.samples.v1",
            ["shortFeatures"] = "traverse.cpa.clpm.feature.short.v1",
            ["longFeatures"]  = "traverse.cpa.clpm.feature.long.v1",
            ["gateResults"]   = "traverse.cpa.clpm.gate.results.v1",
            ["liveMetrics"]   = "traverse.cpa.live.loop.metrics",
            ["metadata"]      = "traverse.cpa.ams.metadata.updates",
            ["parameterSet"]  = "traverse.cpa.context.parameter-set.v1",
        };
        var schemas = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            // Samples tuple is schema 1.0 today; Task 1A.1 raises it to 1.1 (additive roles{}).
            ["tuple"]      = "1.0",
            ["gateResult"] = "v1",
        };

        return new CapabilityManifest(service, new EngineSection(observed), GateCatalog.InstalledMethods,
            topics, schemas, WindowCatalog.ResolutionsPayload());
    }
}
