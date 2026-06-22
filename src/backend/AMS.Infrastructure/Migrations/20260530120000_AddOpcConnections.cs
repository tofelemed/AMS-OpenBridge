using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AMS.Infrastructure.Migrations;

[DbContext(typeof(AMS.Infrastructure.Persistence.AmsDbContext))]
[Migration("20260530120000_AddOpcConnections")]
public partial class AddOpcConnections : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.EnsureSchema(name: "configuration");

        migrationBuilder.CreateTable(
            name: "opc_connections",
            schema: "configuration",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                protocol = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                endpoint = table.Column<string>(type: "text", nullable: false),
                username = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                password_encrypted = table.Column<byte[]>(type: "bytea", nullable: true),
                enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "Disconnected"),
                last_connected_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                last_error = table.Column<string>(type: "text", nullable: true),
                streampipes_adapter_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                streampipes_pipeline_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                streampipes_ack_pipeline_id = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                created_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                updated_utc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("pk_opc_connections", x => x.id));

        migrationBuilder.CreateIndex(
            name: "idx_opc_connections_name",
            schema: "configuration",
            table: "opc_connections",
            column: "name",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "idx_opc_connections_enabled",
            schema: "configuration",
            table: "opc_connections",
            column: "enabled");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "opc_connections", schema: "configuration");
    }
}
