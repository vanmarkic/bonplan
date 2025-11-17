# Le Syndicat des Tox - API Endpoints Documentation

## Base URL
```
https://syndicat-tox.be/api/v1
```

## Response Format
All responses follow this structure:
```json
{
  "success": boolean,
  "data": object | array | null,
  "error": string | null,
  "timestamp": "ISO 8601"
}
```

## Authentication Endpoints

### POST /auth/register
Create new anonymous account.

**Request:**
```json
{
  "pseudo": "string (3-20 chars)",
  "pin": "string (4 digits)",
  "language": "fr|nl|de|en (optional)"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "pseudo": "user123",
    "sessionToken": "base64url_token",
    "message": "Account created successfully"
  }
}
```

**Errors:**
- 400: Invalid pseudo format or PIN format
- 409: Pseudo already taken

---

### POST /auth/login
Authenticate with pseudo and PIN.

**Request:**
```json
{
  "pseudo": "string",
  "pin": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pseudo": "user123",
    "sessionToken": "base64url_token",
    "isModerator": false
  }
}
```

**Errors:**
- 401: Invalid credentials
- 423: Account locked (too many attempts)
- 403: Account banned

---

### POST /auth/logout
End current session.

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

### GET /auth/session
Check current session status.

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "pseudo": "user123",
    "isModerator": false
  }
}
```

---

## Forum Endpoints

### GET /threads
List all visible threads.

**Query Parameters:**
- `sort`: `activity|newest|replies` (default: activity)
- `language`: `fr|nl|de|en|all` (default: all)
- `page`: number (default: 1)
- `limit`: 10-50 (default: 25)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "threads": [
      {
        "id": 123,
        "title": "Thread title",
        "authorPseudo": "user123",
        "createdAt": "2025-01-01T00:00:00Z",
        "lastActivity": "2025-01-01T12:00:00Z",
        "replyCount": 5,
        "isPinned": false,
        "isLocked": false,
        "language": "fr",
        "preview": "First 200 chars of body..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 100,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

### GET /threads/:id
Get single thread with replies.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "thread": {
      "id": 123,
      "title": "Thread title",
      "body": "Full thread body...",
      "authorPseudo": "user123",
      "createdAt": "2025-01-01T00:00:00Z",
      "lastActivity": "2025-01-01T12:00:00Z",
      "editedAt": null,
      "replyCount": 5,
      "viewCount": 100,
      "isPinned": false,
      "isLocked": false,
      "language": "fr"
    },
    "replies": [
      {
        "id": 456,
        "body": "Reply body...",
        "authorPseudo": "user456",
        "createdAt": "2025-01-01T10:00:00Z",
        "editedAt": null,
        "isDeleted": false
      }
    ]
  }
}
```

**Errors:**
- 404: Thread not found
- 403: Thread hidden/deleted

---

### POST /threads
Create new thread. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "title": "string (5-200 chars)",
  "body": "string (10-10000 chars)",
  "language": "fr|nl|de|en"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "threadId": 124,
    "message": "Thread created successfully"
  }
}
```

**Errors:**
- 401: Not authenticated
- 400: Invalid input
- 429: Rate limited

---

### PATCH /threads/:id
Edit thread (within 15 minutes). **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "body": "string (10-10000 chars)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Thread updated successfully",
    "editedAt": "2025-01-01T00:15:00Z"
  }
}
```

**Errors:**
- 401: Not authenticated
- 403: Not thread author or edit window expired
- 400: Invalid input

---

### DELETE /threads/:id
Soft delete thread. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Thread deleted"
  }
}
```

**Errors:**
- 401: Not authenticated
- 403: Not thread author

---

### POST /threads/:id/replies
Add reply to thread. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "body": "string (1-5000 chars)"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "replyId": 457,
    "message": "Reply posted successfully"
  }
}
```

**Errors:**
- 401: Not authenticated
- 404: Thread not found
- 403: Thread locked
- 400: Invalid input
- 429: Rate limited

---

### PATCH /replies/:id
Edit reply (within 15 minutes). **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "body": "string (1-5000 chars)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Reply updated successfully",
    "editedAt": "2025-01-01T00:15:00Z"
  }
}
```

---

### DELETE /replies/:id
Soft delete reply. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Reply deleted"
  }
}
```

---

## Search Endpoints

### GET /search
Full-text search across threads and replies.

