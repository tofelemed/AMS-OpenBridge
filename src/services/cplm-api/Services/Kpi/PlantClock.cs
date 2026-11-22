// CHG-102: the plant day. Cpm:PlantTimeZone (compose: PLANT_TIME_ZONE) decides where a plant day starts and ends:
//   local      - the server's own zone (default). Docker runs containers in UTC, so compose mounts the host's
//                /etc/localtime read-only into cplm-api; without that mount "local" is UTC.
//   UTC        - the UTC calendar day.
//   IR         - Iran, Asia/Tehran (UTC+03:30, no DST since 2022): the day ends at 20:30 UTC.
//   <IANA id>  - any other zone (Europe/Berlin, ...), DST included.
//   +HH:MM     - a fixed offset (-HH:MM too).
// An unknown value fails startup: a silently wrong day boundary would shift three years of KPI history.
// CHG-106: Cpm:PlantDayStart (compose: PLANT_DAY_START, HH:MM, a whole quarter hour, default 00:00) is the local time the
// plant day starts, e.g. 06:00 for 06:00 / 18:00 shifts. A day is named by the date it starts on. The Flink submitters
// pass the same value, so KPI days and evidence boundaries stay on one clock.
using System.Globalization;
using System.Text.RegularExpressions;

namespace Traverse.CplmApi.Services.Kpi;

public sealed partial class PlantClock
{
    public const string ConfigKey = "Cpm:PlantTimeZone";
    public const string DayStartKey = "Cpm:PlantDayStart";

    public static readonly PlantClock Utc = new(TimeZoneInfo.Utc, "UTC", "UTC", TimeOnly.MinValue);

    /// <summary>The zone the plant day is computed in.</summary>
    public TimeZoneInfo Zone { get; }

    /// <summary>The setting as configured (local, UTC, IR, an IANA id or an offset).</summary>
    public string Setting { get; }

    /// <summary>The zone's IANA id, or "UTC+03:30" for a fixed offset.</summary>
    public string ZoneId { get; }

    /// <summary>CHG-106: the local time the plant day starts (default midnight).</summary>
    public TimeOnly DayStartTime { get; }

    private PlantClock(TimeZoneInfo zone, string setting, string zoneId, TimeOnly dayStart)
    {
        Zone = zone;
        Setting = setting;
        ZoneId = zoneId;
        DayStartTime = dayStart;
    }

    private PlantClock(TimeZoneInfo zone, string setting, string zoneId) : this(zone, setting, zoneId, TimeOnly.MinValue) { }

    [GeneratedRegex(@"^(?:UTC)?([+-])(\d{1,2}):?(\d{2})$", RegexOptions.IgnoreCase)]
    private static partial Regex OffsetPattern();

    [GeneratedRegex(@"^(\d{1,2}):(\d{2})$")]
    private static partial Regex DayStartPattern();

    /// <summary>
    /// CHG-106: this clock with the plant day starting at <paramref name="hhmm"/> ("06:00"); blank = midnight. Throws
    /// ArgumentException for anything but a whole quarter hour: the Flink long job fires on 15-minute steps, so any other
    /// start would put the KPI days and the evidence boundaries on different clocks.
    /// </summary>
    public PlantClock WithDayStart(string? hhmm)
    {
        var s = (hhmm ?? "").Trim();
        if (s.Length == 0) return new PlantClock(Zone, Setting, ZoneId, TimeOnly.MinValue);
        var m = DayStartPattern().Match(s);
        if (!m.Success) throw new ArgumentException($"{DayStartKey} '{s}' is not HH:MM (06:00)");
        var h = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        var min = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        if (h > 23 || min > 59) throw new ArgumentException($"{DayStartKey} '{s}' is out of range");
        if (min % 15 != 0) throw new ArgumentException($"{DayStartKey} '{s}' must be a whole quarter hour (06:00, 06:15, ...)");
        return new PlantClock(Zone, Setting, ZoneId, new TimeOnly(h, min));
    }

