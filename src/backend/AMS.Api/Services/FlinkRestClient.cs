using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace AMS.Api.Services;

public class FlinkRestClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<FlinkRestClient> _logger;

    public FlinkRestClient(HttpClient httpClient, ILogger<FlinkRestClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<string> SubmitReplayJobAsync(string correlationId, long startTimestamp, string replayId)
    {
        // 1. Get uploaded JARs
        var jarsResponse = await _httpClient.GetFromJsonAsync<FlinkJarsResponse>("/jars");
        if (jarsResponse?.Files == null || jarsResponse.Files.Count == 0)
        {
            throw new InvalidOperationException("No uploaded JARs found on Flink JobManager.");
        }

        // Flink keeps the latest uploaded JAR, we'll just take the first one (or the one containing ams-flink)
        var jarId = jarsResponse.Files.FirstOrDefault(f => f.Name.Contains("ams-flink"))?.Id 
                    ?? jarsResponse.Files.First().Id;

        // 2. Run the specific entry class for Replay
        var requestPayload = new
        {
            entryClass = "com.ams.flink.AlarmReplayEngine",
            programArgs = $"--correlationId \"{correlationId}\" --startTimestamp {startTimestamp} --replayId {replayId}"
        };

        var runResponse = await _httpClient.PostAsJsonAsync($"/jars/{jarId}/run", requestPayload);
        runResponse.EnsureSuccessStatusCode();

        var runResult = await runResponse.Content.ReadFromJsonAsync<FlinkRunResponse>();
        return runResult?.JobId ?? throw new InvalidOperationException("Failed to retrieve JobId from Flink run response.");
    }
}

public class FlinkJarsResponse
{
    [JsonPropertyName("files")]
    public List<FlinkJarFile> Files { get; set; } = new();
}

public class FlinkJarFile
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public class FlinkRunResponse
{
    [JsonPropertyName("jobid")]
    public string JobId { get; set; } = string.Empty;
}
