using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AMS.Infrastructure.Migrations
{
    [DbContext(typeof(AMS.Infrastructure.Persistence.AmsDbContext))]
    [Migration("20260528000000_AddTimescaleDbHypertables")]
    public partial class AddTimescaleDbHypertables : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS alarms.historical_alarms (
                    id uuid NOT NULL,
                    server_id uuid NOT NULL,
                    source_name character varying(255) NOT NULL,
                    condition_name character varying(255) NOT NULL,
                    ""timestamp"" timestamp with time zone NOT NULL,
                    alarm_state character varying(64) NOT NULL,
                    priority integer NOT NULL,
                    event_type character varying(64) NOT NULL,
                    message text,
                    operator_id character varying(255),
                    PRIMARY KEY (id, ""timestamp"")
                );
            ");
            migrationBuilder.Sql(@"
                DO $ts$ BEGIN
                  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                    PERFORM create_hypertable('alarms.historical_alarms', 'timestamp', if_not_exists => TRUE);
                    ALTER TABLE alarms.historical_alarms SET (timescaledb.compress, timescaledb.compress_segmentby = 'source_name');
                    PERFORM add_retention_policy('alarms.historical_alarms', INTERVAL '5 years', if_not_exists => TRUE);
                  END IF;
                END $ts$;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("SELECT remove_retention_policy('alarms.historical_alarms', if_exists => TRUE);");
            migrationBuilder.Sql("DROP TABLE IF EXISTS alarms.historical_alarms;");
        }
    }
}
