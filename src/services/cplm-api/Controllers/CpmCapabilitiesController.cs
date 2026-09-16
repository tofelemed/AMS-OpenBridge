using System.Reflection;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

/// <summary>
/// v2.5 Task 0.4 — GET /api/v1/cpm/capabilities (spec v6 §6.5 row 1). The build's own
/// truth: service identity, every engine identity observed in stored results, the
/// installed method per gate, wire contracts, topics and the window contract.
/// </summary>
[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmCapabilitiesController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;

    public CpmCapabilitiesController([FromKeyedServices("cplm")] NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    [HttpGet("capabilities")]
    public async Task<IActionResult> GetCapabilities(CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<EngineVersionRow>(Data.GateReadSql.ObservedEngines);
        return Ok(CapabilityManifest.Build(rows, ServiceIdentityProvider.Current));
    }

    /// <summary>
    /// v2.5 Task 2D.1 (spec §3.1, R13): the 17 gates as this build knows them - definition, role, installed
    /// method and version, the artifact kinds the engine emits, property ids (Phase 3), capability state.
    /// The workbench reads roles and definitions from here, never from a client-side table.
    /// </summary>
    [HttpGet("gate-catalogue")]
    public IActionResult GetGateCatalogue() => GateCatalogue();

    public static IActionResult GateCatalogue()
    {
        var gates = GateCatalog.Catalogue().Select(e => new
        {
            gate = e.Gate,
            name = e.Name,
            tier = e.Tier,
            role = e.Role,
            definition = e.Definition,
            preconditions = e.Preconditions,
            method = new { id = e.Method.MethodId, version = e.Method.Version, state = e.Method.State },
            artifactKinds = e.ArtifactKinds,
            propertyIds = e.PropertyIds,
            capabilityState = e.CapabilityState,
            capabilityReason = e.CapabilityReason,
        }).ToList();
        return new OkObjectResult(new { count = gates.Count, gates, service = ServiceIdentityProvider.Current });
    }
}

/// <summary>
/// cplm-api's own identity. The version is the assembly's informational version; the
/// commit comes from SOURCE_COMMIT (set at image build) and is reported as "unknown"
/// otherwise — never fabricated.
/// </summary>
public static class ServiceIdentityProvider
{
    public static readonly ServiceIdentity Current = new(
        typeof(ServiceIdentityProvider).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? typeof(ServiceIdentityProvider).Assembly.GetName().Version?.ToString() ?? "unknown",
        Environment.GetEnvironmentVariable("SOURCE_COMMIT") is { Length: > 0 } c ? c : "unknown");
}
