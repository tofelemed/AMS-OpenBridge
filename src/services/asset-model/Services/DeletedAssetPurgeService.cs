using Microsoft.EntityFrameworkCore;
using Traverse.AssetModel.Data;

namespace Traverse.AssetModel.Services;

/// <summary>
/// Hard-deletes soft-deleted asset rows after a retention window (G-09).
///
/// Soft delete had no purge: 15.5k of 15.9k rows were dead weight on every scan.
/// The window (Maintenance:PurgeDeletedAfterDays, default 30, 0 = disabled) gives
/// operators time to notice an accidental delete; after that the row goes for real.
///
/// Safety rails:
///  - rows still referenced as parent_id by ANY row (live or deleted) survive —
///    the parent_id FK has no cascade, and purging bottom-up converges over runs;
///  - asset_relationships rows cascade with the asset (ON DELETE CASCADE);
///  - the CPLM projection ledger (cpm.loop_signal_asset, other database) only
///    references LIVE projected assets — retirement deletes its ledger rows
///    before/with the soft delete, so a soft-deleted row is already unreferenced.
/// </summary>
public sealed class DeletedAssetPurgeService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly IConfiguration _config;
    private readonly ILogger<DeletedAssetPurgeService> _logger;

    public DeletedAssetPurgeService(
        IServiceScopeFactory scopes, IConfiguration config, ILogger<DeletedAssetPurgeService> logger)
    {
        _scopes = scopes;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // Let the app finish starting (and the self-heal DDL land) first.
        await Task.Delay(TimeSpan.FromMinutes(2), ct);

        while (!ct.IsCancellationRequested)
        {
            var days = _config.GetValue("Maintenance:PurgeDeletedAfterDays", 30);
            if (days > 0)
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AssetDbContext>();
                    var purged = await db.Database.ExecuteSqlAsync($"""
                        DELETE FROM assets.assets a
                        WHERE a.is_deleted
                          AND a.updated_at < NOW() - make_interval(days => {days})
                          AND NOT EXISTS (SELECT 1 FROM assets.assets c WHERE c.parent_id = a.id)
                        """, ct);
                    if (purged > 0)
                        _logger.LogInformation("Purged {Count} soft-deleted asset row(s) older than {Days} day(s)", purged, days);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Deleted-asset purge failed — will retry on the next cycle");
                }
            }
            await Task.Delay(TimeSpan.FromHours(24), ct);
        }
    }
}
