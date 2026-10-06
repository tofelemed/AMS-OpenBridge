// CHG-063: the Loop Events list paged on the server, and one episode by id (deep links, note links).
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.Data;
using Traverse.CplmApi.Services;

namespace Traverse.CplmApi.Controllers;

[ApiController]
[Route("api/v1/cpm")]
[Authorize(Policy = "analytics.view")]
public sealed class CpmEventPageController : ControllerBase
{
    public const int MaxPageSize = 100;

    private readonly NpgsqlDataSource _dataSource;
    private readonly ShelvingOptions _shelving;

    public CpmEventPageController([FromKeyedServices("cplm")] NpgsqlDataSource dataSource, IOptions<ShelvingOptions> shelving)
    {
        _dataSource = dataSource;
        _shelving = shelving.Value;
    }

    /// <summary>
    /// One page of episodes: state tab, loop, plant scope (site / area / unit from the registry) and free text
    /// (loop tag, loop name, family, diagnosis) applied in SQL; `total` is the filtered count and `counts` every
    /// tab's count under the same loop / scope / search, so the tabs describe the fleet, not a slice.
    /// Active shelves are included (the Shelved tab needs them); the Unacknowledged tab leaves them out.
    /// </summary>
    [HttpGet("events/page")]
    public async Task<IActionResult> GetPage(
        [FromQuery] string state = "all",
        [FromQuery] string? loopId = null,
        [FromQuery] string? q = null,
        [FromQuery] string? site = null,
        [FromQuery] string? area = null,
        [FromQuery] string? unit = null,
        [FromQuery] string sort = "triage",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        if (!EventPageSql.Filters.Contains(state))
            return BadRequest(new { error = $"Unknown state '{state}'", allowed = EventPageSql.Filters });
        var order = sort?.Trim().ToLowerInvariant() is "recent" ? "recent" : sort?.Trim().ToLowerInvariant() is null or "" or "triage" ? "triage" : null;
        if (order is null)
            return BadRequest(new { error = $"Unknown sort '{sort}'", allowed = new[] { "triage", "recent" } });
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        page = Math.Max(1, page);

        var args = new DynamicParameters(new
        {
            loopId = Blank(loopId), site = Blank(site), area = Blank(area), unit = Blank(unit),
            q = EventPageSql.Pattern(q), limit = pageSize, offset = (long)(page - 1) * pageSize,
        });
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var counts = (IDictionary<string, object>)await conn.QueryFirstAsync(EventPageSql.Counts(), args);
        var total = Convert.ToInt32(counts[state]);
        var events = (await conn.QueryAsync(EventPageSql.Page(state, order), args)).ToList();

        return Ok(new
        {
            total, page, pageSize,
            pageCount = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)),
            state, sort = order,
            counts = EventPageSql.Filters.ToDictionary(f => f, f => Convert.ToInt32(counts[f])),
            shelvePolicy = new { maxHours = _shelving.MaxHours },
            events,
        });
    }

    /// <summary>One episode by id, whatever its state or rank — what a deep link or a note's episode link opens.</summary>
    [HttpGet("events/{id:long}")]
    public async Task<IActionResult> GetById(long id, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var row = await conn.QueryFirstOrDefaultAsync(EventPageSql.ById, new { id });
        return row is null ? NotFound(new { error = "EVENT_NOT_FOUND", id }) : Ok(row);
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
