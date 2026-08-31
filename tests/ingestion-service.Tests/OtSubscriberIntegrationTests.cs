using System.Collections.Concurrent;
using System.Net.Sockets;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using Npgsql;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Traverse.IngestionService.Services;
using Xunit;
using Xunit.Abstractions;

namespace Traverse.Tests.IngestionService;

/// <summary>
/// End-to-end subscriber test against a live MQTT broker (the compose mosquitto-test
/// service). Start it first:
///     docker compose -f infra/docker/docker-compose.yml --profile mqtt-test up -d mosquitto-test
/// When localhost:1884 is not accepting connections the test reports itself as a
/// no-op (there is no runtime-skip in plain xUnit) — the E2E script is the gate
/// that always runs it with the broker up.
/// </summary>
[Trait("Category", "Integration")]
public class OtSubscriberIntegrationTests
{
    private const string BrokerHost = "127.0.0.1";
    private const int BrokerPort = 1884;
    private const string BrokerUser = "ams_ingest";
    private const string BrokerPass = "ams-ingest-test";

    private readonly ITestOutputHelper _output;
    public OtSubscriberIntegrationTests(ITestOutputHelper output) => _output = output;

    private sealed class RecordingSink : ILoopSampleSink
    {
        public readonly ConcurrentBag<LoopTuple> Tuples = new();
        public readonly ConcurrentBag<(string Key, DeadLetterRecord Record)> DeadLetters = new();
        public bool Enabled => true;
        public Task PublishTupleAsync(LoopTuple tuple, CancellationToken ct)
        { Tuples.Add(tuple); return Task.CompletedTask; }
        public Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct)
        { DeadLetters.Add((key, record)); return Task.CompletedTask; }
    }

    private static bool BrokerReachable()
    {
        try
        {
            using var tcp = new TcpClient();
            return tcp.ConnectAsync(BrokerHost, BrokerPort).Wait(1500);
        }
        catch { return false; }
    }

    private static string Envelope(string fcs, string cls, string loop, string item, double value) =>
        $$"""
        {"value": {{value.ToString(System.Globalization.CultureInfo.InvariantCulture)}}, "unit": "",
         "quality": "GOOD", "ts": "{{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ss.fffZ}}",
         "source": "opc_ua", "seq": 0, "device": "{{loop}}", "area": "{{fcs}}", "line": "{{cls}}",
         "enterprise": "", "site": "HDPE", "process_unit": "{{cls}}", "equipment": "{{loop}}", "item": "{{item}}"}
        """;

    [Fact]
    public async Task Registered_loop_emits_tuples_and_unknown_loop_parks()
    {
        if (!BrokerReachable())
        {
            _output.WriteLine($"SKIPPED: no MQTT broker at {BrokerHost}:{BrokerPort} — start mosquitto-test (--profile mqtt-test)");
            return;
        }

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Services:CplmApi"] = "http://127.0.0.1:1",   // unreachable — the pre-seeded cache must survive
            ["Auth:ServiceKey"] = "integration-test",
        }).Build();
        // Lazy data source pointing nowhere: flush/touch failures are caught + logged by design.
        var deadDb = NpgsqlDataSource.Create("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x;Timeout=1");

        var row = new DataSourceRow
        {
            ConfigId = Guid.NewGuid(),
            Name = "integration-test",
            ProfileType = "MQTT_LOOP_SAMPLES",
            ConnectionUrl = $"mqtt://{BrokerHost}:{BrokerPort}",
            Username = BrokerUser,
            TimeoutSeconds = 10,
            ProfileConfig = """{"mqtt":{"topics":["OT/+/+/+/+/PIDParams/+"],"qos":1}}""",
        };
        var settings = new LoopIngestConfig
        {
            GridSeconds = 1,                                  // fast tuples for the test
            ModeValueMap = new() { ["4"] = "AUT" },
        }.Resolve();
        var registry = new LoopRegistryCache(new[]
        {
            new RegistryLoop("FIC10302", null, "hdpe", "section_100", "u1001_polymerization_reactor_1", "FIC", true),
        });
        var sink = new RecordingSink();
        var status = new SubscriberStatus { ConfigId = row.ConfigId, Name = row.Name };

        await using var subscriber = new OtLoopSubscriber(row, BrokerPass, settings,
            new[] { "OT/+/+/+/+/PIDParams/+" }, qos: 1,
            new CplmRegistryClient(new HttpClient(), config), sink,
            new UnknownSourceInventory(), new UnknownSourceRepository(deadDb),
            new DataSourceRepository(deadDb), status, NullLogger.Instance, registry);
        await subscriber.StartAsync(CancellationToken.None);

        // Publish through a plain client: the 4 fast params for a REGISTERED loop and
        // PV for an UNREGISTERED one (FIC99999) — twice, a second apart, so the joiner
        // sees fresh values across grid ticks.
        var publisher = new MqttFactory().CreateMqttClient();
        await publisher.ConnectAsync(new MqttClientOptionsBuilder()
            .WithTcpServer(BrokerHost, BrokerPort)
            .WithCredentials(BrokerUser, BrokerPass)
            .WithClientId($"it-pub-{Guid.NewGuid():N}")
            .Build());
        for (var round = 0; round < 3; round++)
        {
            foreach (var (item, value) in new[] { ("PV", 60.5), ("SP", 63.0), ("OP", 33.9), ("MODE", 4.0) })
                await Publish(publisher, $"OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/{item}",
                    Envelope("FCS0101", "Flow", "FIC10302", item, value));
            await Publish(publisher, "OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV",
                Envelope("FCS0101", "Flow", "FIC99999", "PV", 10.0));
            await Task.Delay(1000);
        }

        // Wait for at least one tuple + one parked dead letter (≤ 15 s).
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline &&
               (!sink.Tuples.Any(t => t.LoopId == "FIC10302") ||
                !sink.DeadLetters.Any(d => d.Record.Reason == DlqReasons.LoopNotRegistered)))
            await Task.Delay(250);

        await publisher.DisconnectAsync();

        var tuple = Assert.Single(sink.Tuples.Where(t => t.LoopId == "FIC10302").Take(1));
        Assert.Equal(60.5, tuple.Pv);
        Assert.Equal(63.0, tuple.Sp);
        Assert.Equal(33.9, tuple.Op);
        Assert.Equal("AUT", tuple.Mode);
        Assert.Equal("GOOD", tuple.Quality);
        Assert.Equal("FIC", tuple.LoopType);
        Assert.Equal("hdpe", tuple.Site);
        Assert.Equal("FCS0101", tuple.SourceFcs);

        var parked = sink.DeadLetters.First(d => d.Record.Reason == DlqReasons.LoopNotRegistered);
        Assert.Contains("FIC99999", parked.Key);
        Assert.True(status.MessagesReceived >= 5);
    }

    private static Task Publish(IMqttClient client, string topic, string payload) =>
        client.PublishAsync(new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(payload))
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .Build());
}
