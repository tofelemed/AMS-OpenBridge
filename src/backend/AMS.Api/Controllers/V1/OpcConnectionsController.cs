using System.Net.Sockets;
using AMS.Domain.Connectivity;
using AMS.Infrastructure.Repositories;
using AMS.Infrastructure.Security;
using Asp.Versioning;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// OPC/DCS connection lifecycle. This controller had NO [Authorize] and there is
/// no fallback policy, so create/update/delete/connect/disconnect of DCS
/// connections were reachable unauthenticated. Reads need analytics.view;
/// mutations need system.manage.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/opc/connections")]
[Produces("application/json")]
[Authorize(Policy = "analytics.view")]
public sealed class OpcConnectionsController : ControllerBase
{
    private static readonly Guid DefaultHttpFeedId = Guid.Parse("f0af9a6d-85f6-4c9f-a8ad-6de277d1d110");
    private const string DefaultHttpFeedName = "Current Alarms Feed";
    private const string DefaultHttpFeedEndpoint = "http://192.168.1.51:8010/api/current-alarms";

    private readonly IOpcConnectionRepository _repo;
    private readonly ConnectionPasswordCrypto _passwordCrypto;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<OpcConnectionsController> _logger;

    private readonly OpcConnectionMetricsEnricher _metrics;

