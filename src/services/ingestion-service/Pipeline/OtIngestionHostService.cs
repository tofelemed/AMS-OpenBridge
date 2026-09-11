using Traverse.IngestionService.Models;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Owns one OtLoopSubscriber per active MQTT_LOOP_SAMPLES data-source config.
/// Every 30 s (and at startup) it reconciles running subscribers against the config
/// table: starts new/activated ones, stops deactivated/deleted ones, restarts on a
/// material config change or an explicit /reload request. Change detection compares
/// a fingerprint of material fields — NEVER the version column, which the touch
/// trigger bumps on every last_data_received/test update.
/// </summary>
public sealed class OtIngestionHostService : BackgroundService
{
    private const string SupportedProfile = "MQTT_LOOP_SAMPLES";

    private readonly DataSourceRepository _repo;
    private readonly CredentialCipher _cipher;
    private readonly CplmRegistryClient _registryClient;
    private readonly ILoopSampleSink _sink;
    private readonly UnknownSourceInventory _inventory;
    private readonly UnknownSourceRepository _unknownRepo;
    private readonly LoopStateRepository _stateRepo;
    private readonly SubscriberStatusRegistry _statusRegistry;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ILogger<OtIngestionHostService> _logger;

    /// <summary>Subscriber is null when pre-start failed (decrypt/topics) — the entry
    /// still holds the fingerprint slot so we don't retry every 30 s; a config edit
    /// changes the fingerprint and triggers the restart path.</summary>
    private sealed record Running(OtLoopSubscriber? Subscriber, string Fingerprint, SubscriberStatus Status);
    private readonly Dictionary<Guid, Running> _running = new();
    private readonly HashSet<Guid> _unsupportedLogged = new();

    public OtIngestionHostService(
        DataSourceRepository repo, CredentialCipher cipher, CplmRegistryClient registryClient,
        ILoopSampleSink sink, UnknownSourceInventory inventory, UnknownSourceRepository unknownRepo,
        SubscriberStatusRegistry statusRegistry, ILoggerFactory loggerFactory,
        ILogger<OtIngestionHostService> logger,
        LoopStateRepository stateRepo)
    {
        _stateRepo = stateRepo;
        _repo = repo; _cipher = cipher; _registryClient = registryClient; _sink = sink;
        _inventory = inventory; _unknownRepo = unknownRepo; _statusRegistry = statusRegistry;
        _loggerFactory = loggerFactory; _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let Program.cs finish the schema self-heal before the first config read.
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        _logger.LogInformation("OT ingestion host started — watching for active {Profile} data sources", SupportedProfile);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        do
        {
            try { await ReconcileAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Subscriber reconcile failed — retrying in 30 s");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task ReconcileAsync(CancellationToken ct)
    {
        var rows = await _repo.ListAsync(activeOnly: true);
        var wanted = new Dictionary<Guid, DataSourceRow>();
        foreach (var row in rows)
        {
            if (string.Equals(row.ProfileType, SupportedProfile, StringComparison.Ordinal))
                wanted[row.ConfigId] = row;
            else if (_unsupportedLogged.Add(row.ConfigId))
                _logger.LogInformation("Data source '{Name}' has profile {Profile} — no subscriber pipeline for it yet",
                    row.Name, row.ProfileType ?? "(none)");
        }

        // Stop removed/deactivated subscribers.
        foreach (var (configId, running) in _running.Where(kv => !wanted.ContainsKey(kv.Key)).ToList())
        {
            _logger.LogInformation("Stopping subscriber '{Name}' (config removed or deactivated)", running.Status.Name);
            await StopOneAsync(configId, running);
        }

        // Start new ones; restart changed/reloaded ones.
        foreach (var (configId, row) in wanted)
        {
            var fingerprint = Fingerprint(row);
            var reloadRequested = _statusRegistry.TryConsumeReload(configId);
            if (_running.TryGetValue(configId, out var running))
            {
                if (running.Fingerprint == fingerprint && !reloadRequested) continue;
                _logger.LogInformation("Restarting subscriber '{Name}' ({Why})",
                    row.Name, reloadRequested ? "reload requested" : "config changed");
                await StopOneAsync(configId, running);
            }
            await StartOneAsync(row, fingerprint, ct);
        }
    }

    private async Task StartOneAsync(DataSourceRow row, string fingerprint, CancellationToken ct)
    {
        var status = new SubscriberStatus { ConfigId = row.ConfigId, Name = row.Name, ProfileType = row.ProfileType };
        _statusRegistry.Upsert(status);

        string password;
        try
        {
            password = _cipher.Decrypt(row.PasswordEncrypted);
        }
        catch (Exception ex)
        {
            status.ConnectionError = $"Could not decrypt stored password: {ex.Message} (was ENCRYPTION_KEY rotated?)";
            _logger.LogError("Subscriber '{Name}' not started: {Error}", row.Name, status.ConnectionError);
            _running[row.ConfigId] = new Running(null, fingerprint, status);
            return;
        }

        var profile = ProfileConfig.FromJson(row.ProfileConfig);
        var topics = (profile.Mqtt?.Topics ?? new List<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
        if (topics.Count == 0)
        {
            status.ConnectionError = "no topic filters configured";
            _logger.LogError("Subscriber '{Name}' not started: no topic filters", row.Name);
            _running[row.ConfigId] = new Running(null, fingerprint, status);
            return;
        }
        var settings = (profile.LoopIngest ?? new LoopIngestConfig()).Resolve();
        status.ParamRoles = settings.ParamRoles;
        _logger.LogInformation(
            "Subscriber '{Name}': effective param_roles {Map}",
            row.Name,
            string.Join(", ", settings.ParamRoles
                .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
                .Select(kv => $"{kv.Key}→{kv.Value}")));

        // An empty map means every numeric DCS mode reaches the engine raw, fails its
        // vocabulary, and G1 excludes the loop — with no error anywhere. Announce it at
        // startup; per-value detail follows from the subscriber as data arrives.
        if (settings.ModeValueMap.Count == 0)
            _logger.LogWarning(
                "Subscriber '{Name}': profile_config.loop_ingest.mode_value_map is EMPTY. " +
                "A numeric DCS MODE will reach the engine unmapped, count as NOT auto, and " +
                "G1 will exclude every loop on this source. CENTUM: 1=AUT, 2=MAN, 3=CAS, 4=IMAN.",
                row.Name);

        var subscriber = new OtLoopSubscriber(row, password, settings, topics,
            profile.Mqtt?.Qos ?? 1, _registryClient, _sink, _inventory, _unknownRepo, _repo,
            status, _loggerFactory.CreateLogger($"OtLoopSubscriber.{row.Name}"),
            registry: null, stateRepo: _stateRepo);
        _running[row.ConfigId] = new Running(subscriber, fingerprint, status);
        await subscriber.StartAsync(ct);
    }

    private async Task StopOneAsync(Guid configId, Running running)
    {
        _running.Remove(configId);
        _statusRegistry.Remove(configId);
        if (running.Subscriber is not null)
            await running.Subscriber.DisposeAsync();
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var (configId, running) in _running.ToList())
            await StopOneAsync(configId, running);
        await base.StopAsync(cancellationToken);
    }

    /// <summary>Material fields only — the columns whose change requires a reconnect
    /// or repipeline. last_* stamps and version are noise by design.</summary>
    private static string Fingerprint(DataSourceRow row) => string.Join("|",
        row.ConnectionUrl, row.Username, row.PasswordEncrypted, row.TimeoutSeconds,
        row.InsecureSkipVerify, row.ProfileType, row.ProfileConfig, row.IsActive);

}
