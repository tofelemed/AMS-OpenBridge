FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
# Build-box hygiene: no CLI telemetry POST (dc.services.visualstudio.com) from restore/publish
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
WORKDIR /src

COPY cplm-api.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
# v2.5 R26: build identity. compose passes SOURCE_COMMIT (lab: env; plant: build-prod-images.py
# from git rev-parse HEAD). GET /api/v1/cpm/capabilities reports it; 'unknown' is never faked.
ARG SOURCE_COMMIT=unknown
ENV SOURCE_COMMIT=$SOURCE_COMMIT
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /app
COPY --from=build /app .

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "cplm-api.dll"]
