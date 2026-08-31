using System.Text.Json;
using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class DeadLetterRecordTests
{
    [Fact]
    public void Envelope_serializes_snake_case_with_raw_payload()
    {
        var id = Guid.NewGuid();
        var rec = new DeadLetterRecord("LOOP_NOT_REGISTERED", id,
            "OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV", """{"value":1}""", 123L, "no registry row");
        using var doc = JsonDocument.Parse(rec.ToJson());
        var r = doc.RootElement;
        Assert.Equal("LOOP_NOT_REGISTERED", r.GetProperty("reason").GetString());
        Assert.Equal(id.ToString(), r.GetProperty("config_id").GetString());
        Assert.Equal("OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV", r.GetProperty("mqtt_topic").GetString());
        Assert.Equal("""{"value":1}""", r.GetProperty("payload").GetString());
        Assert.Equal(123L, r.GetProperty("received_at_ms").GetInt64());
        Assert.Equal("no registry row", r.GetProperty("detail").GetString());
    }

    [Fact]
    public void Null_detail_serializes_as_null_not_missing()
    {
        var rec = new DeadLetterRecord("MALFORMED_JSON", Guid.NewGuid(), "t", "x", 1, null);
        using var doc = JsonDocument.Parse(rec.ToJson());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("detail").ValueKind);
    }
}
