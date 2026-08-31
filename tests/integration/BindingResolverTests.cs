using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace Traverse.Tests.Integration;

/// <summary>
/// Integration tests for Binding Resolver BFF.
/// These tests verify end-to-end path resolution from UNS contextual paths
/// to transport bindings (live, history, alarm).
/// 
/// Prerequisites:
/// - Docker services running (asset-model, binding-resolver, redis)
/// - Test assets seeded in traverse_assets database
/// 
/// Run with: dotnet test --filter "Category=Integration"
/// </summary>
[Trait("Category", "Integration")]
public class BindingResolverTests : IAsyncLifetime
{
    private readonly HttpClient _client;
    private readonly string _bindingResolverUrl;
    private readonly string _assetModelUrl;
    
    public BindingResolverTests()
    {
        _bindingResolverUrl = Environment.GetEnvironmentVariable("BINDING_RESOLVER_URL") 
            ?? "http://localhost:5002";
        _assetModelUrl = Environment.GetEnvironmentVariable("ASSET_MODEL_URL") 
            ?? "http://localhost:5001";
        _client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    }
    
    public async Task InitializeAsync()
    {
        await WaitForService(_bindingResolverUrl, "/health");
        await WaitForService(_assetModelUrl, "/health");
        await SeedTestAssetsAsync();
    }
    
    public Task DisposeAsync()
    {
        _client.Dispose();
        return Task.CompletedTask;
    }
    
    private async Task WaitForService(string baseUrl, string healthPath, int maxRetries = 30)
    {
        for (int i = 0; i < maxRetries; i++)
        {
            try
            {
                var response = await _client.GetAsync($"{baseUrl}{healthPath}");
                if (response.IsSuccessStatusCode) return;
            }
            catch { }
            await Task.Delay(1000);
        }
        throw new Exception($"Service at {baseUrl} did not become healthy");
    }
    
