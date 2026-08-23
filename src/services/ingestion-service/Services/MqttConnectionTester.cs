using System.Diagnostics;
using System.Security.Cryptography.X509Certificates;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Formatter;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// One-shot broker connection test (spec §6). INVARIANT: throwaway client id +
/// clean session + no reconnect — reusing the subscriber's stable id would make
/// the broker evict the live connection, and a persistent session left by a test
/// would make the broker queue messages forever for a client that never returns.
/// </summary>
public sealed class MqttConnectionTester
{
    private readonly ILogger<MqttConnectionTester> _logger;

    public MqttConnectionTester(ILogger<MqttConnectionTester> logger) => _logger = logger;

    public async Task<ConnectionTestResult> TestAsync(DataSourceRow row, string password, CancellationToken cancellationToken)
    {
        var timeout = TimeSpan.FromSeconds(row.TimeoutSeconds > 0 ? row.TimeoutSeconds : 30);
        var mqtt = ProfileConfig.FromJson(row.ProfileConfig).Mqtt;

        Uri uri;
        try
        {
            uri = new Uri(row.ConnectionUrl.Trim());
        }
        catch (UriFormatException)
        {
            return new ConnectionTestResult(false, $"Invalid broker URL: {row.ConnectionUrl}", 0);
        }
        var isTls = uri.Scheme is "mqtts" or "ssl";
        var port = uri.IsDefaultPort || uri.Port <= 0 ? (isTls ? 8883 : 1883) : uri.Port;

        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(uri.Host, port)
            .WithClientId($"test-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}")
            .WithCleanSession(true)
            .WithProtocolVersion(MqttProtocolVersion.V500)
            .WithTimeout(timeout);
        if (!string.IsNullOrEmpty(row.Username))
            builder = builder.WithCredentials(row.Username, password);

        if (isTls)
        {
            X509Certificate2Collection? caCerts = null;
            var caError = TryLoadCaCertificates(mqtt?.Tls, out caCerts);
            if (caError is not null)
                return new ConnectionTestResult(false, caError, 0);

            var skipVerify = row.InsecureSkipVerify;
            var servername = mqtt?.Tls?.Servername;
            builder = builder.WithTlsOptions(tls =>
            {
                tls.UseTls();
                if (!string.IsNullOrWhiteSpace(servername))
                    tls.WithTargetHost(servername.Trim());
                tls.WithCertificateValidationHandler(args =>
                    ValidateBrokerCertificate(args, caCerts, skipVerify));
            });
        }

        var client = new MqttFactory().CreateMqttClient();
        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(timeout + TimeSpan.FromSeconds(1));
            var result = await client.ConnectAsync(builder.Build(), timeoutCts.Token);
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
            if (isTls && LooksLikeTlsFailure(message))
                message += $" (a bare protocol/certificate error usually means the broker's TLS certificate " +
                           $"does not list \"{uri.Host}\" in its SANs — set tls.servername or fix the certificate)";
            return new ConnectionTestResult(false, message, stopwatch.ElapsedMilliseconds);
        }
        finally
        {
            client.Dispose();
        }
    }

    /// <summary>Inline PEM preferred over a server-local CA path (spec: the path must be readable by the tester too).</summary>
    private static string? TryLoadCaCertificates(MqttTlsConfig? tls, out X509Certificate2Collection? caCerts)
    {
        caCerts = null;
        try
        {
            if (!string.IsNullOrWhiteSpace(tls?.CaCertPem))
            {
                var certs = new X509Certificate2Collection();
                certs.ImportFromPem(tls.CaCertPem);
                if (certs.Count == 0) return "CA certificate PEM contained no certificates";
                caCerts = certs;
                return null;
            }
            if (!string.IsNullOrWhiteSpace(tls?.CaCertPath))
            {
                if (!File.Exists(tls.CaCertPath))
                    return $"CA certificate not readable at {tls.CaCertPath}";
                var certs = new X509Certificate2Collection();
                certs.ImportFromPem(File.ReadAllText(tls.CaCertPath));
                if (certs.Count == 0) return $"No certificate found in {tls.CaCertPath}";
                caCerts = certs;
                return null;
            }
            return null; // no CA configured — system roots decide
        }
        catch (Exception ex)
        {
            return $"Could not load CA certificate: {ex.Message}";
        }
    }

    private static bool ValidateBrokerCertificate(
        MqttClientCertificateValidationEventArgs args,
        X509Certificate2Collection? caCerts,
        bool insecureSkipVerify)
    {
        if (insecureSkipVerify) return true;
        if (caCerts is { Count: > 0 } && args.Certificate is not null)
        {
            using var chain = new X509Chain();
            chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
            chain.ChainPolicy.CustomTrustStore.AddRange(caCerts);
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            using var endCert = new X509Certificate2(args.Certificate);
            return chain.Build(endCert);
        }
        return args.SslPolicyErrors == System.Net.Security.SslPolicyErrors.None;
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
