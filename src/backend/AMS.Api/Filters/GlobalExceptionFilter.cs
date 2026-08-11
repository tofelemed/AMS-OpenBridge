// Global MVC exception filter — moved out of Program.cs (Plan 10 B1, verbatim).
namespace AMS.Api.Filters;

public sealed class GlobalExceptionFilter : Microsoft.AspNetCore.Mvc.Filters.IExceptionFilter
{
    private readonly ILogger<GlobalExceptionFilter> _logger;

    public GlobalExceptionFilter(ILogger<GlobalExceptionFilter> logger) => _logger = logger;

    public void OnException(Microsoft.AspNetCore.Mvc.Filters.ExceptionContext ctx)
    {
        var ex      = ctx.Exception;
        var problem = ex switch
        {
            FluentValidation.ValidationException ve => new Microsoft.AspNetCore.Mvc.ValidationProblemDetails(
                ve.Errors.GroupBy(e => e.PropertyName)
                  .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()))
                {
                    Status = 400, Title = "Validation Failed", Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
                },
            UnauthorizedAccessException => new Microsoft.AspNetCore.Mvc.ProblemDetails
                { Status = 403, Title = "Forbidden", Detail = "You do not have permission to perform this action" },
            KeyNotFoundException => new Microsoft.AspNetCore.Mvc.ProblemDetails
                { Status = 404, Title = "Not Found", Detail = ex.Message },
            _ => new Microsoft.AspNetCore.Mvc.ProblemDetails
                {
                    Status  = 500,
                    Title   = "Internal Server Error",
                    Detail  = "An unexpected error occurred. Please contact support.",
                    Extensions = { ["traceId"] = ctx.HttpContext.TraceIdentifier }
                }
        };

        _logger.LogError(ex, "Unhandled exception [{TraceId}]: {Message}",
            ctx.HttpContext.TraceIdentifier, ex.Message);

        ctx.Result  = new Microsoft.AspNetCore.Mvc.ObjectResult(problem) { StatusCode = problem.Status };
        ctx.ExceptionHandled = true;
    }
}
