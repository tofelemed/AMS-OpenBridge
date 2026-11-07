// CHG-146: the registry counts behind the Overview gap numbers. A retired loop (is_active = FALSE) is not counted.
using Traverse.CplmApi.Services.Registry;

namespace Traverse.CplmApi.Data;

public static class FleetRegistrySummarySql
{
    public const string Registry = $"""
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))::int AS monitored,
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE))::int AS with_peer_links,
                   COUNT(*) FILTER (WHERE tags ? 'vp')::int AS with_vp,
                   -- the Diagnostic capability tile: its drill-down lists the monitored loops (FleetKpiSql.Rows), so the count is monitored loops only
                   COUNT(*) FILTER (WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE)
                                    AND NOT (tags ? 'vp') AND {OptionalInputs.VpApplicabilitySql} = 'EXPECTED')::int AS vp_expected_unmapped,
                   COUNT(*) FILTER (WHERE NOT (tags ? 'vp') AND {OptionalInputs.VpApplicabilitySql} = 'NOT_INSTALLED')::int AS vp_not_installed,
                   COUNT(*) FILTER (WHERE NOT (tags ? 'vp') AND {OptionalInputs.VpApplicabilitySql} = 'NOT_APPLICABLE')::int AS vp_not_applicable,
                   COUNT(*) FILTER (WHERE NOT COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE)
                                    AND {OptionalInputs.PeerApplicabilitySql} = 'EXPECTED')::int AS peers_expected_missing,
                   COUNT(*) FILTER (WHERE NOT COALESCE((monitoring->'evidence'->>'peerLinksConfigured')::boolean, FALSE)
                                    AND {OptionalInputs.PeerApplicabilitySql} <> 'EXPECTED')::int AS peers_not_applicable
            FROM cpm.loop_registry
            WHERE is_active
              AND (@site::text IS NULL OR site = @site)
              AND (@area::text IS NULL OR area = @area)
              AND (@unit::text IS NULL OR unit = @unit)
        """;
}
