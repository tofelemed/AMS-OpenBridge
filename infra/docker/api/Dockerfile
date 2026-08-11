FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and project files for layer caching
COPY AMS.Domain/AMS.Domain.csproj AMS.Domain/
COPY AMS.Application/AMS.Application.csproj AMS.Application/
COPY AMS.Infrastructure/AMS.Infrastructure.csproj AMS.Infrastructure/
COPY AMS.Api/AMS.Api.csproj AMS.Api/

RUN dotnet restore AMS.Api/AMS.Api.csproj

# Copy full source (see .dockerignore — excludes bin/obj)
COPY . .

RUN dotnet publish AMS.Api/AMS.Api.csproj \
    -c Release \
    -o /app/publish \
    /p:DocumentationFile=AMS.Api.xml \
    /p:GenerateDocumentationFile=true

# ---- Runtime image ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app

# Security: non-root user
RUN addgroup -S amsgroup && adduser -S amsuser -G amsgroup
USER amsuser

# Install curl for health checks (minimal)
USER root
RUN apk add --no-cache curl tzdata icu-libs
USER amsuser

ENV TZ=UTC
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_GCConserveMemory=7

COPY --from=build --chown=amsuser:amsgroup /app/publish .

EXPOSE 8000 8001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health/ready || exit 1

ENTRYPOINT ["dotnet", "AMS.Api.dll"]
