using AMS.Infrastructure.Kafka;
using FluentAssertions;
using Xunit;

namespace AMS.Tests.Integration.Kafka;

public sealed class NormalizedAlarmEventJsonTests
{
    [Fact]
    public void Parse_reads_cookieOffset_from_flink_payload()
    {
        const string json = """
            {"schemaVersion":1,"eventType":"ALARM_STATE_UPSERT","eventId":"x","serverId":"7ce5ecbf-70c9-498d-b899-5c8bb7add383","sourceName":"FIC1001","conditionName":"PVLEVEL","cookieOffset":160580028,"severity":100,"priority":"LOW","category":"PROCESS","alarmEventKind":"CONDITION","conditionActive":true,"acknowledged":false,"quality":192,"eventTimeEpochMs":1,"activeTimeEpochMs":2,"serverReceivedEpochMs":3}
            """;

        var evt = NormalizedAlarmEventJson.Parse(json);

        evt.Should().NotBeNull();
        evt!.CookieOffset.Should().Be(160580028);
    }
}
