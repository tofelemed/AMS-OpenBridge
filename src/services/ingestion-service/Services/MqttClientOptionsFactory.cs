using System.Security.Cryptography.X509Certificates;
using MQTTnet.Client;
using MQTTnet.Formatter;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Services;

/// <summary>
/// Single place that turns a data-source row into MQTT client options, shared by the
/// one-shot connection tester and the phase-2 subscriber so their TLS/connect behavior
/// can never diverge. The caller supplies what distinguishes them: client id, clean
/// session, session expiry (the two-client-identity INVARIANT lives at the call sites).
/// </summary>
public static class MqttClientOptionsFactory
{
    public static bool TryBuild(DataSourceRow row, string password, string clientId,
        bool cleanSession, uint sessionExpirySeconds, TimeSpan timeout,
        out MqttClientOptions? options, out string? error)
    {
        options = null; error = null;
        var mqtt = ProfileConfig.FromJson(row.ProfileConfig).Mqtt;

        Uri uri;
        try
        {
            uri = new Uri(row.ConnectionUrl.Trim());
        }
        catch (UriFormatException)
        {
            error = $"Invalid broker URL: {row.ConnectionUrl}";
            return false;
        }
        var isTls = uri.Scheme is "mqtts" or "ssl";
        var port = uri.IsDefaultPort || uri.Port <= 0 ? (isTls ? 8883 : 1883) : uri.Port;

        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(uri.Host, port)
            .WithClientId(clientId)
            .WithCleanSession(cleanSession)
            .WithProtocolVersion(MqttProtocolVersion.V500)
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(mqtt?.KeepaliveSeconds is > 0 ? mqtt.KeepaliveSeconds.Value : 60))
            .WithTimeout(timeout);
        if (!cleanSession && sessionExpirySeconds > 0)
            builder = builder.WithSessionExpiryInterval(sessionExpirySeconds);
        if (!string.IsNullOrEmpty(row.Username))
            builder = builder.WithCredentials(row.Username, password);

        if (isTls)
        {
            var caError = TryLoadCaCertificates(mqtt?.Tls, out var caCerts);
            if (caError is not null)
            {
                error = caError;
                return false;
            }

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

        options = builder.Build();
        return true;
    }

    public static bool IsTlsUrl(string connectionUrl)
    {
        try { return new Uri(connectionUrl.Trim()).Scheme is "mqtts" or "ssl"; }
        catch (UriFormatException) { return false; }
    }

    /// <summary>Inline PEM preferred over a server-local CA path (spec: the path must be readable here too).</summary>
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
}
