// Fast failure on dead upstreams (Plan 04 item 5).
//
// SocketsHttpHandler's default ConnectTimeout is infinite; observed on Windows loopback,
// a connect to a down service burned ~2.3s per request before YARP could 502. A bounded
// connect timeout turns a dead upstream into a fast, predictable failure — and feeds the
// passive-health circuit breaker (TransportFailureRate) that then short-circuits to 503.
using System.Net;
using Yarp.ReverseProxy.Forwarder;

namespace Traverse.Gateway.Proxy;

public sealed class GatewayForwarderHttpClientFactory : ForwarderHttpClientFactory
{
    private readonly TimeSpan _connectTimeout;

    public GatewayForwarderHttpClientFactory(IConfiguration config)
    {
        _connectTimeout = TimeSpan.FromSeconds(config.GetValue("Gateway:ConnectTimeoutSeconds", 5));
    }

    protected override void ConfigureHandler(ForwarderHttpClientContext context, SocketsHttpHandler handler)
    {
        base.ConfigureHandler(context, handler);
        handler.ConnectTimeout = _connectTimeout;
    }
}
