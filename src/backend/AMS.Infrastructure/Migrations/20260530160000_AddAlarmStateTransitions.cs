using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace AMS.Infrastructure.Migrations;

[DbContext(typeof(AMS.Infrastructure.Persistence.AmsDbContext))]
[Migration("20260530160000_AddAlarmStateTransitions")]
public partial class AddAlarmStateTransitions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS alarms.alarm_state_transitions (
                id                  BIGSERIAL,
                alarm_id            UUID NOT NULL,
                server_id           UUID NOT NULL,
                source_name         VARCHAR(1024) NOT NULL,
                from_state          alarms.alarm_state,
                to_state            alarms.alarm_state NOT NULL,
                transition_time     TIMESTAMPTZ(3) NOT NULL,
                triggered_by        UUID,
                trigger_reason      VARCHAR(512),
                comment             TEXT,
                kafka_offset        BIGINT,
                created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (id, transition_time)
            );
            """);

        migrationBuilder.Sql("""
            SELECT create_hypertable(
                'alarms.alarm_state_transitions',
                'transition_time',
                chunk_time_interval => INTERVAL '1 day',
                if_not_exists => TRUE);
            """);

        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS idx_transitions_alarm
                ON alarms.alarm_state_transitions(alarm_id, transition_time DESC);
            CREATE INDEX IF NOT EXISTS idx_transitions_server
                ON alarms.alarm_state_transitions(server_id, transition_time DESC);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE IF EXISTS alarms.alarm_state_transitions;");
    }
}
