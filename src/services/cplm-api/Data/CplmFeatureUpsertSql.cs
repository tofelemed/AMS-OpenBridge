namespace Traverse.CplmApi.Data;

/// <summary>
/// The short / long feature upserts, verbatim from the result consumer (CHG-033 moved them here so the
/// partition tests can run the exact statement the plant runs). ON CONFLICT names the bundle-aware key;
/// on the plant's partitioned tables the arbiter is the parent's partitioned unique index, and the
/// DO UPDATE never touches window_end, so a row never moves between partitions.
/// </summary>
public static class CplmFeatureUpsertSql
{
    public const string Long = """
        INSERT INTO analytics.cplm_long_feature_results
        (loop_id, window_kind, window_start, window_end, sample_count,
         acf_period_s, acf_regularity, effort_ratio, triangularity, horch_oddness,
         corner_score, travel_per_day, reversals_per_hour,
         harmonic_amplitude_ratio, harmonic_energy_ratio, payload, source,
         method_run_ids, bundle_hash, context_revision, result_revision, purpose,
         analysis_run_id, source_commit, jar_sha256, dataset_hash)
        VALUES
        (@loopId, @windowKind, @winStart, @winEnd, @samples,
         @m1, @m2, @m3, @m4, @m5, @m6, @m7, @m8, @m9, @m10, @payload, @source,
         @methodRunIds, @bundleHash, @contextRevision, @resultRevision, @purpose,
         @analysisRunId, @sourceCommit, @jarSha256, @datasetHash)
        ON CONFLICT (loop_id, window_kind, window_end, source, bundle_hash) DO UPDATE SET
        window_start = EXCLUDED.window_start, sample_count = EXCLUDED.sample_count,
        acf_period_s = EXCLUDED.acf_period_s, acf_regularity = EXCLUDED.acf_regularity,
        effort_ratio = EXCLUDED.effort_ratio, triangularity = EXCLUDED.triangularity,
        horch_oddness = EXCLUDED.horch_oddness, corner_score = EXCLUDED.corner_score,
        travel_per_day = EXCLUDED.travel_per_day,
        reversals_per_hour = EXCLUDED.reversals_per_hour,
        harmonic_amplitude_ratio = EXCLUDED.harmonic_amplitude_ratio,
        harmonic_energy_ratio = EXCLUDED.harmonic_energy_ratio,
        payload = EXCLUDED.payload,
        method_run_ids = EXCLUDED.method_run_ids, context_revision = EXCLUDED.context_revision,
        result_revision = EXCLUDED.result_revision, purpose = EXCLUDED.purpose,
        analysis_run_id = EXCLUDED.analysis_run_id, source_commit = EXCLUDED.source_commit,
        jar_sha256 = EXCLUDED.jar_sha256, dataset_hash = EXCLUDED.dataset_hash,
        created_at = NOW()
        WHERE EXCLUDED.sample_count >= analytics.cplm_long_feature_results.sample_count
        """;

    public const string Short = """
        INSERT INTO analytics.cplm_short_feature_results
            (loop_id, window_kind, window_start, window_end, sample_count,
             iae, ise, mae, rmse, good_error_pct, effort_ratio,
             travel_per_day, reversals_per_hour, auto_pct, completeness, payload, source,
             method_run_ids, bundle_hash, context_revision, result_revision, purpose,
             analysis_run_id, source_commit, jar_sha256, dataset_hash)
        VALUES
            (@loopId, @windowKind, @winStart, @winEnd, @samples,
             @m1, @m2, @m3, @m4, @m5, @m6, @m7, @m8, @m9, @m10, @payload, @source,
             @methodRunIds, @bundleHash, @contextRevision, @resultRevision, @purpose,
             @analysisRunId, @sourceCommit, @jarSha256, @datasetHash)
        ON CONFLICT (loop_id, window_kind, window_end, source, bundle_hash) DO UPDATE SET
            window_start = EXCLUDED.window_start, sample_count = EXCLUDED.sample_count,
            iae = EXCLUDED.iae, ise = EXCLUDED.ise, mae = EXCLUDED.mae,
            rmse = EXCLUDED.rmse, good_error_pct = EXCLUDED.good_error_pct,
            effort_ratio = EXCLUDED.effort_ratio,
            travel_per_day = EXCLUDED.travel_per_day,
            reversals_per_hour = EXCLUDED.reversals_per_hour,
            auto_pct = EXCLUDED.auto_pct, completeness = EXCLUDED.completeness,
            payload = EXCLUDED.payload,
            method_run_ids = EXCLUDED.method_run_ids, context_revision = EXCLUDED.context_revision,
            result_revision = EXCLUDED.result_revision, purpose = EXCLUDED.purpose,
            analysis_run_id = EXCLUDED.analysis_run_id, source_commit = EXCLUDED.source_commit,
            jar_sha256 = EXCLUDED.jar_sha256, dataset_hash = EXCLUDED.dataset_hash,
            created_at = NOW()
        WHERE EXCLUDED.sample_count >= analytics.cplm_short_feature_results.sample_count
        """;
}