    private async Task SeedTestAssetsAsync()
    {
        var testAssets = new[]
        {
            new
            {
                contextualPath = "houston/crude1/pump101.discharge_press",
                name = "Pump 101 Discharge Pressure",
                type = 5, // Measurement
                description = "Discharge pressure sensor for pump 101",
                engineeringUnit = "PSI",
                loEngLimit = 0.0,
                hiEngLimit = 500.0
            },
            new
            {
                contextualPath = "houston/crude1/pump101.motor_temp",
                name = "Pump 101 Motor Temperature",
                type = 5,
                description = "Motor winding temperature for pump 101",
                engineeringUnit = "degC",
                loEngLimit = 0.0,
                hiEngLimit = 150.0
            },
            new
            {
                contextualPath = "houston/crude1/valve201.position",
                name = "Valve 201 Position",
                type = 5,
                description = "Control valve position feedback",
                engineeringUnit = "%",
                loEngLimit = 0.0,
                hiEngLimit = 100.0
            }
        };
        
        foreach (var asset in testAssets)
        {
            try
            {
                await _client.PostAsJsonAsync($"{_assetModelUrl}/assets", asset);
            }
            catch
            {
                // Ignore conflicts (asset already exists)
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Contextual path resolves to live transport (Sparkplug B)
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_ValidPath_ReturnsLiveBinding_WithSparkplugTopic()
    {
        // Arrange
        var path = "houston/crude1/pump101.discharge_press";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path={path}&roles=live");
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        
        root.GetProperty("resolved").GetBoolean().Should().BeTrue();
        root.GetProperty("contextualPath").GetString().Should().Be(path);
        
        // Device id is asset-model canonical: SparkplugDevice = <device> for a
        // site/unit/device.measurement path (see asset-model/Models/Asset.cs). The
        // earlier "crude1_pump101" expectation reflected the path-pattern FALLBACK that
        // only ran because binding-resolver URL-encoded the asset-model lookup (fixed).
        var live = root.GetProperty("live");
        live.GetProperty("sparkplugTopic").GetString()
            .Should().Be("spBv1.0/houston/DDATA/houston_edge1/pump101");
        live.GetProperty("sparkplugGroup").GetString().Should().Be("houston");
        live.GetProperty("sparkplugEdgeNode").GetString().Should().Be("houston_edge1");
        live.GetProperty("sparkplugDevice").GetString().Should().Be("pump101");
        live.GetProperty("sparkplugMetric").GetString().Should().Be("discharge_press");
        live.GetProperty("redisSnapshotKey").GetString()
            .Should().Be("snapshot:metric:houston:houston_edge1:pump101:discharge_press");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Contextual path resolves to history transport (IoTDB)
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_ValidPath_ReturnsHistoryBinding_WithIoTDbPath()
    {
        // Arrange
        var path = "houston/crude1/pump101.discharge_press";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path={path}&roles=history");
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        
        root.GetProperty("resolved").GetBoolean().Should().BeTrue();
        
        // Property is camelCase "ioTDbPath" (from C# IoTDbPath); the earlier
        // "iotDbPath" spelling never matched and made this assertion throw.
        var history = root.GetProperty("history");
        history.GetProperty("ioTDbPath").GetString()
            .Should().Be("root.houston.crude1.pump101.discharge_press");
        history.GetProperty("trendEndpoint").GetString()
            .Should().Contain("/trend?series=");
        history.GetProperty("rawEndpoint").GetString()
            .Should().Contain("/raw?series=");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Contextual path resolves to alarm transport (SignalR)
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_ValidPath_ReturnsAlarmBinding_WithAlarmSource()
    {
        // Arrange
        var path = "houston/crude1/pump101.discharge_press";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path={path}&roles=alarm");
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        
        root.GetProperty("resolved").GetBoolean().Should().BeTrue();
        
        var alarm = root.GetProperty("alarm");
        alarm.GetProperty("alarmSource").GetString().Should().Be("houston:crude1:pump101");
        alarm.GetProperty("signalRHub").GetString().Should().Contain("/hubs/alarm");
        alarm.GetProperty("kafkaTopic").GetString().Should().Be("traverse.alarm.live.alarms");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: All roles resolve in single request
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_AllRoles_ReturnsAllBindings()
    {
        // Arrange
        var path = "houston/crude1/pump101.discharge_press";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path={path}&roles=all");
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        
        root.GetProperty("resolved").GetBoolean().Should().BeTrue();
        root.TryGetProperty("live", out _).Should().BeTrue("should have live binding");
        root.TryGetProperty("history", out _).Should().BeTrue("should have history binding");
        root.TryGetProperty("alarm", out _).Should().BeTrue("should have alarm binding");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Batch resolution for multiple paths
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task ResolveBatch_MultiplePaths_ReturnsAllBindings()
    {
        // Arrange
        var request = new
        {
            bindings = new[]
            {
                new { path = "houston/crude1/pump101.discharge_press", roles = new[] { "live" } },
                new { path = "houston/crude1/pump101.motor_temp", roles = new[] { "history" } },
                new { path = "houston/crude1/valve201.position", roles = new[] { "all" } }
            }
        };
        
        // Act
        var response = await _client.PostAsJsonAsync($"{_bindingResolverUrl}/resolve/batch", request);
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var bindings = doc.RootElement.GetProperty("bindings");
        
        bindings.GetArrayLength().Should().Be(3);
        
        foreach (var binding in bindings.EnumerateArray())
        {
            binding.GetProperty("resolved").GetBoolean().Should().BeTrue();
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Preview endpoint shows path parsing without DB lookup
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Preview_ValidPath_ShowsParsedComponents()
    {
        // Arrange
        var path = "houston/refinery/crude2/compressor301.inlet_press";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/preview?path={path}");
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert
        response.Should().BeSuccessful();
        
        using var doc = JsonDocument.Parse(content);
        var root = doc.RootElement;
        
        var parsed = root.GetProperty("parsed");
        parsed.GetProperty("site").GetString().Should().Be("houston");
        parsed.GetProperty("area").GetString().Should().Be("refinery");
        parsed.GetProperty("unit").GetString().Should().Be("crude2");
        parsed.GetProperty("device").GetString().Should().Be("compressor301");
        parsed.GetProperty("measurement").GetString().Should().Be("inlet_press");
        
        var generated = root.GetProperty("generated");
        generated.GetProperty("iotdbPath").GetString()
            .Should().Be("root.houston.refinery.crude2.compressor301.inlet_press");
        generated.GetProperty("sparkplugDevice").GetString()
            .Should().Be("crude2_compressor301");
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Invalid path returns error
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_InvalidPath_ReturnsBadRequest()
    {
        // Arrange
        var invalidPath = "single-segment";
        
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path={invalidPath}&roles=all");
        
        // Assert
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Test: Empty path returns bad request
    // ═══════════════════════════════════════════════════════════════════════════
    
    [Fact]
    public async Task Resolve_EmptyPath_ReturnsBadRequest()
    {
        // Act
        var response = await _client.GetAsync($"{_bindingResolverUrl}/resolve?path=&roles=all");
        
        // Assert
        response.StatusCode.Should().Be(System.Net.HttpStatusCode.BadRequest);
    }
}
