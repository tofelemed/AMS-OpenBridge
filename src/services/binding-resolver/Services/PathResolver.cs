using System.Text.Json;
using StackExchange.Redis;
using Traverse.BindingResolver.Models;

namespace Traverse.BindingResolver.Services;

/// <summary>
/// Resolves contextual paths to transport bindings.
/// Implements the core UNS → transport mapping logic.
/// </summary>
public class PathResolver
{
    private readonly IConnectionMultiplexer _redis;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<PathResolver> _logger;
    
    public PathResolver(
        IConnectionMultiplexer redis,
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<PathResolver> logger)
    {
        _redis = redis;
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }
    
    /// <summary>
    /// Resolves a contextual path to its transport bindings.
    /// </summary>
    public async Task<BindingResponse> ResolveAsync(string contextualPath, string[] roles)
    {
        var resolveAll = roles.Contains("all", StringComparer.OrdinalIgnoreCase);
        var resolveLive = resolveAll || roles.Contains("live", StringComparer.OrdinalIgnoreCase);
        var resolveHistory = resolveAll || roles.Contains("history", StringComparer.OrdinalIgnoreCase);
        var resolveAlarm = resolveAll || roles.Contains("alarm", StringComparer.OrdinalIgnoreCase);
        
        try
        {
            // Try to resolve via Asset Model service first
            var asset = await TryResolveFromAssetModel(contextualPath);
            
            if (asset is not null)
            {
                return BuildBindingFromAsset(asset, resolveLive, resolveHistory, resolveAlarm);
            }
            
            // Fallback: generate bindings from path pattern directly
            return BuildBindingFromPath(contextualPath, resolveLive, resolveHistory, resolveAlarm);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to resolve path {Path}", contextualPath);
            return new BindingResponse
            {
                ContextualPath = contextualPath,
                Resolved = false,
                Error = ex.Message
            };
        }
    }
    
    /// <summary>
    /// Attempts to resolve the asset from the Asset Model service.
    /// Returns null if not found or service unavailable.
    /// </summary>
    private async Task<AssetInfo?> TryResolveFromAssetModel(string contextualPath)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AssetModel");
            // asset-model uses a {**path} catch-all route — it only matches LITERAL slashes.
            // Escape each segment but keep the separators, else every lookup 404s and we
            // silently fall back to path-pattern resolution (which derives a different
            // sparkplug device id, e.g. crude1_pump101 vs pump101) and breaks live values.
            var encodedPath = string.Join('/', contextualPath.Split('/').Select(Uri.EscapeDataString));
            var response = await client.GetAsync($"/assets/by-path/{encodedPath}");
            
            if (!response.IsSuccessStatusCode)
                return null;
            
            var json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<AssetInfo>(json, new JsonSerializerOptions 
            { 
                PropertyNameCaseInsensitive = true 
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Asset Model service unavailable, using path-based resolution");
            return null;
        }
    }
    
