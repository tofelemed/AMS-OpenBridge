// CHG-025 — GET /api/v1/cpm/fleet/heatmap must carry EVERY monitored loop in scope (up to
// the server allowance) and say how many there are, because the Performance matrix pages
// and searches client-side over this payload. With the old default of 100 the lab's 230
// monitored loops were cut at "G13_LOOP_B" and PIC80140 could not be found.
//
// Runs end to end through the lab gateway (127.0.0.1:8081) with the bootstrap admin from
// infra/docker/.env (AUTH_BOOTSTRAP_PASSWORD). Skips nothing: if the stack is down it fails.
using System.Net.Http.Json;
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class FleetHeatmapApiTests
{
    private const string Gateway = "http://127.0.0.1:8081";

    private static async Task<HttpClient> LoggedInAsync()
    {
        var client = new HttpClient { BaseAddress = new Uri(Gateway), Timeout = TimeSpan.FromSeconds(60) };
        var password = Environment.GetEnvironmentVariable("AUTH_BOOTSTRAP_PASSWORD") ?? DotEnv("AUTH_BOOTSTRAP_PASSWORD") ?? "ChangeMe123!";
        var res = await client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password });
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    [Fact]
    public async Task Heatmap_serves_every_monitored_loop_in_scope_and_reports_the_total()
    {
        await using var db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await db.OpenConnectionAsync();
        var monitored = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM cpm.loop_registry WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE)");
        var lastById = await conn.ExecuteScalarAsync<string>(
            "SELECT loop_id FROM cpm.loop_registry WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE) ORDER BY loop_id DESC LIMIT 1");
        monitored.Should().BeGreaterThan(100, "the lab must exercise the old 100-row cut");

        using var client = await LoggedInAsync();
        using var doc = JsonDocument.Parse(await client.GetStringAsync("/api/v1/cpm/fleet/heatmap?windowKind=24h"));
        var root = doc.RootElement;

        root.GetProperty("total").GetInt32().Should().Be(monitored);
        root.GetProperty("count").GetInt32().Should().Be(monitored);
        root.GetProperty("truncated").GetBoolean().Should().BeFalse();
        root.GetProperty("loops").EnumerateArray().Select(l => l.GetProperty("loopId").GetString())
            .Should().Contain(lastById, "the loop that sorts last must be in the payload, or the matrix search cannot find it");
    }

    [Fact]
    public async Task Heatmap_honours_an_explicit_smaller_limit_and_says_it_is_truncated()
    {
        using var client = await LoggedInAsync();
        using var doc = JsonDocument.Parse(await client.GetStringAsync("/api/v1/cpm/fleet/heatmap?windowKind=24h&limit=5"));
        var root = doc.RootElement;

        root.GetProperty("count").GetInt32().Should().Be(5);
        root.GetProperty("truncated").GetBoolean().Should().BeTrue();
        root.GetProperty("total").GetInt32().Should().BeGreaterThan(5);
    }

    private static string? DotEnv(string name)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var envFile = Path.Combine(dir.FullName, "infra", "docker", ".env");
            if (File.Exists(envFile))
            {
                foreach (var line in File.ReadAllLines(envFile))
                    if (line.StartsWith(name + "=", StringComparison.Ordinal))
                        return line[(name.Length + 1)..].Trim().Trim('"');
                return null;
            }
            dir = dir.Parent;
        }
        return null;
    }
}
