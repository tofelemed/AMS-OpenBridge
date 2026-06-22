using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace AMS.NotificationService.Providers;

public class TeamsWebhookProvider : INotificationProvider
{
    private readonly ILogger<TeamsWebhookProvider> _logger;
    private readonly HttpClient _httpClient;

    public string ChannelType => "TEAMS";

    public TeamsWebhookProvider(ILogger<TeamsWebhookProvider> logger, HttpClient httpClient)
    {
        _logger = logger;
        _httpClient = httpClient;
    }

    public async Task SendAsync(string endpoint, string subject, string message, CancellationToken ct)
    {
        try
        {
            var payload = new
            {
                type = "message",
                attachments = new[]
                {
                    new
                    {
                        contentType = "application/vnd.microsoft.card.adaptive",
                        contentUrl = (string?)null,
                        content = new
                        {
                            type = "AdaptiveCard",
                            version = "1.4",
                            body = new object[]
                            {
                                new { type = "TextBlock", text = subject, weight = "Bolder", size = "Large", color = "Attention" },
                                new { type = "TextBlock", text = message, wrap = true }
                            }
                        }
                    }
                }
            };

            var response = await _httpClient.PostAsJsonAsync(endpoint, payload, ct);
            response.EnsureSuccessStatusCode();

            _logger.LogInformation("Teams notification sent successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send Teams notification to Webhook endpoint.");
            throw;
        }
    }
}
