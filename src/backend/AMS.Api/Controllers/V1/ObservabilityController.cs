using Microsoft.AspNetCore.Mvc;
using AMS.Api.Services;

namespace AMS.Api.Controllers.V1;

[ApiController]
[Route("api/v1/[controller]")]
public class ObservabilityController : ControllerBase
{
    private readonly FlinkRestClient _flinkClient;

    public ObservabilityController(FlinkRestClient flinkClient)
    {
        _flinkClient = flinkClient;
    }

    [HttpPost("replay")]
    public async Task<IActionResult> StartReplay([FromBody] ReplayRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CorrelationId))
            return BadRequest("CorrelationId is required.");

        var replayId = Guid.NewGuid().ToString();

        try
        {
            var jobId = await _flinkClient.SubmitReplayJobAsync(request.CorrelationId, request.StartTimestamp, replayId);
            return Ok(new ReplayResponse { ReplayId = replayId, FlinkJobId = jobId });
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Failed to start replay job: {ex.Message}");
        }
    }
}

public class ReplayRequest
{
    public string CorrelationId { get; set; } = string.Empty;
    public long StartTimestamp { get; set; }
}

public class ReplayResponse
{
    public string ReplayId { get; set; } = string.Empty;
    public string FlinkJobId { get; set; } = string.Empty;
}
