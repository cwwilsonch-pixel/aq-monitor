# AQ Monitor

## Overview
AQ Monitor is a containerized web application for monitoring Oracle AQ queues, aggregating metrics, and providing analytics via a secure web interface. It consists of a React frontend, an Express backend, Nginx for static file serving and proxying, and uses Oracle and SQLite databases for data storage and analytics.

## Features
- Secure web UI for login, dashboard, and analytics
- Real-time queue polling and metrics aggregation
- LDAP/local authentication
- REST API endpoints
- Configurable SSL/HTTPS support
- Containerized deployment (Docker/Podman)

## Technology Stack
- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Proxy/Static: Nginx
- Databases: Oracle DB (primary), SQLite (analytics/snapshots)
- Containerization: Docker, Docker Compose

## Architecture
See `SYSTEM_OVERVIEW.md` for a detailed description of all components, their roles, technologies, and interactions.

## Quick Start

### 1. Build Frontend
```sh
cd frontend
npm install
npm run build
```
Copy the build files from `frontend/dist` to `backend/public` if needed.

### 2. Build Images
```sh
# Backend
docker build -f Dockerfile.backend -t aq-monitor-backend .
# Frontend
docker build -f Dockerfile.frontend -t aq-monitor-frontend .
```
Or with Podman:
```sh
podman build -f Dockerfile.backend -t aq-monitor-backend .
podman build -f Dockerfile.frontend -t aq-monitor-frontend .
```

### 3. Deploy with Compose
```sh
docker compose up -d
```
Or with Podman Compose:
```sh
podman-compose up -d
```

### 4. Access the Web UI
Open your browser to the exposed HTTPS port (see `docker-compose.yml`).

## Configuration
- Backend config: `backend/config/config.json`
- Nginx config: `nginx.conf`
- SSL certificates: Mount or copy into containers as needed

## Logging
- Backend and Nginx log protocol/SSL status for debugging and monitoring

## Documentation
- See `SYSTEM_OVERVIEW.md` for full architecture and deployment details.
- See `aq-monitor.plantuml` for a system diagram.

## License
[Specify your license here]
