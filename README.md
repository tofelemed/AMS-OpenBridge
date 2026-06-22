# Enterprise Consolidated Alarm Management System (CAMS)

## Overview
Production-grade, OPC A&E 1.10 compliant, ISA-18.2 aligned Consolidated Alarm Management System for industrial environments.

## Repository Structure
```
AMS/
├── src/
│   ├── backend/          # .NET 8 Clean Architecture Backend
│   ├── flink/            # Apache Flink Stream Processing Jobs
│   └── frontend/         # React + TypeScript Frontend
├── infra/
│   ├── docker/           # Dockerfiles per service
│   ├── k8s/              # Kubernetes manifests
│   ├── helm/             # Helm charts
│   └── ci/               # CI/CD pipelines
├── database/
│   ├── migrations/       # EF Core migrations
│   ├── scripts/          # PostgreSQL + TimescaleDB scripts
│   └── procedures/       # Stored procedures
├── docs/
│   ├── architecture/     # Architecture diagrams & decisions
│   ├── api/              # API documentation
│   ├── installation/     # Installation guides
│   └── manuals/          # User & Admin manuals
└── monitoring/           # Prometheus + Grafana configs
```

## Quick Start
See `docs/installation/INSTALL.md` for full setup instructions.
