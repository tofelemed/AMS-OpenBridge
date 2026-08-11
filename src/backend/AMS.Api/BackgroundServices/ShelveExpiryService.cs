// ISA-18.2 shelve expiry — moved out of Program.cs (Plan 10 B1, verbatim).
//
// DOM-02 history: this service was implemented but never registered, so the shelving
// timeout never ran — a shelved alarm stayed shelved forever. The real expiry logic is
// the alarms.expire_shelved_alarms() SQL function (database/scripts/36_alarm_shelving.sql);
// this worker just invokes it once a minute.
using AMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AMS.Api.BackgroundServices;

public class ShelveExpiryService : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<ShelveExpiryService> _logger;

    public ShelveExpiryService(IServiceProvider sp, ILogger<ShelveExpiryService> logger)
    { _sp = sp; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
                // Call alarms.expire_shelved_alarms() stored procedure
                await db.Database.ExecuteSqlRawAsync("SELECT alarms.expire_shelved_alarms()", ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to execute shelve expiry. Schema or function might be missing.");
            }
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(1), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
