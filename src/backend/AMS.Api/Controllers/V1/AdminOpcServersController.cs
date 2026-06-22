using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using AMS.Api.BackgroundServices;

namespace AMS.Api.Controllers.V1;

/// <summary>Legacy route — returns HTTP alarm feed only (OPC/gateway removed).</summary>
[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/admin/opc-servers")]
[Produces("application/json")]
public sealed class AdminOpcServersController : ControllerBase
{
    private readonly AlarmIngestionOptions _opts;

    public AdminOpcServersController(IOptions<AlarmIngestionOptions> opts) => _opts = opts.Value;

    [HttpGet]
    [Authorize(Policy = "alarm.view")]
    public IActionResult GetAll()
    {
        if (!_opts.Enabled)
            return Ok(Array.Empty<AlarmFeedServerDto>());

        return Ok(new[]
        {
            new AlarmFeedServerDto(
                _opts.ServerId,
                _opts.ServerName,
                "HTTP-JSON",
                null,
                null,
                "Connected",
                true,
                0,
                null)
        });
    }

    private sealed record AlarmFeedServerDto(
        string Id,
        string Name,
        string Protocol,
        string? Host,
        string? ProgId,
        string Status,
        bool Enabled,
        double EventsPerSec,
        long? TotalEvents);
}
