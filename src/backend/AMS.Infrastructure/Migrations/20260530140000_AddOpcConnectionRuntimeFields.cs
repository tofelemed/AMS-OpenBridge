using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AMS.Infrastructure.Migrations;

[DbContext(typeof(AMS.Infrastructure.Persistence.AmsDbContext))]
[Migration("20260530140000_AddOpcConnectionRuntimeFields")]
public partial class AddOpcConnectionRuntimeFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "auth_type",
            schema: "configuration",
            table: "opc_connections",
            type: "character varying(32)",
            maxLength: 32,
            nullable: false,
            defaultValue: "Anonymous");

        migrationBuilder.AddColumn<string>(
            name: "pipeline_status",
            schema: "configuration",
            table: "opc_connections",
            type: "character varying(32)",
            maxLength: 32,
            nullable: false,
            defaultValue: "Stopped");

        migrationBuilder.AddColumn<double>(
            name: "events_per_sec",
            schema: "configuration",
            table: "opc_connections",
            type: "double precision",
            nullable: false,
            defaultValue: 0.0);

        migrationBuilder.AddColumn<DateTimeOffset>(
            name: "last_event_utc",
            schema: "configuration",
            table: "opc_connections",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "auth_type", schema: "configuration", table: "opc_connections");
        migrationBuilder.DropColumn(name: "pipeline_status", schema: "configuration", table: "opc_connections");
        migrationBuilder.DropColumn(name: "events_per_sec", schema: "configuration", table: "opc_connections");
        migrationBuilder.DropColumn(name: "last_event_utc", schema: "configuration", table: "opc_connections");
    }
}
