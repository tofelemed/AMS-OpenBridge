using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "alarms");

            migrationBuilder.Sql("CREATE TYPE alarms.event_type AS ENUM ('Simple', 'Tracking', 'Condition');");
            migrationBuilder.Sql("CREATE TYPE alarms.alarm_priority AS ENUM ('Critical', 'High', 'Medium', 'Low', 'Diagnostic');");
            migrationBuilder.Sql("CREATE TYPE alarms.alarm_category AS ENUM ('Process', 'Equipment', 'Instrument', 'Safety', 'Environmental', 'System', 'OperatorAction', 'Communication');");
            migrationBuilder.Sql("CREATE TYPE alarms.alarm_state AS ENUM ('Normal', 'UnackedActive', 'AckedActive', 'UnackedCleared', 'Shelved', 'SuppressedByDesign', 'OutOfService');");

            migrationBuilder.Sql("CREATE CAST (character varying AS alarms.event_type) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (text AS alarms.event_type) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (character varying AS alarms.alarm_priority) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (text AS alarms.alarm_priority) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (character varying AS alarms.alarm_category) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (text AS alarms.alarm_category) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (character varying AS alarms.alarm_state) WITH INOUT AS IMPLICIT;");
            migrationBuilder.Sql("CREATE CAST (text AS alarms.alarm_state) WITH INOUT AS IMPLICIT;");


            migrationBuilder.CreateTable(
                name: "active_alarms",
                schema: "alarms",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    server_id = table.Column<Guid>(type: "uuid", nullable: false),
                    alarm_tag_id = table.Column<Guid>(type: "uuid", nullable: true),
                    source_name = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    event_type = table.Column<string>(type: "alarms.event_type", nullable: false),
                    condition_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    sub_condition_name = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    message = table.Column<string>(type: "text", nullable: true),
                    severity = table.Column<int>(type: "integer", nullable: false),
                    priority = table.Column<string>(type: "alarms.alarm_priority", nullable: false),
                    category = table.Column<string>(type: "alarms.alarm_category", nullable: false),
                    quality = table.Column<int>(type: "integer", nullable: false, defaultValue: 192),
                    alarm_state = table.Column<string>(type: "alarms.alarm_state", nullable: false),
                    condition_active = table.Column<bool>(type: "boolean", nullable: false),
                    acknowledged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    event_time = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: false),
                    active_time = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: false),
                    ack_time = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: true),
                    acked_by = table.Column<Guid>(type: "uuid", nullable: true),
                    ack_comment = table.Column<string>(type: "text", nullable: true),
                    server_received_at = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: false),
                    is_shelved = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    shelved_at = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: true),
                    shelved_by = table.Column<Guid>(type: "uuid", nullable: true),
                    shelve_until = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: true),
                    shelve_comment = table.Column<string>(type: "text", nullable: true),
                    is_suppressed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    suppressed_at = table.Column<DateTimeOffset>(type: "timestamp(3) with time zone", nullable: true),
                    suppressed_by = table.Column<Guid>(type: "uuid", nullable: true),
                    suppression_reason = table.Column<string>(type: "text", nullable: true),
                    is_out_of_service = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    correlation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    root_cause_alarm_id = table.Column<Guid>(type: "uuid", nullable: true),
                    is_root_cause = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    process_value = table.Column<double>(type: "double precision", nullable: true),
                    process_unit = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    opc_attributes = table.Column<string>(type: "jsonb", nullable: false),
                    custom_attributes = table.Column<string>(type: "jsonb", nullable: false),
                    kafka_offset = table.Column<long>(type: "bigint", nullable: true),
                    kafka_partition = table.Column<int>(type: "integer", nullable: true),
                    kafka_topic = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_active_alarms", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "idx_active_alarms_correlation",
                schema: "alarms",
                table: "active_alarms",
                column: "correlation_id",
                filter: "correlation_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "idx_active_alarms_event_time",
                schema: "alarms",
                table: "active_alarms",
                column: "event_time",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "idx_active_alarms_priority",
                schema: "alarms",
                table: "active_alarms",
                column: "priority");

            migrationBuilder.CreateIndex(
                name: "idx_active_alarms_server",
                schema: "alarms",
                table: "active_alarms",
                column: "server_id");

            migrationBuilder.CreateIndex(
                name: "idx_active_alarms_state",
                schema: "alarms",
                table: "active_alarms",
                column: "alarm_state");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "active_alarms",
                schema: "alarms");
        }
    }
}
