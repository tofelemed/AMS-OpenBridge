namespace Traverse.CplmApi.Services.Config;

/// <summary>
/// CHG-222 (lab, 23 Nov): where a shadow run ("Try on past data") reads and how it cuts its windows. The historical replay job
/// evaluates 24 h tumbling windows at <c>windowOffsetMs</c>; the offset used to be the data's own start, so a 2 h shadow over
/// 04:53-06:53 became one window 22 Nov 11:28 -> 23 Nov 11:28 while the loop's LIVE 24 h windows end on quarter hours (06:00):
/// nothing was ever compared. The plan ends the run on the newest LIVE 24 h window end and covers whole days, so every shadow
/// window ends exactly where a LIVE window ends.
/// </summary>
public static class ShadowWindow
{
    private const long Day = 86_400_000L;
    private const long QuarterHour = 900_000L;
    public const int MaxDays = 7;

    public sealed record RunPlan(long FromMs, long ToMs, long OffsetMs, int Days);

    /// <summary>The run's support and window offset. Without a LIVE end, now floored to the quarter hour (the 15-minute grid).</summary>
    public static RunPlan Plan(DateTimeOffset? newestLiveEnd, DateTimeOffset now, int hours)
    {
        var days = Math.Clamp((int)Math.Ceiling(Math.Max(hours, 1) / 24.0), 1, MaxDays);
        var nowMs = now.ToUnixTimeMilliseconds();
        var to = newestLiveEnd?.ToUnixTimeMilliseconds() ?? nowMs - ((nowMs % QuarterHour) + QuarterHour) % QuarterHour;
        var offset = ((to % Day) + Day) % Day;                  // TumblingEventTimeWindows needs 0 <= offset < size
        return new RunPlan(to - days * Day, to, offset, days);
    }
}
