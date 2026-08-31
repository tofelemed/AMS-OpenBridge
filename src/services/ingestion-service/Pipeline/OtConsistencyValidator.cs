namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Identity cross-check (docs/ot-data-integration/08 §5): the topic is the routing
/// identity; the payload's duplicated identity fields must not CONTRADICT it. Absent
/// payload fields pass. Class/line/process_unit are deliberately NOT hard-checked
/// (their equivalence to the topic's class level is unproven) — the subscriber counts
/// disagreements as a warning metric instead.
/// </summary>
public static class OtConsistencyValidator
{
    public static bool Validate(OtTopicIdentity topic, OtLoopPayload payload, out string? reason, out string? detail)
    {
        reason = null; detail = null;
        if (Contradicts(topic.Site, payload.Site))
            return Fail(DlqReasons.LoopIdentityMismatch,
                $"topic site '{topic.Site}' vs payload site '{payload.Site}'", out reason, out detail);
        if (Contradicts(topic.Fcs, payload.Area))
            return Fail(DlqReasons.LoopIdentityMismatch,
                $"topic fcs '{topic.Fcs}' vs payload area '{payload.Area}'", out reason, out detail);
        if (Contradicts(topic.LoopTag, payload.Device))
            return Fail(DlqReasons.LoopIdentityMismatch,
                $"topic loop '{topic.LoopTag}' vs payload device '{payload.Device}'", out reason, out detail);
        if (Contradicts(topic.LoopTag, payload.Equipment))
            return Fail(DlqReasons.LoopIdentityMismatch,
                $"topic loop '{topic.LoopTag}' vs payload equipment '{payload.Equipment}'", out reason, out detail);
        if (Contradicts(topic.Parameter, payload.Item))
            return Fail(DlqReasons.ParameterMismatch,
                $"topic param '{topic.Parameter}' vs payload item '{payload.Item}'", out reason, out detail);
        return true;
    }

    private static bool Contradicts(string topicValue, string? payloadValue) =>
        !string.IsNullOrEmpty(payloadValue) &&
        !string.Equals(topicValue, payloadValue, StringComparison.OrdinalIgnoreCase);

    private static bool Fail(string r, string d, out string? reason, out string? detail)
    {
        reason = r; detail = d;
        return false;
    }
}