    public OpcConnectionsController(
        IOpcConnectionRepository repo,
        OpcConnectionMetricsEnricher metrics,
        ConnectionPasswordCrypto passwordCrypto,
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<OpcConnectionsController> logger)
    {
        _repo = repo;
        _metrics = metrics;
        _passwordCrypto = passwordCrypto;
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        await SyncGatewayOpcConnectionsAsync(ct);

        List<OpcConnection> items;
        try
        {
            items = (await _repo.GetAllAsync(ct)).ToList();
        }
        catch
        {
            items = [CreateDefaultHttpFeedConnection()];
        }

        if (!items.Any(i => i.Id == DefaultHttpFeedId))
            items.Add(CreateDefaultHttpFeedConnection());

        await _metrics.EnrichAllAsync(items, ct);

        foreach (var item in items.Where(i => i.Protocol == OpcConnectionProtocols.HttpJson && i.Enabled))
        {
            var probe = await ProbeHttpFeedAsync(item.Endpoint, ct);
            item.Status = probe.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
            item.PipelineStatus = probe.Success ? OpcConnectionPipelineStatus.Running : OpcConnectionPipelineStatus.Error;
            item.LastError = probe.Success ? null : probe.Message;
        }

        foreach (var item in items.Where(i => i.Protocol == OpcConnectionProtocols.OpcAe && i.Enabled))
        {
            var test = await TestOpcAeViaGatewayAsync(item, ct);
            item.Status = test.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
            item.PipelineStatus = test.Success ? OpcConnectionPipelineStatus.Running : OpcConnectionPipelineStatus.Error;
            item.LastError = test.Success ? null : test.Message;
            if (test.Success)
                item.LastConnectedUtc = DateTimeOffset.UtcNow;
        }

        return Ok(items.Select(ToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        OpcConnection? item;
        try
        {
            item = await _repo.GetByIdAsync(id, ct);
        }
        catch
        {
            item = id == DefaultHttpFeedId ? CreateDefaultHttpFeedConnection() : null;
        }

        if (item is null && id == DefaultHttpFeedId)
            item = CreateDefaultHttpFeedConnection();

        if (item is null) return NotFound();
        await _metrics.EnrichAsync(item, ct);
        return Ok(ToDto(item));
    }

    [HttpPost]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Create([FromBody] UpsertOpcConnectionRequest request, CancellationToken ct)
    {
        var error = Validate(request, isCreate: true);
        if (error is not null) return BadRequest(new { message = error });

        var now = DateTimeOffset.UtcNow;
        var entity = new OpcConnection
        {
            Id = request.Id ?? Guid.NewGuid(),
            Name = request.Name!.Trim(),
            Protocol = request.Protocol!,
            Endpoint = request.Endpoint!.Trim(),
            Username = Normalize(request.Username),
            PasswordEncrypted = _passwordCrypto.Encrypt(request.Password),
            Enabled = request.Enabled ?? true,
            AuthType = request.AuthType ?? OpcConnectionAuthTypes.Anonymous,
            Status = OpcConnectionStatus.Disconnected,
            PipelineStatus = OpcConnectionPipelineStatus.Stopped,
            CreatedUtc = now,
            UpdatedUtc = now
        };

        await _repo.AddAsync(entity, ct);

        if (entity.Enabled && entity.Protocol == OpcConnectionProtocols.HttpJson)
        {
            var probe = await ProbeHttpFeedAsync(entity.Endpoint, ct);
            entity.Status = probe.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
            entity.PipelineStatus = probe.Success ? OpcConnectionPipelineStatus.Running : OpcConnectionPipelineStatus.Error;
            entity.LastConnectedUtc = probe.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
            entity.LastError = probe.Success ? null : probe.Message;
            entity.UpdatedUtc = DateTimeOffset.UtcNow;
            await _repo.UpdateAsync(entity, ct);
        }
        else if (entity.Enabled && entity.Protocol == OpcConnectionProtocols.OpcAe)
        {
            var test = await TestOpcAeViaGatewayAsync(entity, ct);
            entity.Status = test.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
            entity.PipelineStatus = test.Success
                ? OpcConnectionPipelineStatus.Running
                : OpcConnectionPipelineStatus.Error;
            entity.LastConnectedUtc = test.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
            entity.LastError = test.Success ? null : test.Message;
            entity.UpdatedUtc = DateTimeOffset.UtcNow;
            await _repo.UpdateAsync(entity, ct);
        }

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertOpcConnectionRequest request, CancellationToken ct)
    {
        var error = Validate(request, isCreate: false);
        if (error is not null) return BadRequest(new { message = error });

        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound();

        entity.Name = request.Name!.Trim();
        entity.Protocol = request.Protocol!;
        entity.Endpoint = request.Endpoint!.Trim();
        entity.Username = Normalize(request.Username);
        entity.AuthType = request.AuthType ?? entity.AuthType ?? OpcConnectionAuthTypes.Anonymous;
        if (!string.IsNullOrWhiteSpace(request.Password))
            entity.PasswordEncrypted = _passwordCrypto.Encrypt(request.Password);
        entity.Enabled = request.Enabled ?? entity.Enabled;
        entity.UpdatedUtc = DateTimeOffset.UtcNow;

        if (entity.Enabled)
        {
            if (entity.Protocol == OpcConnectionProtocols.HttpJson)
            {
                var probe = await ProbeHttpFeedAsync(entity.Endpoint, ct);
                entity.Status = probe.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
                entity.PipelineStatus = probe.Success ? OpcConnectionPipelineStatus.Running : OpcConnectionPipelineStatus.Error;
                entity.LastConnectedUtc = probe.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
                entity.LastError = probe.Success ? null : probe.Message;
            }
            else if (entity.Protocol == OpcConnectionProtocols.OpcAe)
            {
                var test = await TestOpcAeViaGatewayAsync(entity, ct);
                entity.Status = test.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
                entity.PipelineStatus = test.Success
                    ? OpcConnectionPipelineStatus.Running
                    : OpcConnectionPipelineStatus.Error;
                entity.LastConnectedUtc = test.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
                entity.LastError = test.Success ? null : test.Message;
                entity.StreamPipesAdapterId = null;
                entity.StreamPipesPipelineId = null;
                entity.StreamPipesAckPipelineId = null;
            }
        }
        else
        {
            entity.Status = OpcConnectionStatus.Disconnected;
            entity.PipelineStatus = OpcConnectionPipelineStatus.Stopped;
        }

        await _repo.UpdateAsync(entity, ct);
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound();

        await _repo.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/connect")]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Connect(Guid id, CancellationToken ct)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound();

        if (entity.Protocol == OpcConnectionProtocols.OpcAe)
        {
            var test = await TestOpcAeViaGatewayAsync(entity, ct);
            entity.Status = test.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
            entity.PipelineStatus = test.Success
                ? OpcConnectionPipelineStatus.Running
                : OpcConnectionPipelineStatus.Error;
            entity.LastError = test.Success ? null : test.Message;
            entity.LastConnectedUtc = test.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
            entity.UpdatedUtc = DateTimeOffset.UtcNow;
            await _repo.UpdateAsync(entity, ct);
            return test.Success
                ? Ok(new { success = true, message = test.Message, connection = ToDto(entity) })
                : BadRequest(new { success = false, message = test.Message, connection = ToDto(entity) });
        }

        entity.Status = OpcConnectionStatus.Connecting;
        entity.LastError = null;
        entity.UpdatedUtc = DateTimeOffset.UtcNow;
        await _repo.UpdateAsync(entity, ct);

        var testResult = await TestConnectionAsync(entity, ct);
        entity.Status = testResult.Success ? OpcConnectionStatus.Connected : OpcConnectionStatus.Error;
        entity.PipelineStatus = testResult.Success
            ? OpcConnectionPipelineStatus.Running
            : OpcConnectionPipelineStatus.Error;
        entity.LastError = testResult.Success ? null : testResult.Message;
        entity.LastConnectedUtc = testResult.Success ? DateTimeOffset.UtcNow : entity.LastConnectedUtc;
        entity.UpdatedUtc = DateTimeOffset.UtcNow;
        await _repo.UpdateAsync(entity, ct);

        return testResult.Success
            ? Ok(new { success = true, message = testResult.Message, connection = ToDto(entity) })
            : BadRequest(new { success = false, message = testResult.Message, connection = ToDto(entity) });
    }

    [HttpPost("{id:guid}/disconnect")]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Disconnect(Guid id, CancellationToken ct)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound();

        var result = (Success: true, Message: $"Disconnected {entity.Name}.");
        entity.Status = OpcConnectionStatus.Disconnected;
        entity.PipelineStatus = OpcConnectionPipelineStatus.Stopped;
        entity.LastError = result.Success ? null : result.Message;
        entity.UpdatedUtc = DateTimeOffset.UtcNow;
        await _repo.UpdateAsync(entity, ct);

        return Ok(new { success = result.Success, message = result.Message, connection = ToDto(entity) });
    }

    [HttpPost("{id:guid}/test")]
    [Authorize(Policy = "system.manage")]
    public async Task<IActionResult> Test(Guid id, CancellationToken ct)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound(new { success = false, message = "Connection not found." });

        var result = await TestConnectionAsync(entity, ct);
        return Ok(new { success = result.Success, message = result.Message });
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestDraft([FromBody] UpsertOpcConnectionRequest request, CancellationToken ct)
    {
        var error = Validate(request, isCreate: true);
        if (error is not null) return BadRequest(new { success = false, message = error });

        var draft = new OpcConnection
        {
            Protocol = request.Protocol!,
            Endpoint = request.Endpoint!.Trim()
        };
        var result = await TestConnectionAsync(draft, ct);
        return Ok(new { success = result.Success, message = result.Message });
    }

    [HttpGet("{id:guid}/browse")]
    public async Task<IActionResult> Browse(Guid id, [FromQuery] string? nodeId, CancellationToken ct)
    {
        var entity = await _repo.GetByIdAsync(id, ct);
        if (entity is null) return NotFound();

        return BadRequest(new { success = false, message = "Browse not supported." });
    }

    private async Task<(bool Success, string Message)> TestConnectionAsync(OpcConnection entity, CancellationToken ct)
    {
        if (entity.Protocol == OpcConnectionProtocols.HttpJson)
            return await TestHttpJsonFeedAsync(entity, ct);

        if (entity.Protocol == OpcConnectionProtocols.OpcUa)
        {
            if (!TryParseHostPort(entity.Endpoint, out var host, out var port))
                return (false, "Invalid OPC-UA endpoint URL.");

            using var tcp = new TcpClient();
            try
            {
                await tcp.ConnectAsync(host, port, ct);
                return (true, $"TCP reachable at {host}:{port}. StreamPipes adapter validates full OPC-UA session.");
            }
            catch (Exception ex)
            {
                return (false, $"Connection failed: {ex.Message}");
            }
        }

        if (entity.Protocol == OpcConnectionProtocols.OpcAe)
            return await TestOpcAeViaGatewayAsync(entity, ct);

        return (false, $"Protocol {entity.Protocol} test not yet implemented.");
    }

    private static OpcConnectionDto ToDto(OpcConnection c) => new(
        c.Id,
        c.Name,
        c.Protocol,
        c.Endpoint,
        c.AuthType ?? OpcConnectionAuthTypes.Anonymous,
        c.Username,
        c.Enabled,
        c.Status,
        c.PipelineStatus,
        c.EventsPerSec,
        c.LastEventUtc,
        c.LastConnectedUtc,
        c.LastError,
        c.StreamPipesAdapterId,
        c.StreamPipesPipelineId,
        c.CreatedUtc,
        c.UpdatedUtc);

    private static string? Validate(UpsertOpcConnectionRequest request, bool isCreate)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Name is required.";
        if (string.IsNullOrWhiteSpace(request.Protocol)) return "Protocol is required.";
        if (!OpcConnectionProtocols.Supported.Contains(request.Protocol))
            return $"Protocol must be one of: {string.Join(", ", OpcConnectionProtocols.Supported)}.";
        if (isCreate &&
            !OpcConnectionProtocols.IngestSupported.Contains(request.Protocol) &&
            request.Protocol != OpcConnectionProtocols.OpcAe &&
            request.Protocol != OpcConnectionProtocols.HttpJson)
            return $"Protocol {request.Protocol} is not yet supported. Use: {string.Join(", ", OpcConnectionProtocols.IngestSupported)}.";
        if (string.IsNullOrWhiteSpace(request.Endpoint)) return "Endpoint is required.";
        return null;
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool TryParseHostPort(string url, out string host, out int port)
    {
        host = string.Empty;
        port = 0;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        host = uri.Host;
        port = uri.Port > 0 ? uri.Port : 4840;
        return !string.IsNullOrWhiteSpace(host);
    }

    private Task<(bool Success, string Message)> TestHttpJsonFeedAsync(OpcConnection entity, CancellationToken ct)
    {
        if (!Uri.TryCreate(entity.Endpoint, UriKind.Absolute, out _))
            return Task.FromResult((false, "Invalid HTTP JSON feed URL."));

        return ProbeHttpFeedAsync(entity.Endpoint, ct);
    }

    private async Task<(bool Success, string Message)> ProbeHttpFeedAsync(string endpoint, CancellationToken ct)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AlarmFeed");
            client.Timeout = TimeSpan.FromSeconds(8);
            var url = ResolveHttpFeedEndpoint(endpoint);
            using var response = await client.GetAsync(url, ct);
            if (response.IsSuccessStatusCode)
                return (true, $"HTTP alarm feed reachable at {url}");
            return (false, $"HTTP feed returned {(int)response.StatusCode} from {url}");
        }
        catch (Exception ex)
        {
            return (false, $"HTTP feed unreachable at {endpoint}: {ex.Message}");
        }
    }

    private OpcConnection CreateDefaultHttpFeedConnection()
    {
        var now = DateTimeOffset.UtcNow;
        var httpEnabled = _config.GetValue<bool>("AlarmIngestion:Enabled");
        var feedUrl = _config["AlarmIngestion:FeedUrl"];
        if (string.IsNullOrWhiteSpace(feedUrl))
            feedUrl = DefaultHttpFeedEndpoint;

        return new OpcConnection
        {
            Id = DefaultHttpFeedId,
            Name = DefaultHttpFeedName,
            Protocol = OpcConnectionProtocols.HttpJson,
            Endpoint = feedUrl.Trim(),
            Enabled = httpEnabled,
            AuthType = OpcConnectionAuthTypes.Anonymous,
            Status = httpEnabled ? OpcConnectionStatus.Connected : OpcConnectionStatus.Disconnected,
            PipelineStatus = httpEnabled ? OpcConnectionPipelineStatus.Running : OpcConnectionPipelineStatus.Stopped,
            LastError = httpEnabled ? null : "HTTP feed disabled in AlarmIngestion configuration.",
            CreatedUtc = now,
            UpdatedUtc = now
        };
    }

    private async Task<(bool Success, string Message)> TestOpcAeViaGatewayAsync(OpcConnection entity, CancellationToken ct)
    {
        var (host, progId) = ParseOpcAeEndpoint(entity.Endpoint);
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(progId))
            return (false, "OPC-AE endpoint must be host;ProgID");

        var gatewayBase = _config["OpcGateway:BaseUrl"] ?? "http://host.docker.internal:5050";
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(10);
            var health = await client.GetFromJsonAsync<GatewayOpcHealthDto>(
                $"{gatewayBase.TrimEnd('/')}/health/opc", ct);

            var match = health?.Servers?.FirstOrDefault(s =>
                string.Equals(s.Host, host, StringComparison.OrdinalIgnoreCase)
                && string.Equals(s.ProgId, progId, StringComparison.OrdinalIgnoreCase));

            if (match is not null && match.IsConnected)
                return (true, $"OPC-AE connected via gateway ({host}, {progId}). Events/sec: {match.EventsPerSec:F2}");

            return (false, match is null
                ? $"Gateway has no server registered for {host};{progId}. Start AMS.OpcGateway and connect."
                : $"OPC-AE server registered but not connected: {match.LastError ?? "unknown error"}");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OPC-AE gateway test failed");
            return (false, $"OPC Gateway unreachable at {gatewayBase}: {ex.Message}");
        }
    }

    private static (string Host, string ProgId) ParseOpcAeEndpoint(string endpoint)
    {
        if (endpoint.Contains(';', StringComparison.Ordinal))
        {
            var parts = endpoint.Split(';', 2);
            return (parts[0].Trim(), parts.Length > 1 ? parts[1].Trim() : string.Empty);
        }
        return (endpoint.Trim(), string.Empty);
    }

    [HttpPost("sync-from-gateway")]
    public async Task<IActionResult> SyncFromGateway(CancellationToken ct)
    {
        await SyncGatewayOpcConnectionsAsync(ct);
        var items = (await _repo.GetAllAsync(ct)).ToList();
        return Ok(new { synced = items.Count, connections = items.Select(ToDto) });
    }

    /// <summary>
    /// Persist live OPC gateway servers to DB and remove stale lab/simulation stubs.
    /// </summary>
    private async Task SyncGatewayOpcConnectionsAsync(CancellationToken ct)
    {
        var gatewayBase = _config["OpcGateway:BaseUrl"] ?? "http://host.docker.internal:5050";
        try
        {
            var existing = (await _repo.GetAllAsync(ct)).ToList();
            foreach (var stale in existing.Where(IsStaleLabSimulation))
            {
                _logger.LogInformation("Removing stale lab OPC connection {Name} ({Id})", stale.Name, stale.Id);
                await _repo.DeleteAsync(stale.Id, ct);
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            var health = await client.GetFromJsonAsync<GatewayOpcHealthDto>(
                $"{gatewayBase.TrimEnd('/')}/health/opc", ct);

            if (health?.Servers is null) return;

            foreach (var server in health.Servers)
            {
                if (string.IsNullOrWhiteSpace(server.Host) || string.IsNullOrWhiteSpace(server.ProgId))
                    continue;

                var endpoint = $"{server.Host};{server.ProgId}";
                var id = Guid.TryParse(server.Id, out var sid) ? sid : Guid.NewGuid();
                var entity = await _repo.GetByIdAsync(id, ct);
                var now = DateTimeOffset.UtcNow;

                if (entity is null)
                {
                    entity = new OpcConnection
                    {
                        Id = id,
                        Name = server.Name ?? "OPC-AE Server",
                        Protocol = OpcConnectionProtocols.OpcAe,
                        Endpoint = endpoint,
                        Enabled = true,
                        AuthType = OpcConnectionAuthTypes.Anonymous,
                        Status = server.IsConnected ? OpcConnectionStatus.Connected : OpcConnectionStatus.Disconnected,
                        PipelineStatus = server.IsConnected
                            ? OpcConnectionPipelineStatus.Running
                            : OpcConnectionPipelineStatus.Stopped,
                        EventsPerSec = server.EventsPerSec,
                        LastConnectedUtc = server.IsConnected ? now : null,
                        LastError = server.IsConnected ? null : server.LastError,
                        CreatedUtc = now,
                        UpdatedUtc = now
                    };
                    await _repo.AddAsync(entity, ct);
                    continue;
                }

                entity.Name = server.Name ?? entity.Name;
                entity.Protocol = OpcConnectionProtocols.OpcAe;
                entity.Endpoint = endpoint;
                entity.EventsPerSec = server.EventsPerSec;
                entity.Status = server.IsConnected ? OpcConnectionStatus.Connected : OpcConnectionStatus.Disconnected;
                entity.PipelineStatus = server.IsConnected
                    ? OpcConnectionPipelineStatus.Running
                    : OpcConnectionPipelineStatus.Stopped;
                entity.LastError = server.IsConnected ? null : server.LastError;
                if (server.IsConnected)
                    entity.LastConnectedUtc = now;
                entity.UpdatedUtc = now;
                await _repo.UpdateAsync(entity, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not sync OPC gateway servers into connection store");
        }
    }

    private static bool IsStaleLabSimulation(OpcConnection c) =>
        c.Name.Contains("Lab OPC", StringComparison.OrdinalIgnoreCase)
        || (string.Equals(c.Protocol, "OpcAe", StringComparison.OrdinalIgnoreCase)
            && c.Endpoint.StartsWith("opc.tcp://", StringComparison.OrdinalIgnoreCase));

    private sealed class GatewayOpcHealthDto
    {
        public List<GatewayServerDto>? Servers { get; init; }
    }

    private sealed class GatewayServerDto
    {
        public string? Id { get; init; }
        public string? Name { get; init; }
        public string? Host { get; init; }
        public string? ProgId { get; init; }
        public bool IsConnected { get; init; }
        public string? LastError { get; init; }
        public double EventsPerSec { get; init; }
    }

    private static string ResolveHttpFeedEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
            return endpoint;

        if (!string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
            && uri.Host != "127.0.0.1")
            return endpoint;

        var builder = new UriBuilder(uri)
        {
            Host = "host.docker.internal"
        };
        return builder.Uri.ToString();
    }
}

public sealed record UpsertOpcConnectionRequest(
    Guid? Id,
    string? Name,
    string? Protocol,
    string? Endpoint,
    string? AuthType,
    string? Username,
    string? Password,
    bool? Enabled);

public sealed record OpcConnectionDto(
    Guid Id,
    string Name,
    string Protocol,
    string Endpoint,
    string AuthType,
    string? Username,
    bool Enabled,
    string Status,
    string PipelineStatus,
    double EventsPerSec,
    DateTimeOffset? LastEventUtc,
    DateTimeOffset? LastConnectedUtc,
    string? LastError,
    string? StreamPipesAdapterId,
    string? StreamPipesPipelineId,
    DateTimeOffset CreatedUtc,
    DateTimeOffset UpdatedUtc);
