FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY historian-bff.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
# wget for Docker healthcheck (curl not present in aspnet slim image)
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
# Non-root user
RUN useradd -r -u 1001 appuser
USER appuser
EXPOSE 8090
ENTRYPOINT ["dotnet", "historian-bff.dll"]
