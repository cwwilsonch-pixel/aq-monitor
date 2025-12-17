# AQ Monitor System Architecture Overview

## Table of Contents
1. [System Overview](#system-overview)
2. [Component List](#component-list)
    - [Frontend (React)](#frontend-react)
    - [Nginx (Proxy/Static)](#nginx-proxystatic)
    - [Backend (Express)](#backend-express)
    - [Backend Services](#backend-services)
    - [Oracle DB](#oracle-db)
    - [SQLite DB](#sqlite-db)
3. [Technology Stack](#technology-stack)
4. [Component Interactions](#component-interactions)
5. [Deployment & Configuration](#deployment--configuration)

---

## System Overview

AQ Monitor is a containerized web application for monitoring Oracle AQ queues, aggregating metrics, and providing analytics via a secure web interface. It consists of a React frontend, an Express backend, Nginx for static file serving and proxying, and uses Oracle and SQLite databases for data storage and analytics.

---

## Component List

### Frontend (React)
- **Purpose:** Provides the user interface for login, dashboard, and analytics.
- **Tech:** React, TypeScript, Vite
- **Key Features:**
  - Single Page Application (SPA)
  - Fetches data via AJAX/Fetch from backend API
  - Handles authentication, queue metrics, analytics

### Nginx (Proxy/Static)
- **Purpose:** Serves static frontend files and proxies API requests to the backend.
- **Tech:** Nginx
- **Key Features:**
  - SSL termination (HTTPS)
  - Custom logging for protocol/SSL status
  - Reverse proxy for API endpoints
  - Serves static files from build directory

### Backend (Express)
- **Purpose:** Handles API requests, authentication, queue polling, metrics aggregation, and configuration.
- **Tech:** Node.js, Express, TypeScript
- **Key Features:**
  - Conditional HTTPS (configurable via config.json)
  - Logs protocol and SSL status
  - Loads configuration from config.json
  - Exposes REST API endpoints for frontend

### Backend Services
- **AuthService:** Authenticates users via LDAP or local credentials
- **QueuePoller:** Polls Oracle AQ queues for messages
- **MetricsAggregator:** Aggregates queue metrics for analytics
- **SnapshotStore:** Stores queue snapshots in SQLite
- **ConfigManager:** Loads and manages configuration

### Oracle DB
- **Purpose:** Stores and manages AQ queue data
- **Tech:** Oracle Database
- **Key Features:**
  - Source of queue data for polling and analytics

### SQLite DB
- **Purpose:** Stores snapshots and aggregated metrics
- **Tech:** SQLite
- **Key Features:**
  - Lightweight, file-based storage for analytics and retention

---

## Technology Stack
- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Proxy/Static:** Nginx
- **Databases:** Oracle DB (primary), SQLite (analytics/snapshots)
- **Containerization:** Docker, Docker Compose

---

## Component Interactions
- **User → Frontend:** Accesses web UI via HTTPS
- **Frontend → Nginx:** Requests static files and API endpoints
- **Nginx → Backend:** Proxies API requests to backend
- **Backend → Services:** Authenticates, polls queues, aggregates metrics, stores snapshots
- **Backend → Oracle DB:** Polls and queries AQ queue data
- **Backend → SQLite DB:** Stores snapshots and analytics data
- **Nginx → Frontend:** Returns API responses and static files
- **Frontend → User:** Renders UI and displays analytics

---

## Deployment & Configuration
- **Docker Compose:** Orchestrates frontend, backend, and Nginx containers
- **Config Files:**
  - `config.json` for backend settings (SSL, DB, etc.)
  - Nginx config for SSL and proxy settings
- **Build Process:**
  - Frontend build artifacts are copied to backend/public for deployment
  - Nginx serves static files and proxies API requests
- **Logging:**
  - Backend and Nginx log protocol/SSL status for debugging and monitoring

---

## Summary

---

## Container Build & Deployment (Docker/Podman)

### Building Images

You can build the backend and frontend images using Docker or Podman. Example commands:

```sh
# Build backend image
docker build -f Dockerfile.backend -t aq-monitor-backend .

# Build frontend image
docker build -f Dockerfile.frontend -t aq-monitor-frontend .
```

Or with Podman:

```sh
podman build -f Dockerfile.backend -t aq-monitor-backend .
podman build -f Dockerfile.frontend -t aq-monitor-frontend .
```

### Deploying with Docker Compose

Use the provided `docker-compose.yml` to orchestrate the containers:

```sh
docker compose up -d
```

Or with Podman Compose:

```sh
podman-compose up -d
```

### Typical Workflow
1. Build frontend (React) and copy build files to backend/public if needed.
2. Build backend and frontend container images.
3. Start all services with Docker Compose or Podman Compose.
4. Access the web UI via the exposed HTTPS port.

### Notes
- Ensure SSL certificates and config files are correctly mounted or copied into containers.
- Check logs for protocol/SSL status and troubleshooting.
- Update environment variables and config files as needed for your deployment.

---

This architecture ensures secure, scalable, and maintainable monitoring of Oracle AQ queues, with clear separation of concerns and robust logging/configuration for deployment and troubleshooting.
