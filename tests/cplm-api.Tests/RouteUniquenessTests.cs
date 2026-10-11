// Guard found by KPI Phase 4: a new GET /loops/{loopId}/kpis collided with the existing KPI stream route and BOTH answered 500
// (AmbiguousMatchException) — invisible to tests that call a controller directly. Every HTTP method + route template served by
// cplm-api must be unique.
using System.Reflection;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class RouteUniquenessTests
{
    private static string Norm(string t) =>
        System.Text.RegularExpressions.Regex.Replace(t.Trim('/').ToLowerInvariant(), @"\{([a-z0-9_]+)(:[^}]*)?\??\}", "{}");

    [Fact]
    public void Every_method_and_route_template_is_served_by_exactly_one_action()
    {
        var controllers = typeof(Traverse.CplmApi.Controllers.CpmFleetKpiController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract);
        var seen = new List<string>();
        foreach (var c in controllers)
        {
            var prefixes = c.GetCustomAttributes<RouteAttribute>().Select(r => r.Template).DefaultIfEmpty("").ToList();
            foreach (var m in c.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly))
            foreach (var h in m.GetCustomAttributes<HttpMethodAttribute>())
            foreach (var verb in h.HttpMethods)
            {
                var t = h.Template ?? "";
                var paths = t.StartsWith('/') || t.StartsWith("~/") ? new[] { t.TrimStart('~') } : prefixes.Select(p => $"{p}/{t}").ToArray();
                seen.AddRange(paths.Select(p => $"{verb} {Norm(p)}"));
            }
        }
        seen.GroupBy(s => s).Where(g => g.Count() > 1).Select(g => g.Key).Should().BeEmpty("two actions on one route both answer 500");
    }
}
