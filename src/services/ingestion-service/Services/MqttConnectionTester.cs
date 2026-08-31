using System.Diagnostics;
using MQTTnet;
using MQTTnet.Client;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// One-shot broker connection test (spec §6). INVARIANT: throwaway client id +
/// clean session + no reconnect — reusing the subscriber's stable id would make
/// the broker evict the live connection, and a persistent session left by a test
/// would make the broker queue messages forever for a client that never returns.
/// Connect/TLS option building is shared with the subscriber via
/// MqttClientOptionsFactory so the two paths cannot diverge.
/// </summary>
public sealed class MqttConnectionTester
{
    private readonly ILogger<MqttConnectionTester> _logger;

    public MqttConnectionTester(ILogger<MqttConnectionTester> logger) => _logger = logger;

    public async Task<ConnectionTestResult> TestAsync(DataSourceRow row, string password, CancellationToken cancellationToken)
    {
        var timeout = TimeSpan.FromSeconds(row.TimeoutSeconds > 0 ? row.TimeoutSeconds : 30);

        if (!MqttClientOptionsFactory.TryBuild(row, password,
                clientId: $"test-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                cleanSession: true, sessionExpirySeconds: 0, timeout,
                out var options, out var buildError))
            return new ConnectionTestResult(false, buildError, 0);

        var client = new MqttFactory().CreateMqttClient();
        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(timeout + TimeSpan.FromSeconds(1));
            var result = await client.ConnectAsync(options!, timeoutCts.Token);
            stopwatch.Stop();

            if (result.ResultCode != MqttClientConnectResultCode.Success)
                return new ConnectionTestResult(false, $"Broker refused connection: {result.ResultCode}", stopwatch.ElapsedMilliseconds);

            await client.DisconnectAsync(cancellationToken: CancellationToken.None);
            return new ConnectionTestResult(true, null, stopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ConnectionTestResult(false, $"Connection timed out after {timeout.TotalMilliseconds:F0}ms", stopwatch.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            // A bare protocol/handshake error is almost always a TLS SAN mismatch:
            // the host used to reach the broker is not in the certificate's
            // subjectAltName list (spec §6 / Appendix A gotcha 3).
            var message = Flatten(ex);
            if (MqttClientOptionsFactory.IsTlsUrl(row.ConnectionUrl) && LooksLikeTlsFailure(message))
            {
                var host = HostOf(row.ConnectionUrl);
                message += $" (a bare protocol/certificate error usually means the broker's TLS certificate " +
                           $"does not list \"{host}\" in its SANs — set tls.servername or fix the certificate)";
            }
            return new ConnectionTestResult(false, message, stopwatch.ElapsedMilliseconds);
        }
        finally
        {
            client.Dispose();
        }
    }

    private static string HostOf(string url)
    {
        try { return new Uri(url.Trim()).Host; } catch { return url; }
    }

    private static string Flatten(Exception ex)
    {
        var messages = new List<string>();
        for (Exception? e = ex; e is not null; e = e.InnerException)
            if (!string.IsNullOrWhiteSpace(e.Message) && !messages.Contains(e.Message))
                messages.Add(e.Message);
        return string.Join(" — ", messages);
    }

    private static bool LooksLikeTlsFailure(string message) =>
        message.Contains("protocol", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("certificate", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("handshake", StringComparison.OrdinalIgnoreCase) ||
        message.Contains("authentication failed", StringComparison.OrdinalIgnoreCase);
}
