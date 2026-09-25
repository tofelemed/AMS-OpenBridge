// CHG-032 — shelving as a lifecycle of its own (ISA-18.2 §12), pure and clock-driven.
//
// The defect: a shelf was stored by overwriting ack_state, so shelving forgot the review,
// only an acknowledgement could end a shelf, and an expired shelf stayed "SHELVED" for ever.
// Now shelve / update / unshelve / acknowledge are independent decisions with an explicit
// refusal (status + reason) for every state they do not apply to.
using FluentAssertions;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class EventShelvingRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 20, 12, 0, 0, TimeSpan.Zero);
    private const int Max = 168;

    private static EpisodeOperatorState State(bool closed = false, string ack = "UNACKNOWLEDGED", string shelf = "NONE", DateTimeOffset? until = null) =>
        new(closed, ack, shelf, until);

    [Fact]
    public void Shelve_needs_an_open_episode_a_reason_and_an_expiry_inside_the_site_limit()
    {
        EventShelvingRules.Shelve(State(closed: true), Now.AddHours(1), "maintenance", Now, Max).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 409);
        EventShelvingRules.Shelve(State(), Now.AddHours(1), "  ", Now, Max).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 400 && d.Error!.Contains("reason"));
        EventShelvingRules.Shelve(State(), Now.AddMinutes(-1), "maintenance", Now, Max).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 400 && d.Error!.Contains("future"));
        EventShelvingRules.Shelve(State(), Now.AddHours(Max + 1), "maintenance", Now, Max).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 400 && d.Error!.Contains("168"));
        EventShelvingRules.Shelve(State(), Now.AddHours(Max), "maintenance", Now, Max).Accepted.Should().BeTrue("the limit itself is allowed");
    }

    [Fact]
    public void Shelve_is_recorded_as_an_update_only_while_a_shelf_is_active()
    {
        EventShelvingRules.Shelve(State(), Now.AddHours(8), "known disturbance", Now, Max).Action.Should().Be(ShelfAction.Shelved);
        EventShelvingRules.Shelve(State(shelf: "SHELVED", until: Now.AddHours(2)), Now.AddHours(8), "extend", Now, Max).Action.Should().Be(ShelfAction.ShelveUpdated);
        // an expired shelf is over: shelving again is a new shelf, not an update of the old one
        EventShelvingRules.Shelve(State(shelf: "EXPIRED", until: Now.AddHours(-2)), Now.AddHours(8), "again", Now, Max).Action.Should().Be(ShelfAction.Shelved);
        // an acknowledged episode can be shelved: review and suppression are separate facts
        EventShelvingRules.Shelve(State(ack: "ACKNOWLEDGED"), Now.AddHours(8), "awaiting VP mapping", Now, Max).Action.Should().Be(ShelfAction.Shelved);
    }

    [Fact]
    public void Unshelve_applies_to_active_and_expired_shelves_and_to_legacy_rows_only()
    {
        EventShelvingRules.Unshelve(State(), Now).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 409);
        EventShelvingRules.Unshelve(State(ack: "ACKNOWLEDGED"), Now).Accepted.Should().BeFalse();
        EventShelvingRules.Unshelve(State(shelf: "SHELVED", until: Now.AddHours(1)), Now).Action.Should().Be(ShelfAction.Unshelved);
        EventShelvingRules.Unshelve(State(shelf: "EXPIRED", until: Now.AddHours(-1)), Now).Action.Should().Be(ShelfAction.Unshelved);
        // a row script 60 has not converted yet still carries the shelf in ack_state
        EventShelvingRules.Unshelve(State(ack: "SHELVED", until: Now.AddHours(1)), Now).Action.Should().Be(ShelfAction.Unshelved);
    }

    [Fact]
    public void Acknowledge_is_independent_of_the_shelf_and_refuses_a_second_review()
    {
        EventShelvingRules.Acknowledge(State()).Action.Should().Be(ShelfAction.Acknowledged);
        EventShelvingRules.Acknowledge(State(closed: true)).Accepted.Should().BeTrue("a closed, unreviewed episode is still an unreviewed finding");
        EventShelvingRules.Acknowledge(State(shelf: "SHELVED", until: Now.AddHours(1))).Accepted.Should().BeTrue("reviewing a shelved episode does not end the shelf");
        EventShelvingRules.Acknowledge(State(ack: "ACKNOWLEDGED")).Should().Match<ShelfDecision>(d => !d.Accepted && d.Status == 409);
    }

    [Fact]
    public void An_active_shelf_is_one_whose_expiry_is_still_ahead_whatever_column_holds_it()
    {
        EventShelvingRules.IsActiveShelf(State(shelf: "SHELVED", until: Now.AddMinutes(1)), Now).Should().BeTrue();
        EventShelvingRules.IsActiveShelf(State(shelf: "SHELVED", until: Now.AddMinutes(-1)), Now).Should().BeFalse("the sweeper has not run yet, but the shelf is over");
        EventShelvingRules.IsActiveShelf(State(shelf: "EXPIRED", until: Now.AddMinutes(-1)), Now).Should().BeFalse();
        EventShelvingRules.IsActiveShelf(State(ack: "SHELVED", until: Now.AddMinutes(1)), Now).Should().BeTrue("legacy row");
        EventShelvingRules.IsActiveShelf(State(shelf: "SHELVED", until: null), Now).Should().BeFalse("no expiry recorded");
    }
}
