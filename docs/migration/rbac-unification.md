# Auth/RBAC Unification

**Document:** Phase 0 Foundation  
**Status:** AUTHORITATIVE  
**Date:** 2026-06-30

---

## 1. Unified Identity Model

The AMS identity model is the single source of truth. All Traverse services authenticate against it.

### 1.1 Role Hierarchy (ISA-101 Aligned)

| Role | ISA-101 Tier | Description | Traverse Permissions |
|------|--------------|-------------|----------------------|
| **Admin** | Administrator | Full system configuration | All operations |
| **Engineer** | Engineering | Display design, asset config, analysis | Create/edit controlled displays, templates, analyses |
| **Operator** | Operations | Monitor, acknowledge, personal views | View displays, ACK alarms, save personal views |
| **Viewer** | Read-only | Observe only | View displays (no interaction) |

### 1.2 Permission Matrix

| Resource | Admin | Engineer | Operator | Viewer |
|----------|-------|----------|----------|--------|
| **Controlled Displays** | CRUD + Deploy | CRUD + Deploy | Read | Read |
| **Personal Views** | CRUD (own) | CRUD (own) | CRUD (own) | — |
| **Assets** | CRUD | CRUD | Read | Read |
| **Templates** | CRUD | CRUD | Read | Read |
| **Analyses** | CRUD | CRUD | Read | Read |
| **Alarm ACK** | Yes | Yes | Yes | No |
| **System Config** | Yes | No | No | No |

---

## 2. Authentication Flow

### 2.1 Current AMS Authentication

AMS uses JWT tokens issued by the AMS API:

```
POST /api/v1/auth/login
{
  "username": "operator1",
  "password": "..."
}

Response:
{
  "token": "eyJ...",
  "user": { "id": "...", "username": "operator1", "roles": ["operator"] },
  "expiresAt": "2026-06-30T16:00:00Z"
}
```

### 2.2 Traverse Services Authentication

All Traverse services validate JWT tokens against the AMS API:

```
Authorization: Bearer <token>

→ Traverse service calls AMS API:
   GET /api/v1/auth/validate
   
→ Response:
   { "valid": true, "user": {...}, "roles": [...] }
```

### 2.3 Service-to-Service Authentication

Internal services use a shared service account:

```
Service Account: traverse-internal
Roles: [service]
Token: Long-lived JWT with service scope
```

---

## 3. Role-Based Access in Traverse Services

### 3.1 Asset Model Service

```csharp
[Authorize(Roles = "admin,engineer")]
public async Task<IActionResult> CreateAsset(CreateAssetRequest request)

[Authorize(Roles = "admin,engineer,operator,viewer")]
public async Task<IActionResult> GetAsset(Guid id)
```

### 3.2 Display Service

```csharp
// Controlled displays: engineer/admin only for writes
[Authorize(Roles = "admin,engineer")]
public async Task<IActionResult> SaveDisplay(SaveDisplayRequest request)

[Authorize(Roles = "admin,engineer")]
public async Task<IActionResult> DeployDisplay(Guid displayId)

// Personal views: operator can manage own views
[Authorize(Roles = "admin,engineer,operator")]
public async Task<IActionResult> SavePersonalView(SaveViewRequest request)
{
    // Enforce: user can only modify their own views
    if (request.OperatorId != currentUser.Id && !currentUser.IsAdmin)
        return Forbid();
}

// All authenticated users can view deployed displays
[Authorize]
public async Task<IActionResult> GetDisplay(Guid id)
```

### 3.3 Binding Resolver BFF

```csharp
// All authenticated users can resolve bindings (needed for runtime)
[Authorize]
public async Task<IActionResult> ResolveBinding(ResolveRequest request)
```

---

## 4. Database Schema Extension

The `traverse_shared` database extends RBAC with Traverse-specific permissions:

```sql
-- User preferences and settings (Traverse-specific)
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY,   -- References AMS users
    theme VARCHAR(32) DEFAULT 'day',
    default_site VARCHAR(64),
    dashboard_layout JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission grants for specific resources (fine-grained)
CREATE TABLE resource_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    resource_type VARCHAR(64) NOT NULL,  -- display, asset, template
    resource_id UUID NOT NULL,
    permission VARCHAR(32) NOT NULL,     -- read, write, delete, deploy
    granted_by UUID,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, resource_type, resource_id, permission)
);

CREATE INDEX idx_resource_perms_user ON resource_permissions(user_id);
CREATE INDEX idx_resource_perms_resource ON resource_permissions(resource_type, resource_id);
```

---

## 5. Frontend Authorization

### 5.1 Route Protection

```typescript
// src/frontend-ob/src/routes.tsx
const routes = [
  {
    path: '/designer',
    element: <DesignerLayout />,
    roles: ['admin', 'engineer'],  // Protected route
  },
  {
    path: '/displays/:id',
    element: <DisplayRuntime />,
    roles: ['admin', 'engineer', 'operator', 'viewer'],
  },
  {
    path: '/personal-views',
    element: <PersonalViews />,
    roles: ['admin', 'engineer', 'operator'],
  },
];
```

### 5.2 UI Element Visibility

```typescript
// Conditional rendering based on role
const { user } = useAuth();

{user.hasRole('engineer') && (
  <Button onClick={handleSaveDisplay}>Save Display</Button>
)}

{user.hasRole('operator') && (
  <Button onClick={handleSavePersonalView}>Save to My Views</Button>
)}
```

---

## 6. Migration from Reference App RBAC

### 6.1 Reference App Roles

The reference app has the same 4-tier model in `services/db/schema.sql`:

```sql
-- Admin, Engineer, Operator, Viewer
-- Same permission structure
```

### 6.2 Migration Path

1. **No schema migration needed** — AMS already has the role structure
2. **User migration** — Reference app users (if any) are not migrated; fresh start
3. **Permission mapping** — Reference app permissions map 1:1 to AMS roles

---

## 7. Audit Trail

All Traverse services log authorization events to the AMS audit infrastructure:

```csharp
// On authorization decision
await _auditService.LogAsync(new AuditEvent
{
    UserId = currentUser.Id,
    Action = "display.deploy",
    ResourceType = "display",
    ResourceId = displayId,
    Result = "allowed",  // or "denied"
    Timestamp = DateTime.UtcNow,
    Details = new { version = versionNumber }
});
```

---

## 8. Acceptance Criteria

- [ ] Traverse services validate JWT tokens against AMS API
- [ ] Role-based access enforced: engineer can edit displays, operator cannot
- [ ] Personal views scoped to owning operator
- [ ] Audit trail captures all authorization events
- [ ] No new user management UI (reuse AMS)