    /// <summary>Resolve a setting; throws ArgumentException for a value that is not a zone.</summary>
    public static PlantClock Parse(string? setting)
    {
        var s = (setting ?? "").Trim();
        if (s.Length == 0 || s.Equals("local", StringComparison.OrdinalIgnoreCase))
        {
            var local = TimeZoneInfo.Local;
            return new PlantClock(local, "local", LocalId(local));
        }
        if (s.Equals("UTC", StringComparison.OrdinalIgnoreCase) || s.Equals("Z", StringComparison.OrdinalIgnoreCase))
            return Utc;
        if (s.Equals("IR", StringComparison.OrdinalIgnoreCase) || s.Equals("IRAN", StringComparison.OrdinalIgnoreCase)
            || s.Equals("IRST", StringComparison.OrdinalIgnoreCase) || s.Equals("Asia/Tehran", StringComparison.OrdinalIgnoreCase))
        {
            // the image carries tzdata; a host without it gets Iran's offset since 2022 (no DST)
            var zone = TryFind("Asia/Tehran") ?? Fixed(TimeSpan.FromMinutes(210), "Asia/Tehran");
            return new PlantClock(zone, s.ToUpperInvariant() == "ASIA/TEHRAN" ? "Asia/Tehran" : "IR", "Asia/Tehran");
        }
        var m = OffsetPattern().Match(s);
        if (m.Success)
        {
            var minutes = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture) * 60 + int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);
            if (minutes > 14 * 60) throw new ArgumentException($"{ConfigKey} offset '{s}' is outside -14:00..+14:00");
            var offset = TimeSpan.FromMinutes(m.Groups[1].Value == "-" ? -minutes : minutes);
            var id = "UTC" + (offset < TimeSpan.Zero ? "-" : "+") + offset.Duration().ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            return new PlantClock(Fixed(offset, id), s, id);
        }
        var found = TryFind(s) ?? throw new ArgumentException(
            $"{ConfigKey} '{s}' is not a time zone: use local, UTC, IR, an IANA id (Asia/Tehran) or an offset (+03:30)");
        return new PlantClock(found, s, UtcAliases.Contains(found.Id) ? "UTC" : found.Id);
    }

    /// <summary>The plant clock from configuration (Cpm:PlantTimeZone, default local; Cpm:PlantDayStart, default 00:00).</summary>
    public static PlantClock From(IConfiguration config) => Parse(config[ConfigKey]).WithDayStart(config[DayStartKey]);

    private static TimeZoneInfo? TryFind(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return null; }
        catch (InvalidTimeZoneException) { return null; }
    }

    /// <summary>The names a UTC server's zone goes by (a Docker VM reports Etc/UTC): all shown as plain "UTC".</summary>
    private static readonly HashSet<string> UtcAliases = new(StringComparer.OrdinalIgnoreCase)
        { "UTC", "Etc/UTC", "Etc/UCT", "Etc/GMT", "Etc/Universal", "Etc/Zulu", "GMT", "UCT", "Universal", "Zulu", "Coordinated Universal Time" };

    private static TimeZoneInfo Fixed(TimeSpan offset, string id) => TimeZoneInfo.CreateCustomTimeZone(id, offset, id, id);

    /// <summary>A mounted /etc/localtime reads as id "localtime": report its offset instead.</summary>
    private static string LocalId(TimeZoneInfo z)
    {
        if (UtcAliases.Contains(z.Id)) return "UTC";
        if (z.Id.Contains('/')) return z.Id;
        var o = z.GetUtcOffset(DateTimeOffset.UtcNow);
        return o == TimeSpan.Zero ? "UTC" : "UTC" + (o < TimeSpan.Zero ? "-" : "+") + o.Duration().ToString(@"hh\:mm", CultureInfo.InvariantCulture);
    }

    /// <summary>The plant day containing <paramref name="instant"/>, named by the date it starts on (CHG-106).</summary>
    public DateOnly DayOf(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, Zone).DateTime - DayStartTime.ToTimeSpan());

    /// <summary>The instant a plant day starts (its local day-start time, midnight by default; a start skipped by DST = the
    /// first valid minute).</summary>
    public DateTimeOffset DayStart(DateOnly day)
    {
        var local = day.ToDateTime(DayStartTime);
        while (Zone.IsInvalidTime(local)) local = local.AddMinutes(30);
        // an ambiguous midnight (DST fall-back) takes the first occurrence: the larger offset
        var offset = Zone.IsAmbiguousTime(local) ? Zone.GetAmbiguousTimeOffsets(local).Max() : Zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }

    /// <summary>The instant a plant day ends = the next day's start; a stored day is classified as of this instant.</summary>
    public DateTimeOffset DayEnd(DateOnly day) => DayStart(day.AddDays(1));

    /// <summary>The plant day whose end is exactly <paramref name="instant"/>, or null.</summary>
    public DateOnly? DayEndingAt(DateTimeOffset instant)
    {
        var day = DayOf(instant).AddDays(-1);
        return DayEnd(day) == instant.ToUniversalTime() ? day : null;
    }

    /// <summary>The current UTC offset as "+03:30".</summary>
    public string OffsetNow(DateTimeOffset now)
    {
        var o = Zone.GetUtcOffset(now);
        return (o < TimeSpan.Zero ? "-" : "+") + o.Duration().ToString(@"hh\:mm", CultureInfo.InvariantCulture);
    }

    /// <summary>The day start as "06:00".</summary>
    public string DayStartText => DayStartTime.ToString("HH:mm", CultureInfo.InvariantCulture);

    /// <summary>What the API reports: the setting, the zone, today's offset and (CHG-106) the day start.</summary>
    public object Describe(DateTimeOffset now) => new { setting = Setting, zone = ZoneId, utcOffset = OffsetNow(now), dayStart = DayStartText };

    public override string ToString() =>
        $"{Setting} ({ZoneId}, UTC{OffsetNow(DateTimeOffset.UtcNow)}{(DayStartTime == TimeOnly.MinValue ? "" : $", day starts {DayStartText}")})";
}