**Query Parameters:**
- `q`: search query (required, min 3 chars)
- `type`: `threads|replies|all` (default: all)
- `language`: `fr|nl|de|en|all` (default: all)
- `dateFrom`: ISO date (optional)
- `dateTo`: ISO date (optional)
- `page`: number (default: 1)
- `limit`: 10-50 (default: 25)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "type": "thread|reply",
        "id": 123,
        "title": "Thread title (if thread)",
        "snippet": "...matching text with <mark>highlighted</mark> terms...",
        "authorPseudo": "user123",
        "createdAt": "2025-01-01T00:00:00Z",
        "threadId": 123
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 42,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

---

## Moderation Endpoints

### POST /reports
Report content for moderation. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "contentType": "thread|reply",
  "contentId": 123,
  "reason": "spam|harmful|sourcing|personal_attack|other",
  "description": "string (optional, max 500 chars)"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "message": "Report submitted",
    "reportId": 789
  }
}
```

**Errors:**
- 401: Not authenticated
- 400: Invalid input
- 409: Already reported by user

---

### GET /moderation/queue
Get moderation queue. **(Moderator only)**

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": 789,
        "contentType": "thread",
        "contentId": 123,
        "contentSnippet": "First 200 chars...",
        "reportCount": 5,
        "reasons": ["spam", "harmful"],
        "createdAt": "2025-01-01T00:00:00Z",
        "status": "pending"
      }
    ]
  }
}
```

---

### POST /moderation/action
Take moderation action. **(Moderator only)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "reportIds": [789, 790],
  "action": "delete|hide|dismiss|ban",
  "reason": "string (required for delete/ban)",
  "banDuration": "number (hours, for ban action)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Action completed",
    "affectedItems": 2
  }
}
```

---

### POST /threads/:id/pin
Pin/unpin thread. **(Moderator only)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "pinned": true
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Thread pinned",
    "isPinned": true
  }
}
```

---

### POST /threads/:id/lock
Lock/unlock thread. **(Moderator only)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "locked": true,
  "reason": "string (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Thread locked",
    "isLocked": true
  }
}
```

---

## User Endpoints

### GET /users/:pseudo/posts
Get public posts by user.

**Query Parameters:**
- `type`: `threads|replies|all` (default: all)
- `page`: number (default: 1)
- `limit`: 10-50 (default: 25)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pseudo": "user123",
    "posts": [
      {
        "type": "thread|reply",
        "id": 123,
        "title": "Thread title (if thread)",
        "snippet": "First 200 chars...",
        "createdAt": "2025-01-01T00:00:00Z",
        "threadId": 123
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 42
    }
  }
}
```

---

### DELETE /users/:pseudo
Delete account and all content. **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Request:**
```json
{
  "pin": "string (4 digits)",
  "confirm": "DELETE MY ACCOUNT"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Account and all content permanently deleted"
  }
}
```

**Errors:**
- 401: Not authenticated
- 403: Not account owner
- 400: Invalid confirmation

---

### GET /users/:pseudo/export
Export all user data (GDPR). **(Authentication required)**

**Headers:**
```
Cookie: session=token
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pseudo": "user123",
    "createdAt": "2025-01-01T00:00:00Z",
    "threads": [...],
    "replies": [...],
    "exportedAt": "2025-01-15T00:00:00Z"
  }
}
```

---

## System Endpoints

### GET /health
Health check endpoint.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 3600
  }
}
```

---

### GET /resources
Get help resources by language.

**Query Parameters:**
- `language`: `fr|nl|de|en` (default: fr)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "crisis": [
      {
        "name": "Centre de Prévention du Suicide",
        "number": "0800 32 123",
        "hours": "24/7",
        "language": "fr"
      }
    ],
    "treatment": [
      {
        "name": "Infor-Drogues",
        "url": "https://infordrogues.be",
        "description": "Information et aide",
        "language": "fr"
      }
    ]
  }
}
```

---

## Rate Limiting

All endpoints implement rate limiting:

| Endpoint Type | Limit | Window |
|--------------|-------|---------|
| Registration | 2 | 1 hour |
| Login | 10 | 1 hour |
| Thread Creation | 5 | 1 hour |
| Reply Creation | 20 | 1 hour |
| Search | 30 | 1 minute |
| General API | 100 | 1 minute |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

**Error Response (429):**
```json
{
  "success": false,
  "error": "Too many requests. Please try again later.",
  "data": {
    "retryAfter": 60
  }
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 423 | Locked |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Security Headers

All responses include:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: no-referrer
```