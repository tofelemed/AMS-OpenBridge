// CHG-225 (owner, 23 Nov 2026): every class pack, resolved the way a new draft starts (factory + the pack), must pass
// Validate. TEMP_SLOW_SELF_REG and PRESSURE_VAPOUR_SLOW set G9.role PRIMARY, which Validate forbids (R07: phase geometry is
// never decisive on its own), so no loop or class bundle for temperature or vapour-pressure loops could be approved.
using System.Text.Json;
using FluentAssertions;
using Traverse.CplmApi.Config;
using Traverse.CplmApi.Services.Config;
using Xunit;

namespace Traverse.CplmApi.Tests;

public class ClassPackValidityTests
{
    // CHG-225 also: the UNKNOWN pack allowed G5 periods up to 24 h with 5 cycles (5 days of history; the long windows keep
    // 24 h), so it failed Validate too; its longest period is now 4.8 h.
    public static IEnumerable<object[]> Packs() => FactoryLayers.ProfileIds().Select(p => new object[] { p });

    [Theory]
    [MemberData(nameof(Packs))]
    public void A_new_draft_on_every_class_pack_passes_validation(string profileId)
    {
        var layers = FactoryLayers.InitialLayers("e2e-pack-site", "PROFILE", profileId, null);
        var resolution = ConfigStore.Resolve(layers);
        using var resolved = JsonDocument.Parse(resolution.ResolvedJson);
        var report = BundleValidator.Report(resolved.RootElement.GetProperty("properties"), resolved.RootElement.GetProperty("execution_plan"));
        report.Errors.Should().BeEmpty($"the {profileId} pack must be approvable as it ships");
    }

    [Theory]
    [InlineData("TEMP_SLOW_SELF_REG")]
    [InlineData("PRESSURE_VAPOUR_SLOW")]
    public void The_slow_packs_let_geometry_support_but_never_decide(string profileId)
    {
        FactoryLayers.Profile(profileId)!.Value.GetProperty("G9.role").GetString().Should().Be("SUPPORTING");
    }
}
