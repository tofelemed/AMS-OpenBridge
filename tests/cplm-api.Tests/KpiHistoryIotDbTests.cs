using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.BackgroundServices;
using Traverse.CplmApi.Infrastructure;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>
/// CHG-102 Phase 2 against a REAL IoTDB laid out by infra/docker/iotdb-layout-v2.sh into scratch
/// databases (set IOTDB_TEST_URL, IOTDB_TEST_PASSWORD, IOTDB_TEST_KPI_DB, IOTDB_TEST_KPIS_DB;
/// skipped otherwise). Real result payloads come from the lab's traverse_cplm (CPLM_TEST_DB).
/// Proves: every live row is accepted by the templates, nothing auto-extends a template, values
/// round-trip, and a re-delivery overwrites the same point.
/// </summary>
[Trait("Category", "Integration")]
public class KpiHistoryIotDbTests
{
    private static readonly string? Url = Environment.GetEnvironmentVariable("IOTDB_TEST_URL");
    private static readonly string Pw = Environment.GetEnvironmentVariable("IOTDB_TEST_PASSWORD") ?? "root";
    private static readonly string KpiDb = Environment.GetEnvironmentVariable("IOTDB_TEST_KPI_DB") ?? "root.p0test_kpi";
    private static readonly string KpisDb = Environment.GetEnvironmentVariable("IOTDB_TEST_KPIS_DB") ?? "root.p0test_kpis";

    private static (KpiHistoryConsumerService Svc, KpiHistoryStats Stats, CplmOptions Cplm) Build()
    {
        var iotOpts = new IotDbWriteOptions
            { RestUrl = Url!, Password = Pw, Layout = "v2", KpiDatabase = KpiDb, ShortKpiDatabase = KpisDb };
        var sp = new ServiceCollection().AddHttpClient().BuildServiceProvider();
        var client = new IotDbWriteClient(sp.GetRequiredService<IHttpClientFactory>(), Options.Create(iotOpts),
            NullLogger<IotDbWriteClient>.Instance);
        var cplm = new CplmOptions();
        var stats = new KpiHistoryStats();
        var svc = new KpiHistoryConsumerService(NullLogger<KpiHistoryConsumerService>.Instance,
            Options.Create(new KafkaOptions { BootstrapServers = "unused:9092" }), Options.Create(cplm),
            Options.Create(iotOpts), client, new ConsumerHeartbeat(), stats);
        return (svc, stats, cplm);
    }

    private static async Task<JsonElement> Query(string sql)
    {
        using var http = new HttpClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.ASCII.GetBytes($"root:{Pw}")));
        var res = await http.PostAsync($"{Url}/rest/v2/query",
            new StringContent(JsonSerializer.Serialize(new { sql }), Encoding.UTF8, "application/json"));
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task Real_live_results_land_in_the_templates_without_extending_them()
    {
        if (string.IsNullOrEmpty(Url) || string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CPLM_TEST_DB")))
            return;   // needs the lab: IOTDB_TEST_URL + CPLM_TEST_DB
        var (svc, stats, cplm) = Build();

        await using var db = new NpgsqlConnection(Environment.GetEnvironmentVariable("CPLM_TEST_DB"));
        var batches = new (string Topic, string Table)[]
        {
            (cplm.GateResultsTopic, "cplm_gate_results"),
            (cplm.ShortFeatureTopic, "cplm_short_feature_results"),
            (cplm.LongFeatureTopic, "cplm_long_feature_results"),
        };
        var written = 0;
        foreach (var (topic, table) in batches)
        {
            var payloads = (await db.QueryAsync<string>(
                $"select payload::text from analytics.{table} where purpose = 'LIVE' order by created_at desc limit 150")).ToList();
            Assert.NotEmpty(payloads);
            foreach (var p in payloads)
            {
                var outcome = await svc.WriteAsync(topic, p, CancellationToken.None);
                Assert.Equal(IotDbWriteOutcome.Ok, outcome);
            }
            written += payloads.Count;
        }
        Assert.Equal(0, stats.Rejected);
        Assert.True(stats.Written > 0);

        // No template was auto-extended: every series name is a template measurement.
        var allowed = KpiHistoryMapper.GateNumeric.Concat(KpiHistoryMapper.GateText)
            .Concat(KpiHistoryMapper.LongNumeric).Concat(KpiHistoryMapper.LongText)
            .Concat(KpiHistoryMapper.ShortNumeric).Concat(KpiHistoryMapper.ShortText).ToHashSet();
        foreach (var dbName in new[] { KpiDb, KpisDb })
        {
            var ts = await Query($"show timeseries {dbName}.**");
            foreach (var path in ts.GetProperty("values")[0].EnumerateArray())
            {
                var s = path.GetString()!;
                if (s.Contains(".m1.")) continue;   // 1-minute rollup template
                Assert.Contains(s[(s.LastIndexOf('.') + 1)..], allowed);
            }
        }
    }

    [Fact]
    public async Task A_redelivery_overwrites_the_same_point_and_non_live_rows_are_not_written()
    {
        if (string.IsNullOrEmpty(Url)) return;   // needs IOTDB_TEST_URL
        var (svc, stats, cplm) = Build();
        const string json = """
            {"loop_id":"P0TEST_LOOP","window_kind":"12h","windowEndMs":1700000000000,"purpose":"LIVE",
             "sample_count":8640,"mae":1.25,"diagnosis":"HEALTHY","gate0_status":"PASS","jarSha256":"abcdef0123456789"}
            """;
        Assert.Equal(IotDbWriteOutcome.Ok, await svc.WriteAsync(cplm.GateResultsTopic, json, CancellationToken.None));
        Assert.Equal(IotDbWriteOutcome.Ok, await svc.WriteAsync(cplm.GateResultsTopic, json.Replace("1.25", "2.5"), CancellationToken.None));
        var shadow = json.Replace("\"LIVE\"", "\"SHADOW\"").Replace("1.25", "99");
        Assert.Equal(IotDbWriteOutcome.Ok, await svc.WriteAsync(cplm.GateResultsTopic, shadow, CancellationToken.None));
        Assert.Equal(1, stats.Skipped);

        var r = await Query($"select mae, diagnosis, g0, engine from {KpiDb}.gate_12h.P0TEST_LOOP");
        Assert.Equal(1, r.GetProperty("timestamps").GetArrayLength());
        var cols = r.GetProperty("expressions").EnumerateArray().Select(e => e.GetString()!).ToList();
        var vals = r.GetProperty("values");
        Assert.Equal(2.5, vals[cols.FindIndex(c => c.EndsWith(".mae"))][0].GetDouble());
        Assert.Equal("PASS", vals[cols.FindIndex(c => c.EndsWith(".g0"))][0].GetString());
        Assert.Equal("abcdef012345", vals[cols.FindIndex(c => c.EndsWith(".engine"))][0].GetString());
    }
}
