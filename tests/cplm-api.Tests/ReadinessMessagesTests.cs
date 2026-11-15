// CHG-203: the linked-loops readiness message (the editor's saved-readiness ? and Loop Explorer's readiness causes show it as
// sent) named the old button "Re-project links & republish evidence". It now names "Resend to analysis", in the one plain
// sentence the Loop Registry uses: links come from the plant model and reach the analysis through Resend to analysis, or the
// loop is declared stand-alone with Interacting loops set to Not applicable in Edit loop.
using FluentAssertions;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services.Registry;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ReadinessMessagesTests
{
    [Fact]
    public void Missing_links_name_Resend_to_analysis_in_the_registry_words()
    {
        CpmReadinessController.PeerLinksMessage(InputState.ExpectedUnmapped).Should().Be(
            "Link its interacting loops in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop.");
        CpmReadinessController.PeerLinksMessage(InputState.ExpectedUnmapped).Should().NotContainAny("Re-project", "republish", "asset model");
    }

    [Fact]
    public void A_declared_stand_alone_loop_keeps_its_note_and_a_linked_loop_has_none()
    {
        CpmReadinessController.PeerLinksMessage(InputState.NotApplicable).Should().Be("No interacting loops (declared) — peer interaction is not assessed.");
        CpmReadinessController.PeerLinksMessage(InputState.NotInstalled).Should().Be("No interacting loops (declared) — peer interaction is not assessed.");
        CpmReadinessController.PeerLinksMessage(InputState.Available).Should().BeNull();
    }
}
