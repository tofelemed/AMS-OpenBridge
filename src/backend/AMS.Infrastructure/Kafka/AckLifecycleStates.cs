namespace AMS.Infrastructure.Kafka;

/// <summary>ISA-18.2 / CAS ACK orchestration lifecycle (append-only transition log).</summary>
public static class AckLifecycleStates
{
    public const string Requested    = "ACK_REQUESTED";
    public const string Queued       = "ACK_QUEUED";
    public const string Processing   = "ACK_PROCESSING";
    public const string Dispatched   = "ACK_DISPATCHED";
    public const string PendingDcs   = "ACK_PENDING_DCS";
    public const string Confirmed    = "ACK_CONFIRMED";
    public const string Failed       = "ACK_FAILED";
    public const string Timeout      = "ACK_TIMEOUT";
    public const string Retrying     = "ACK_RETRYING";

    public static bool IsPending(string? state) => state is not null and not (Confirmed or Failed or Timeout);
    public static bool IsTerminal(string? state) => state is Confirmed or Failed or Timeout;
}
