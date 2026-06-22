using System.Data.Common;
using AMS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.Kafka;
using Testcontainers.PostgreSql;
using Xunit;

namespace AMS.Tests.Integration;

public abstract class TestBase : IAsyncLifetime
{
    private readonly PostgreSqlContainer _dbContainer;
    private readonly KafkaContainer _kafkaContainer;
    protected WebApplicationFactory<Program> Factory { get; private set; } = null!;
    protected HttpClient Client { get; private set; } = null!;

    protected TestBase()
    {
        // Use standard PostgreSQL for testing EF Core logic
        // (TimescaleDB specific hypertable DDL is tested separately or skipped in standard integration tests)
        _dbContainer = new PostgreSqlBuilder()
            .WithImage("postgres:16")
            .WithDatabase("ams_test")
            .WithUsername("test_user")
            .WithPassword("test_password")
            .Build();

        _kafkaContainer = new KafkaBuilder()
            .WithImage("confluentinc/cp-kafka:7.6.0")
            .Build();
    }

    public async Task InitializeAsync()
    {
        await _dbContainer.StartAsync();
        await _kafkaContainer.StartAsync();

        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            
            // Override configuration
            builder.UseSetting("ConnectionStrings:AmsDb", _dbContainer.GetConnectionString());
            builder.UseSetting("Kafka:BootstrapServers", _kafkaContainer.GetBootstrapAddress());

            builder.ConfigureTestServices(services =>
            {
                // Remove existing DbContextOptions
                services.RemoveAll(typeof(DbContextOptions<AmsDbContext>));
                services.RemoveAll(typeof(AmsDbContext));

                // Add test DbContext
                services.AddDbContext<AmsDbContext>(options =>
                {
                    options.UseNpgsql(_dbContainer.GetConnectionString());
                });

                // Mock Authentication to bypass Keycloak in tests
                services.AddAuthentication("Test")
                    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, TestAuthHandler>(
                        "Test", options => { });
                
                services.AddAuthorization(options =>
                {
                    options.DefaultPolicy = new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
                        .AddAuthenticationSchemes("Test")
                        .RequireAuthenticatedUser()
                        .Build();
                });
            });
        });

        // Apply EF migrations to the test database
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
        await db.Database.EnsureCreatedAsync();

        Client = Factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
        Client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Test");
    }

    public async Task DisposeAsync()
    {
        await _dbContainer.DisposeAsync();
        await _kafkaContainer.DisposeAsync();
        Factory?.Dispose();
        Client?.Dispose();
    }
}

// ---- Dummy Auth Handler for Testing ----
public class TestAuthHandler : Microsoft.AspNetCore.Authentication.AuthenticationHandler<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions> options,
        Microsoft.Extensions.Logging.ILoggerFactory logger,
        System.Text.Encodings.Web.UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<Microsoft.AspNetCore.Authentication.AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "test-user-id"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, "testuser"),
            new System.Security.Claims.Claim("preferred_username", "testuser")
        };
        var identity = new System.Security.Claims.ClaimsIdentity(claims, "Test");
        var principal = new System.Security.Claims.ClaimsPrincipal(identity);
        var ticket = new Microsoft.AspNetCore.Authentication.AuthenticationTicket(principal, "Test");

        return Task.FromResult(Microsoft.AspNetCore.Authentication.AuthenticateResult.Success(ticket));
    }
}