    /// <summary>
    /// Attempts to resolve a legacy path to canonical path via alias mapping.
    /// </summary>
    public async Task<string?> TryResolveAliasAsync(string legacyPath, string? sourceSystem)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AssetModel");
            var url = $"/aliases/resolve?legacy={Uri.EscapeDataString(legacyPath)}";
            if (!string.IsNullOrEmpty(sourceSystem))
                url += $"&source={Uri.EscapeDataString(sourceSystem)}";
            
            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return null;
            
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("canonicalPath", out var path) 
                ? path.GetString() 
                : null;
        }
        catch
        {
            return null;
        }
    }
    
    private BindingResponse BuildBindingFromAsset(AssetInfo asset, bool live, bool history, bool alarm)
    {
        return new BindingResponse
        {
            ContextualPath = asset.ContextualPath,
            Resolved = true,
            Live = live ? BuildLiveBinding(
                asset.SparkplugGroup, 
                asset.SparkplugEdgeNode, 
                asset.SparkplugDevice, 
                asset.SparkplugMetric,
                asset.RedisSnapshotKey,
                asset.SparkplugTopic) : null,
            History = history ? BuildHistoryBinding(asset.IoTDbPath) : null,
            Alarm = alarm ? BuildAlarmBinding(asset.AlarmSource) : null
        };
    }
    
    private BindingResponse BuildBindingFromPath(string contextualPath, bool live, bool history, bool alarm)
    {
        var parts = contextualPath.Split('/');
        if (parts.Length < 2)
        {
            return new BindingResponse
            {
                ContextualPath = contextualPath,
                Resolved = false,
                Error = "Invalid path format. Expected: site/[area/]unit/device[.measurement]"
            };
        }
        
        var site = parts[0];
        var edgeNode = $"{site}_edge1";
        var lastPart = parts[^1];
        var dotIndex = lastPart.IndexOf('.');
        var device = dotIndex >= 0 ? lastPart[..dotIndex] : lastPart;
        var metric = dotIndex >= 0 ? lastPart[(dotIndex + 1)..] : null;
        
        // Build device ID from unit + device (if available)
        var deviceId = parts.Length >= 3 
            ? $"{parts[^2]}_{device}" 
            : device;
        
        var sparkplugTopic = $"spBv1.0/{site}/DDATA/{edgeNode}/{deviceId}";
        var redisKey = metric != null 
            ? $"snapshot:metric:{site}:{edgeNode}:{deviceId}:{metric}" 
            : null;
        var iotdbPath = $"root.{contextualPath.Replace('/', '.').Replace(' ', '_')}";
        var alarmSource = $"{site}:{(parts.Length >= 3 ? parts[^2] : "default")}:{device}";
        
        return new BindingResponse
        {
            ContextualPath = contextualPath,
            Resolved = true,
            Live = live ? BuildLiveBinding(site, edgeNode, deviceId, metric, redisKey, sparkplugTopic) : null,
            History = history ? BuildHistoryBinding(iotdbPath) : null,
            Alarm = alarm ? BuildAlarmBinding(alarmSource) : null
        };
    }
    
    private LiveBinding BuildLiveBinding(
        string group, string edgeNode, string device, string? metric, string? redisKey, string topic)
    {
        var mqttHost = _config["Mqtt:Host"] ?? "emqx";
        var mqttPort = _config.GetValue<int>("Mqtt:WebSocketPort", 8083);
        var mqttProtocol = _config["Mqtt:Protocol"] ?? "ws";
        var historianBff = _config["Services:HistorianBff"] ?? "http://historian-bff:5000";
        
        return new LiveBinding
        {
            Mqtt = new MqttConnectionInfo
            {
                Host = mqttHost,
                Port = mqttPort,
                Protocol = mqttProtocol,
                Username = _config["Mqtt:Username"]
            },
            SparkplugTopic = topic,
            SparkplugGroup = group,
            SparkplugEdgeNode = edgeNode,
            SparkplugDevice = device,
            SparkplugMetric = metric,
            RedisSnapshotKey = redisKey,
            SnapshotEndpoint = $"{historianBff}/snapshot?assets={device}"
        };
    }
    
    private HistoryBinding BuildHistoryBinding(string iotdbPath)
    {
        var historianBff = _config["Services:HistorianBff"] ?? "http://historian-bff:5000";
        var encodedPath = Uri.EscapeDataString(iotdbPath);
        
        return new HistoryBinding
        {
            IoTDbPath = iotdbPath,
            TrendEndpoint = $"{historianBff}/trend?series={encodedPath}",
            RawEndpoint = $"{historianBff}/raw?series={encodedPath}"
        };
    }
    
    private AlarmBinding BuildAlarmBinding(string alarmSource)
    {
        var amsApi = _config["Services:AmsApi"] ?? "http://ams-api:5000";
        var signalrHub = _config["Services:SignalRHub"] ?? $"{amsApi}/hubs/alarm";
        
        return new AlarmBinding
        {
            AlarmSource = alarmSource,
            SignalRHub = signalrHub,
            SubscribeMethod = "SubscribeToAlarms",
            KafkaTopic = "live.alarms",
            AlarmApiEndpoint = $"{amsApi}/api/alarms?source={Uri.EscapeDataString(alarmSource)}"
        };
    }
}

/// <summary>
/// DTO matching Asset Model service response.
/// </summary>
internal record AssetInfo
{
    public Guid Id { get; init; }
    public string ContextualPath { get; init; } = "";
    public string Name { get; init; } = "";
    public string IoTDbPath { get; init; } = "";
    public string SparkplugGroup { get; init; } = "";
    public string SparkplugEdgeNode { get; init; } = "";
    public string SparkplugDevice { get; init; } = "";
    public string? SparkplugMetric { get; init; }
    public string SparkplugTopic { get; init; } = "";
    public string AlarmSource { get; init; } = "";
    public string? RedisSnapshotKey { get; init; }
}
