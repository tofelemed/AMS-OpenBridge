using AMS.Domain.Alarms;
using FluentAssertions;
using Xunit;

namespace AMS.Tests.Integration.Alarms;

/// <summary>
/// ISA-18.2 alarm lifecycle rules, exercised directly against the domain entity.
///
/// These previously targeted an ActiveAlarm.CreateFromOpcEvent(OpcRawEvent) overload and
/// AckedByUsername / ShelveUntilEpochMs members that no longer exist, so the whole test
/// project failed to compile — and because CI referenced a non-existent AMS.sln, nothing
/// ever reported it. Rewritten against the current API and kept free of the Testcontainers
/// harness so the core state machine stays fast to verify.
/// </summary>
public class AlarmLifecycleTests
{
    private static ActiveAlarm NewAlarm(
        string sourceName = "Plant.Area1.TankLevel",
        string conditionName = "HI_HI",
        int severity = 900,
        bool conditionActive = true)
    {
        var now = DateTimeOffset.UtcNow;
        return ActiveAlarm.CreateFromOpcEvent(
            serverId:         Guid.NewGuid(),
            sourceName:       sourceName,
            eventType:        AlarmEventType.Condition,
            conditionName:    conditionName,
            subConditionName: null,
            message:          $"{conditionName} on {sourceName}",
            severity:         severity,
            priority:         AlarmPriority.High,
            category:         AlarmCategory.Process,
            conditionActive:  conditionActive,
            eventTime:        now,
            activeTime:       now);
    }

    [Fact]
    public void Acknowledge_SetsAcknowledgedAndRecordsOperator()
    {
        var alarm  = NewAlarm();
        var userId = Guid.NewGuid();

        var result = alarm.Acknowledge(userId, "Acknowledged by operator test", DateTimeOffset.UtcNow);

        result.IsSuccess.Should().BeTrue();
        alarm.Acknowledged.Should().BeTrue();
        alarm.AckedBy.Should().Be(userId);
        alarm.AckComment.Should().Be("Acknowledged by operator test");
    }

    [Fact]
    public void Acknowledge_IsRejected_WhenAlreadyAcknowledged()
    {
        var alarm = NewAlarm();
        alarm.Acknowledge(Guid.NewGuid(), "first", DateTimeOffset.UtcNow);

        var second = alarm.Acknowledge(Guid.NewGuid(), "second", DateTimeOffset.UtcNow);

        second.IsSuccess.Should().BeFalse();
    }

    [Fact]
    public void Shelve_SetsShelvedStateAndExpiry()
    {
        var alarm = NewAlarm("Plant.Area2.PumpVibration", "HI", 500);

        var result = alarm.Shelve(Guid.NewGuid(), durationMinutes: 60, comment: "Shelved for maintenance");

        result.IsSuccess.Should().BeTrue();
        alarm.IsShelved.Should().BeTrue();
        alarm.ShelveComment.Should().Be("Shelved for maintenance");
        alarm.ShelveUntil.Should().NotBeNull();
        alarm.ShelveUntil!.Value.Should().BeAfter(DateTimeOffset.UtcNow);
    }

    [Fact]
    public void Shelve_RequiresAComment_PerIsa182()
    {
        var alarm = NewAlarm();

        var result = alarm.Shelve(Guid.NewGuid(), durationMinutes: 30, comment: "  ");

        result.IsSuccess.Should().BeFalse();
        alarm.IsShelved.Should().BeFalse();
    }

    [Fact]
    public void Shelve_IsRejected_BeyondMaximumDuration()
    {
        var alarm = NewAlarm();

        var result = alarm.Shelve(Guid.NewGuid(), durationMinutes: 10_000, comment: "too long");

        result.IsSuccess.Should().BeFalse();
        alarm.IsShelved.Should().BeFalse();
    }

    [Fact]
    public void Acknowledge_IsRejected_WhileShelved()
    {
        var alarm = NewAlarm();
        alarm.Shelve(Guid.NewGuid(), durationMinutes: 60, comment: "maintenance");

        var result = alarm.Acknowledge(Guid.NewGuid(), "should not apply", DateTimeOffset.UtcNow);

        result.IsSuccess.Should().BeFalse();
        alarm.Acknowledged.Should().BeFalse();
    }
}
