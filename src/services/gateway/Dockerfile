FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
# Build-box hygiene: no CLI telemetry POST (dc.services.visualstudio.com) from restore/publish
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
WORKDIR /src

COPY gateway.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# 8080 = HTTP (lab / behind TLS offload), 8443 = HTTPS when Gateway__Tls__CertPath is set.
EXPOSE 8080 8443

ENTRYPOINT ["dotnet", "gateway.dll"]
