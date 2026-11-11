using System.Text.Json;
using AMS.AuditService.Consumers;
using AMS.AuditService.Models;
using AMS.AuditService.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace AMS.AuditService.Tests;

/// <summary>
/// The real audit-service host (routing, the shared header-trust auth, the per-permission
/// policies) on TestServer. The Postgres context is replaced by EF in-memory and the Kafka
/// consumer is removed, so nothing outside the process is touched.
/// </summary>
internal sealed class AuditServiceFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = "audit-" + Guid.NewGuid();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AuditDbContext>>();
            services.RemoveAll<AuditDbContext>();
            services.AddScoped<AuditDbContext>(_ => InMemoryAuditDbContext.Create(_dbName));

            foreach (var hosted in services
                         .Where(d => d.ServiceType == typeof(IHostedService)
                                     && d.ImplementationType == typeof(AuditEventConsumer))
                         .ToList())
                services.Remove(hosted);
        });
    }

    /// <summary>A client that arrives as the gateway would forward a signed-in user.</summary>
    public HttpClient ClientAs(string username, params string[] permissions)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Auth-Subject", "sub-" + username);
        client.DefaultRequestHeaders.Add("X-Auth-Username", username);
        client.DefaultRequestHeaders.Add("X-Auth-Role", "Admin");
        client.DefaultRequestHeaders.Add("X-Auth-Permissions", string.Join(",", permissions));
        return client;
    }

    public async Task SeedLegacyChainAsync(int count)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
        db.AuditEvents.AddRange(TestChain.LegacyEvents(count));
        await db.SaveChangesAsync();
    }

    public async Task SeedAsync(IEnumerable<AuditEvent> events)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
        db.AuditEvents.AddRange(events);
        await db.SaveChangesAsync();
    }

    public async Task<List<AuditEvent>> ReadChainAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
        return await db.AuditEvents.AsNoTracking()
            .OrderBy(e => e.TimestampUtc).ThenBy(e => e.EventId)
            .ToListAsync();
    }
}

internal static class TestChain
{
    public const string RechainedType = "AUDIT_CHAIN_RECHAINED";

    /// <summary>
    /// Rows as written before the canonical-JSON fix: linked, but their hashes cannot
    /// verify under today's algorithm, so a rechain rewrites every one of them.
    /// </summary>
    public static List<AuditEvent> LegacyEvents(int count, DateTimeOffset? start = null)
    {
        var t0 = start ?? DateTimeOffset.UtcNow.AddHours(-1);
        var previous = new string('0', 64);
        var events = new List<AuditEvent>();
        for (var i = 0; i < count; i++)
        {
            var evt = new AuditEvent
            {
                TimestampUtc = t0.AddMinutes(i),
                EventType = "DISPLAY_UPDATED",
                UserId = "alice",
                EntityType = "Display",
                EntityId = "display-" + i,
                AfterState = JsonDocument.Parse("{\"name\":\"P-10" + i + "\"}"),
                PreviousHash = previous,
                CurrentHash = (i + 1).ToString("x64"),
            };
            previous = evt.CurrentHash;
            events.Add(evt);
        }
        return events;
    }
}

/// <summary>
/// AuditDbContext on EF in-memory. The in-memory provider cannot store JsonDocument (the
/// jsonb columns), so it is kept as its raw text; the hash reads the canonical form either way.
/// </summary>
internal sealed class InMemoryAuditDbContext : AuditDbContext
{
    private InMemoryAuditDbContext(DbContextOptions<AuditDbContext> options) : base(options) { }

    public static InMemoryAuditDbContext Create(string dbName, params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<AuditDbContext>()
            .UseInMemoryDatabase(dbName)
            .AddInterceptors(interceptors)
            .Options);

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder) =>
        configurationBuilder.Properties<JsonDocument>().HaveConversion<JsonDocumentTextConverter>();

    private sealed class JsonDocumentTextConverter : ValueConverter<JsonDocument, string>
    {
        public JsonDocumentTextConverter()
            : base(d => d.RootElement.GetRawText(), s => JsonDocument.Parse(s, default(JsonDocumentOptions))) { }
    }
}
