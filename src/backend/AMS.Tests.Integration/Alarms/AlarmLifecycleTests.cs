using System.Net.Http.Json;
using AMS.Application.Alarms.Commands;
using AMS.Domain.Alarms;
using AMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AMS.Tests.Integration.Alarms;

public class AlarmLifecycleTests : TestBase
{
    [Fact]
    public async Task AcknowledgeAlarm_ShouldUpdateStateAndRecordAudit()
    {
        // Arrange
        var alarmId = Guid.NewGuid().ToString();
        var alarm = ActiveAlarm.CreateFromOpcEvent(new OpcRawEvent
        {
            EventId = alarmId,
            ServerId = Guid.NewGuid().ToString(),
            SourceName = "Plant.Area1.TankLevel",
            ConditionName = "HI_HI",
            Severity = 900,
            EventTimeEpochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ConditionActive = true,
            AckRequired = true
        });

        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
            db.ActiveAlarms.Add(alarm);
            await db.SaveChangesAsync();
        }

        var command = new AcknowledgeAlarmCommand(alarmId, "Acknowledged by operator test");

        // Act
        var response = await Client.PostAsJsonAsync($"/api/v1/alarms/{alarmId}/acknowledge", command);

        // Assert
        response.IsSuccessStatusCode.Should().BeTrue();

        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
            var updatedAlarm = await db.ActiveAlarms.FindAsync(alarmId);

            updatedAlarm.Should().NotBeNull();
            updatedAlarm!.Acknowledged.Should().BeTrue();
            updatedAlarm.AckComment.Should().Be("Acknowledged by operator test");
            updatedAlarm.AckedByUsername.Should().Be("testuser");
            updatedAlarm.State.Should().Be("ACKNOWLEDGED_UNCLEARED");
        }
    }

    [Fact]
    public async Task ShelveAlarm_ShouldSetShelvedStateAndComment()
    {
        // Arrange
        var alarmId = Guid.NewGuid().ToString();
        var alarm = ActiveAlarm.CreateFromOpcEvent(new OpcRawEvent
        {
            EventId = alarmId,
            ServerId = Guid.NewGuid().ToString(),
            SourceName = "Plant.Area2.PumpVibration",
            ConditionName = "HI",
            Severity = 500,
            EventTimeEpochMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            ConditionActive = true,
            AckRequired = true
        });

        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
            db.ActiveAlarms.Add(alarm);
            await db.SaveChangesAsync();
        }

        var shelveDurationMins = 60;
        var command = new ShelveAlarmCommand(alarmId, shelveDurationMins, "Shelved for maintenance");

        // Act
        var response = await Client.PostAsJsonAsync($"/api/v1/alarms/{alarmId}/shelve", command);

        // Assert
        response.IsSuccessStatusCode.Should().BeTrue();

        using (var scope = Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
            var updatedAlarm = await db.ActiveAlarms.FindAsync(alarmId);

            updatedAlarm.Should().NotBeNull();
            updatedAlarm!.IsShelved.Should().BeTrue();
            updatedAlarm.ShelveComment.Should().Be("Shelved for maintenance");
            updatedAlarm.State.Should().Be("SHELVED");
            updatedAlarm.ShelveUntilEpochMs.Should().NotBeNull();
        }
    }
}

// ---- Duplicate OpcRawEvent for tests since AMS.Domain.Alarms namespace doesn't reference the gateway DTO directly ----
// (In a real project, this would be a shared DTO in a Common library)
public class OpcRawEvent
{
    public string EventId { get; set; } = string.Empty;
    public string ServerId { get; set; } = string.Empty;
    public string ServerName { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
    public string ConditionName { get; set; } = string.Empty;
    public string SubConditionName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int Severity { get; set; }
    public long EventTimeEpochMs { get; set; }
    public bool ConditionActive { get; set; }
    public bool AckRequired { get; set; }
    public Dictionary<string, object> Attributes { get; set; } = new();
}
