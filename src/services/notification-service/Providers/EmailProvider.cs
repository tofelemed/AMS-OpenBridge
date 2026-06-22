using MailKit.Net.Smtp;
using MimeKit;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace AMS.NotificationService.Providers;

public interface INotificationProvider
{
    string ChannelType { get; }
    Task SendAsync(string endpoint, string subject, string message, CancellationToken ct);
}

public class EmailProvider : INotificationProvider
{
    private readonly ILogger<EmailProvider> _logger;
    private readonly string _smtpHost;
    private readonly int _smtpPort;
    private readonly string _fromAddress;

    public string ChannelType => "EMAIL";

    public EmailProvider(ILogger<EmailProvider> logger, IConfiguration config)
    {
        _logger = logger;
        _smtpHost = config.GetValue<string>("Smtp:Host") ?? "localhost";
        _smtpPort = config.GetValue<int>("Smtp:Port", 25);
        _fromAddress = config.GetValue<string>("Smtp:From") ?? "ams-alerts@plant.local";
    }

    public async Task SendAsync(string endpoint, string subject, string message, CancellationToken ct)
    {
        try
        {
            var email = new MimeMessage();
            email.From.Add(new MailboxAddress("AMS System", _fromAddress));
            email.To.Add(new MailboxAddress("", endpoint));
            email.Subject = subject;

            email.Body = new TextPart(MimeKit.Text.TextFormat.Html) { Text = message };

            using var client = new SmtpClient();
            // In a real environment, configure SSL/TLS and authentication here.
            await client.ConnectAsync(_smtpHost, _smtpPort, MailKit.Security.SecureSocketOptions.Auto, ct);
            await client.SendAsync(email, ct);
            await client.DisconnectAsync(true, ct);

            _logger.LogInformation("Email sent successfully to {Endpoint}", endpoint);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Endpoint}", endpoint);
            throw; // Re-throw to allow Orchestrator to handle retry/DLQ
        }
    }
}
