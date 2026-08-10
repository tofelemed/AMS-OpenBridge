using AMS.Application.Alarms.Commands;
using AMS.Application.Alarms.Queries;
using AMS.Domain.Alarms;
using AMS.Domain.Repositories;
using Asp.Versioning;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Swashbuckle.AspNetCore.Annotations;
using System.ComponentModel.DataAnnotations;

namespace AMS.Api.Controllers.V1;

/// <summary>
/// Alarm management endpoints - OPC A&amp;E 1.10 aligned.
/// Provides real-time and historical alarm operations.
/// </summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/alarms")]
[Authorize]
[Produces("application/json")]
public sealed class AlarmsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly AMS.Infrastructure.Caching.AlarmReadCache _readCache;

    public AlarmsController(IMediator mediator, AMS.Infrastructure.Caching.AlarmReadCache readCache)
    {
        _mediator = mediator;
        _readCache = readCache;
    }

    // ====================================================================
    // GET /api/v1/alarms/active
    // ====================================================================
    /// <summary>
    /// Get all currently active alarms with real-time state.
    /// Supports pagination, sorting, and multi-column filtering.
    /// </summary>
    [HttpGet("active")]
    [EnableRateLimiting("alarms-read")]
    [SwaggerOperation("GetActiveAlarms", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(ActiveAlarmListResult), 200)]
    [ProducesResponseType(401)]
    [ProducesResponseType(429)]
    public async Task<IActionResult> GetActiveAlarms(
        [FromQuery] Guid? serverId               = null,
        [FromQuery] AlarmPriority? priority      = null,
        [FromQuery] AlarmState? state            = null,
        [FromQuery] AlarmCategory? category      = null,
        [FromQuery] string? sourceNameContains   = null,
        [FromQuery] bool? isAcknowledged         = null,
        [FromQuery] bool? isShelved              = null,
        [FromQuery] bool? isSuppressed           = null,
        [FromQuery] [Range(1, int.MaxValue)] int pageNumber = 1,
        [FromQuery] [Range(1, 1000)] int pageSize           = 100,
        [FromQuery] string sortBy                = "EventTime",
        [FromQuery] bool sortDescending          = true,
        CancellationToken ct                     = default)
    {
        // DATA-08: the alarm list is the hottest read (every console polls it). Cached for
        // ≤3s keyed by the full query string; any projection write invalidates immediately
        // (version bump), so operators never see written state later than one in-flight read.
        var result = await _readCache.GetOrCreateAsync(
            $"active:{Request.QueryString.Value}",
            () => _mediator.Send(new GetActiveAlarmsQuery(
                ServerId:            serverId,
                Priority:            priority,
                State:               state,
                Category:            category,
                SourceNameContains:  sourceNameContains,
                IsAcknowledged:      isAcknowledged,
                IsShelved:           isShelved,
                IsSuppressed:        isSuppressed,
                PageNumber:          pageNumber,
                PageSize:            pageSize,
                SortBy:              sortBy,
                SortDescending:      sortDescending
            ), ct));

        Response.Headers.Append("X-Total-Count", result.TotalCount.ToString());
        return Ok(result);
    }

    // ====================================================================
    // GET /api/v1/alarms/active/statistics
    // ====================================================================
    /// <summary>
    /// Get real-time alarm statistics (ISA-18.2 KPIs).
    /// </summary>
    [HttpGet("active/statistics")]
    [SwaggerOperation("GetAlarmStatistics", Tags = new[] { "Alarms", "Analytics" })]
    [ProducesResponseType(typeof(AlarmStatsSummary), 200)]
    public async Task<IActionResult> GetAlarmStatistics(
        [FromQuery] Guid? serverId = null,
        CancellationToken ct = default)
    {
        // DATA-08: stats summary rides the same invalidated cache as the list.
        var stats = await _readCache.GetOrCreateAsync(
            $"stats:{serverId}",
            () => _mediator.Send(new GetAlarmStatisticsQuery(serverId), ct));
        return Ok(stats);
    }

    // ====================================================================
    // POST /api/v1/alarms/active/purge-lab-data
    // ====================================================================
    /// <summary>
    /// Removes storm/autonomous lab alarms from active_alarms (hierarchical paths, "Autonomous storm" messages).
    /// Keeps Integration Objects simulator tags (e.g. FIC1001).
    /// </summary>
    [HttpPost("active/purge-lab-data")]
    [Authorize(Policy = "alarm.acknowledge")]
    [SwaggerOperation("PurgeLabInjectedAlarms", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(PurgeLabInjectedAlarmsResult), 200)]
    public async Task<IActionResult> PurgeLabInjectedAlarms(
        [FromQuery] Guid? serverId = null,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new PurgeLabInjectedAlarmsCommand(serverId), ct);
        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/{id}/acknowledge
    // ====================================================================
    /// <summary>
    /// Acknowledge a single alarm. Requires alarm.acknowledge permission.
    /// Enforces ISA-18.2 operator interaction rules.
    /// </summary>
    [HttpPost("{id:guid}/acknowledge")]
    [Authorize(Policy = "alarm.acknowledge")]
    [SwaggerOperation("AcknowledgeAlarm", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(AcknowledgeAlarmResult), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(403)]
    [ProducesResponseType(404)]
    public async Task<IActionResult> AcknowledgeAlarm(
        [FromRoute] Guid id,
        [FromBody] AcknowledgeRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId   = GetCurrentUserId();
        var username = GetCurrentUsername();

        var result = await _mediator.Send(new AcknowledgeAlarmCommand(
            AlarmId:          id,
            UserId:           userId,
            Username:         username,
            Comment:          request.Comment,
            IpAddress:        HttpContext.Connection.RemoteIpAddress?.ToString(),
            OperatorStation:  request.OperatorStation
        ), ct);

        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/acknowledge/batch
    // ====================================================================
    /// <summary>
    /// Batch acknowledge multiple alarms in a single operation.
    /// Per ISA-18.2 Section 9.5 – Operator override capabilities.
    /// </summary>
    [HttpPost("acknowledge/batch")]
    [Authorize(Policy = "alarm.acknowledge_batch")]
    [SwaggerOperation("BatchAcknowledgeAlarms", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(BatchAcknowledgeResult), 200)]
    [ProducesResponseType(400)]
    public async Task<IActionResult> BatchAcknowledgeAlarms(
        [FromBody] BatchAcknowledgeRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (request.AlarmIds.Length == 0) return BadRequest(new { message = "AlarmIds cannot be empty" });

        var result = await _mediator.Send(new BatchAcknowledgeAlarmsCommand(
            AlarmIds:         request.AlarmIds,
            UserId:           GetCurrentUserId(),
            Username:         GetCurrentUsername(),
            Comment:          request.Comment,
            IpAddress:        HttpContext.Connection.RemoteIpAddress?.ToString(),
            OperatorStation:  request.OperatorStation
        ), ct);

        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/{id}/shelve
    // ====================================================================
    /// <summary>
    /// Shelve an alarm. Per ISA-18.2 Section 11 – Alarm Shelving.
    /// Maximum duration: 480 minutes (8 hours). Comment mandatory.
    /// </summary>
    [HttpPost("{id:guid}/shelve")]
    [Authorize(Policy = "alarm.shelve")]
    [SwaggerOperation("ShelveAlarm", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(ShelveAlarmResult), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(403)]
    public async Task<IActionResult> ShelveAlarm(
        [FromRoute] Guid id,
        [FromBody] ShelveRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var result = await _mediator.Send(new ShelveAlarmCommand(
            AlarmId:          id,
            UserId:           GetCurrentUserId(),
            Username:         GetCurrentUsername(),
            DurationMinutes:  request.DurationMinutes,
            Comment:          request.Comment,
            IpAddress:        HttpContext.Connection.RemoteIpAddress?.ToString(),
            OperatorStation:  request.OperatorStation
        ), ct);

        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/{id}/unshelve
    // ====================================================================
    /// <summary>
    /// Unshelve a shelved alarm, returning it to service. Per ISA-18.2 Section 11.
    /// Reason mandatory.
    /// </summary>
    [HttpPost("{id:guid}/unshelve")]
    [Authorize(Policy = "alarm.unshelve")]
    [SwaggerOperation("UnshelveAlarm", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(UnshelveAlarmResult), 200)]
    [ProducesResponseType(400)]
    [ProducesResponseType(403)]
    public async Task<IActionResult> UnshelveAlarm(
        [FromRoute] Guid id,
        [FromBody] UnshelveRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var result = await _mediator.Send(new UnshelveAlarmCommand(
            AlarmId:         id,
            UserId:          GetCurrentUserId(),
            Reason:          request.Reason,
            OperatorStation: request.OperatorStation
        ), ct);

        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/{id}/suppress
    // ====================================================================
    [HttpPost("{id:guid}/suppress")]
    [Authorize(Policy = "alarm.suppress")]
    [SwaggerOperation("SuppressAlarm", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(SuppressAlarmResult), 200)]
    public async Task<IActionResult> SuppressAlarm(
        [FromRoute] Guid id,
        [FromBody] SuppressRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var result = await _mediator.Send(new SuppressAlarmCommand(
            AlarmId:         id,
            UserId:          GetCurrentUserId(),
            Reason:          request.Reason,
            OperatorStation: request.OperatorStation
        ), ct);

        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    // ====================================================================
    // POST /api/v1/alarms/{id}/out-of-service
    // ====================================================================
    [HttpPost("{id:guid}/out-of-service")]
    [Authorize(Policy = "alarm.suppress")]
    [SwaggerOperation("SetAlarmOutOfService", Tags = new[] { "Alarms" })]
    [ProducesResponseType(typeof(SetAlarmOutOfServiceResult), 200)]
    public async Task<IActionResult> SetOutOfService(
        [FromRoute] Guid id,
        [FromBody] OutOfServiceRequest request,
        CancellationToken ct = default)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var result = await _mediator.Send(new SetAlarmOutOfServiceCommand(
            AlarmId:         id,
            UserId:          GetCurrentUserId(),
            Reason:          request.Reason,
            OperatorStation: request.OperatorStation
        ), ct);

        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(result);
    }

    // ====================================================================
    // GET /api/v1/alarms/historical
    // ====================================================================
    /// <summary>
    /// Query historical alarms from TimescaleDB.
    /// Optimized for billions of records with time-range filtering.
    /// Maximum date range: 365 days per query.
    /// </summary>
    [HttpGet("historical")]
    [EnableRateLimiting("alarms-read")]
    [SwaggerOperation("GetHistoricalAlarms", Tags = new[] { "Alarms", "History" })]
    [ProducesResponseType(typeof(HistoricalAlarmListResult), 200)]
    public async Task<IActionResult> GetHistoricalAlarms(
        [FromQuery] [Required] DateTimeOffset from,
        [FromQuery] [Required] DateTimeOffset to,
        [FromQuery] Guid? serverId               = null,
        [FromQuery] AlarmPriority? priority      = null,
        [FromQuery] AlarmCategory? category      = null,
        [FromQuery] AlarmState? state            = null,
        [FromQuery] string? sourceNameContains   = null,
        [FromQuery] bool? isAcknowledged         = null,
        [FromQuery] [Range(1, int.MaxValue)] int pageNumber = 1,
        [FromQuery] [Range(1, 5000)] int pageSize           = 200,
        [FromQuery] string sortBy                = "EventTime",
        [FromQuery] bool sortDescending          = true,
        CancellationToken ct = default)
    {
        if (to <= from) return BadRequest(new { message = "'to' must be after 'from'" });
        if ((to - from).TotalDays > 365)
            return BadRequest(new { message = "Date range cannot exceed 365 days" });

        var result = await _mediator.Send(new GetHistoricalAlarmsQuery(
            From:                from,
            To:                  to,
            ServerId:            serverId,
            Priority:            priority,
            Category:            category,
            State:               state,
            SourceNameContains:  sourceNameContains,
            IsAcknowledged:      isAcknowledged,
            PageNumber:          pageNumber,
            PageSize:            pageSize,
            SortBy:              sortBy,
            SortDescending:      sortDescending
        ), ct);

        Response.Headers.Append("X-Total-Count", result.TotalCount.ToString());
        return Ok(result);
    }

    // ====================================================================
    // GET /api/v1/alarms/historical/stream
    // ====================================================================
    /// <summary>
    /// Streaming export of historical alarms as NDJSON.
    /// Supports billions of records without memory pressure.
    /// </summary>
    [HttpGet("historical/stream")]
    [Authorize(Policy = "alarm.export")]
    [Produces("application/x-ndjson")]
    [SwaggerOperation("StreamHistoricalAlarms", Tags = new[] { "Alarms", "History" })]
    public async Task StreamHistoricalAlarms(
        [FromQuery] [Required] DateTimeOffset from,
        [FromQuery] [Required] DateTimeOffset to,
        [FromQuery] Guid? serverId = null,
        CancellationToken ct = default)
    {
        Response.ContentType = "application/x-ndjson";
        Response.Headers.Append("Transfer-Encoding", "chunked");

        // Injected streaming service (not via MediatR for performance)
        var historicalRepo = HttpContext.RequestServices
            .GetRequiredService<AMS.Domain.Repositories.IHistoricalAlarmRepository>();

        var query = new AMS.Domain.Repositories.HistoricalAlarmQuery(
            From: from, To: to, ServerId: serverId);

        var jsonOptions = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        };

        await foreach (var row in historicalRepo.StreamAsync(query, ct))
        {
            var line = System.Text.Json.JsonSerializer.Serialize(row, jsonOptions) + "\n";
            await Response.WriteAsync(line, ct);
            await Response.Body.FlushAsync(ct);
        }
    }

    // ====================================================================
    // GET /api/v1/alarms/transitions
    // ====================================================================
    [HttpGet("transitions")]
    [EnableRateLimiting("alarms-read")]
    [SwaggerOperation("GetAlarmStateTransitions", Tags = new[] { "Alarms", "History" })]
    public async Task<IActionResult> GetAlarmStateTransitions(
        [FromQuery] [Required] DateTimeOffset from,
        [FromQuery] [Required] DateTimeOffset to,
        [FromQuery] Guid? alarmId = null,
        [FromQuery] Guid? serverId = null,
        [FromQuery] string? sourceNameContains = null,
        [FromQuery] string? toState = null,
        [FromQuery] [Range(1, int.MaxValue)] int pageNumber = 1,
        [FromQuery] [Range(1, 5000)] int pageSize = 500,
        [FromQuery] string sortBy = "TransitionTime",
        [FromQuery] bool sortDescending = true,
        CancellationToken ct = default)
    {
        if (to <= from) return BadRequest(new { message = "'to' must be after 'from'" });

        var repo = HttpContext.RequestServices.GetRequiredService<IAlarmTransitionRepository>();
        var result = await repo.QueryAsync(new AlarmTransitionQuery(
            from, to, alarmId, serverId, sourceNameContains, toState,
            pageNumber, pageSize, sortBy, sortDescending), ct);

        Response.Headers.Append("X-Total-Count", result.TotalCount.ToString());
        return Ok(new { items = result.Items, totalCount = result.TotalCount, pageNumber, pageSize });
    }

    // ====================================================================
    // GET /api/v1/alarms/transitions/stream — NDJSON for SOE replay
    // ====================================================================
    [HttpGet("transitions/stream")]
    [Authorize(Policy = "alarm.export")]
    [Produces("application/x-ndjson")]
    [SwaggerOperation("StreamAlarmStateTransitions", Tags = new[] { "Alarms", "History" })]
    public async Task StreamAlarmStateTransitions(
        [FromQuery] [Required] DateTimeOffset from,
        [FromQuery] [Required] DateTimeOffset to,
        CancellationToken ct = default)
    {
        Response.ContentType = "application/x-ndjson";
        Response.Headers.Append("Transfer-Encoding", "chunked");

        var repo = HttpContext.RequestServices.GetRequiredService<IAlarmTransitionRepository>();
        var jsonOptions = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
        };

        await foreach (var row in repo.StreamAsync(new AlarmTransitionQuery(from, to), ct))
        {
            var line = System.Text.Json.JsonSerializer.Serialize(row, jsonOptions) + "\n";
            await Response.WriteAsync(line, ct);
            await Response.Body.FlushAsync(ct);
        }
    }



    // ---- Helper methods ----
    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirst("sub") ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        return Guid.TryParse(claim?.Value, out var id) ? id : Guid.Empty;
    }

    private string GetCurrentUsername()
        => User.FindFirst("preferred_username")?.Value
        ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
        ?? "unknown";
}

// ---- Request DTOs ----

public record AcknowledgeRequest(
    [MaxLength(2000)] string? Comment,
    [MaxLength(255)] string? OperatorStation
);

public record BatchAcknowledgeRequest(
    [Required] Guid[] AlarmIds,
    [MaxLength(2000)] string? Comment,
    [MaxLength(255)] string? OperatorStation
);

public record ShelveRequest(
    [Required, Range(1, 480)] int DurationMinutes,
    [Required, MaxLength(2000)] string Comment,
    [MaxLength(255)] string? OperatorStation
);

public record SuppressRequest(
    [Required, MaxLength(2000)] string Reason,
    [MaxLength(255)] string? OperatorStation
);

public record UnshelveRequest(
    [Required, MaxLength(2000)] string Reason,
    [MaxLength(255)] string? OperatorStation
);

public record OutOfServiceRequest(
    [Required, MaxLength(2000)] string Reason,
    [MaxLength(255)] string? OperatorStation
);
