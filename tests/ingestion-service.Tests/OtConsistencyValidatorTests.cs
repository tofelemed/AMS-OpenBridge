using Traverse.IngestionService.Pipeline;
using Xunit;

namespace Traverse.Tests.IngestionService;

public class OtConsistencyValidatorTests
{
    private static readonly OtTopicIdentity Topic = new("HDPE", "FCS0101", "Flow", "FIC10302", "PV");

    private static OtLoopPayload Payload(string? device = "FIC10302", string? equipment = "FIC10302",
        string? area = "FCS0101", string? site = "HDPE", string? item = "PV") =>
        new(1.0, "1.0", "", "GOOD", 1, "opc_ua", 0, device, area, "Flow", site, "Flow", equipment, item);

    [Fact]
    public void Matching_identity_passes() =>
        Assert.True(OtConsistencyValidator.Validate(Topic, Payload(), out _, out _));

    [Fact]
    public void Case_differences_pass() =>
        Assert.True(OtConsistencyValidator.Validate(Topic, Payload(device: "fic10302", site: "hdpe"), out _, out _));

    [Fact]
    public void Absent_payload_identity_passes_topic_is_authoritative() =>
        Assert.True(OtConsistencyValidator.Validate(Topic,
            Payload(device: null, equipment: null, area: null, site: null, item: null), out _, out _));

    [Theory]
    [InlineData("FIC10303", "FIC10302", "PV", "LOOP_IDENTITY_MISMATCH")] // device contradicts
    [InlineData("FIC10302", "FIC10303", "PV", "LOOP_IDENTITY_MISMATCH")] // equipment contradicts
    [InlineData("FIC10302", "FIC10302", "SP", "PARAMETER_MISMATCH")]     // item contradicts
    public void Contradictions_fail_with_reason(string device, string equipment, string item, string expected)
    {
        Assert.False(OtConsistencyValidator.Validate(Topic,
            Payload(device: device, equipment: equipment, item: item), out var reason, out var detail));
        Assert.Equal(expected, reason);
        Assert.NotNull(detail);
    }

    [Fact]
    public void Wrong_site_or_fcs_fails()
    {
        Assert.False(OtConsistencyValidator.Validate(Topic, Payload(site: "LDPE"), out var r1, out _));
        Assert.Equal(DlqReasons.LoopIdentityMismatch, r1);
        Assert.False(OtConsistencyValidator.Validate(Topic, Payload(area: "FCS0102"), out var r2, out _));
        Assert.Equal(DlqReasons.LoopIdentityMismatch, r2);
    }
}
