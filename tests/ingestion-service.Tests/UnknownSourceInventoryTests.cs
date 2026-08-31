using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class UnknownSourceInventoryTests
{
    [Fact]
    public void Aggregates_counts_per_config_reason_source()
    {
        var inv = new UnknownSourceInventory();
        var cfg = Guid.NewGuid();
        for (var i = 0; i < 5; i++)
            inv.Record(cfg, "LOOP_NOT_REGISTERED", "HDPE|FCS0101|FIC99999",
                "OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV", """{"value":1}""");
        inv.Record(cfg, "UNKNOWN_PARAMETER", "FIC10302|XYZ", "OT/.../XYZ", """{"value":2}""");

        var rows = inv.DrainPending();
        Assert.Equal(2, rows.Count);
        var loops = rows.Single(r => r.Reason == "LOOP_NOT_REGISTERED");
        Assert.Equal(5, loops.MessageCount);
        Assert.Equal("HDPE|FCS0101|FIC99999", loops.SourceKey);
        Assert.Equal("""{"value":1}""", loops.LastPayload);
        Assert.Empty(inv.DrainPending()); // drained
    }

    [Fact]
    public void Different_configs_do_not_merge()
    {
        var inv = new UnknownSourceInventory();
        inv.Record(Guid.NewGuid(), "LOOP_NOT_REGISTERED", "K", "t", "{}");
        inv.Record(Guid.NewGuid(), "LOOP_NOT_REGISTERED", "K", "t", "{}");
        Assert.Equal(2, inv.DrainPending().Count);
    }

    [Fact]
    public void Truncates_oversized_source_keys_to_column_limit()
    {
        var inv = new UnknownSourceInventory();
        inv.Record(Guid.NewGuid(), "UNKNOWN_PARAMETER", new string('x', 400), "t", "{}");
        Assert.True(inv.DrainPending().Single().SourceKey.Length <= 256);
    }
}
