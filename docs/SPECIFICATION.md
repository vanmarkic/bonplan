# Le Syndicat des Tox - Specification
## Anonymous Peer Support Forum for Belgian Drug Addict Communities

Version: 1.0
Date: November 17, 2025
Status: Draft

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Authentication System Design](#authentication-system-design)
3. [Forum Features](#forum-features)
4. [Anonymity & Security](#anonymity--security)
5. [Performance & Accessibility](#performance--accessibility)
6. [Data Model](#data-model)
7. [Belgian Context](#belgian-context)
8. [Technical Architecture](#technical-architecture)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

### Mission Statement
To provide a 100% anonymous, accessible, and safe digital space for Belgian drug addict communities to share experiences, seek support, and help each other through peer-to-peer interactions.

### Core Principles
- **Absolute Anonymity**: No personal data collection whatsoever
- **Radical Accessibility**: Works on any device, any connection
- **Community Safety**: Balance between openness and protection
- **Harm Reduction Focus**: Evidence-based approach to substance use support

### Key Constraints
- Users identified only by pseudo + 4-digit PIN
- All content publicly readable
- Optimized for low-spec devices and poor connectivity
- Belgian legal and cultural context

---

## Authentication System Design

### 1.1 Core Authentication Flow

#### Registration
```
1. User chooses unique pseudo (username)
2. User sets 4-digit PIN
3. System validates pseudo uniqueness
4. Account created immediately (no email/verification)
```

**Pseudo Requirements:**
- Length: 3-20 characters
- Allowed: alphanumeric, underscores, hyphens
- Case-insensitive for uniqueness check
- Displayed as user typed it
- Cannot be changed after creation (prevents impersonation)

**PIN Requirements:**
- Exactly 4 digits (0000-9999)
- No sequential validation (1234 allowed - user choice)
- No reuse prevention (anonymity > security)

### 1.2 PIN Security

#### Hashing Strategy
```
Algorithm: Argon2id
Memory: 64 MB
Iterations: 3
Parallelism: 1
Salt: Per-user random (32 bytes)
```

**Rationale:** Argon2id provides strong resistance against both GPU and side-channel attacks while maintaining reasonable performance on low-spec servers.

#### Brute Force Protection
```
After 5 failed attempts: 30-minute lockout
```

**Implementation:**
- Track attempts by pseudo only (not IP - preserves anonymity)
- Store in Redis with TTL of 30 minutes
- Clear counter on successful login
- Simple, predictable behavior for users

### 1.3 Session Management

#### Session Token Design
```
Format: Random 32-byte token (base64url encoded)
Storage: Server-side only (Redis)
Duration: 7 days rolling window
Renewal: On each authenticated request
```

#### Client Storage
```
Cookie Settings:
- HttpOnly: true
- Secure: true (HTTPS only)
- SameSite: Strict
- Path: /
- No domain restriction
```

### 1.4 Account Recovery

**NO RECOVERY MECHANISM**

**Rationale:** Any recovery mechanism would compromise anonymity. Users must understand:
- Forgotten PIN = permanent account loss
- This is a feature, not a bug
- Protects user even under coercion

**User Communication:**
- Clear warning during registration
- Suggest writing PIN in safe place
- Emphasize irreversibility

---

## Forum Features

### 2.1 Content Structure

#### Thread Model
```
Thread
├── Title (required, 5-200 chars)
├── Body (required, 10-10000 chars)
├── Author (pseudo)
├── Created timestamp
├── Last activity timestamp
├── Reply count
├── Pinned flag (moderator only)
└── Replies[]
    ├── Body (required, 1-5000 chars)
    ├── Author (pseudo)
    ├── Created timestamp
    └── Deleted flag
```

### 2.2 Core Functionality

#### Posting Capabilities
- **Create Thread**: Any authenticated user
- **Reply to Thread**: Any authenticated user
- **Edit Own Content**: Within 15 minutes of posting
- **Delete Own Content**: Soft delete only (shows [deleted])

#### Reading Capabilities
- **View All Threads**: No authentication required
- **View Thread Details**: No authentication required
- **Search Content**: No authentication required

### 2.3 Discovery & Navigation

#### Sorting Options
1. **Recent Activity** (default): Last reply/post time
2. **Newest First**: Creation time descending
3. **Most Replies**: Engagement metric

#### Search Features
- Full-text search on titles and bodies
- Language-aware stemming (FR/NL/DE)
- Results ranked by relevance
- Filter by date range
- No user search (anonymity)

### 2.4 Moderation System

#### Community Moderation
- **Report Button**: Threshold-based (5 unique reports = review)
- **Temporary Hide**: Auto-hide after 10 reports pending review
- **Vote to Restore**: Community can vote to unhide

#### Moderator Capabilities
- Selected trusted community members
- Can pin/unpin threads
- Can permanently remove harmful content
- Cannot see IPs or any user data
- Actions logged but anonymized

### 2.5 Content Policies

#### Allowed Content
- Personal experiences with addiction
- Requests for emotional support
- Harm reduction information
- Recovery stories and encouragement
- Resource sharing (clinics, services)
- Coping strategies

#### Prohibited Content
- Drug sourcing or sales
- Encouraging dangerous use
- Personal attacks or doxxing
- Spam or commercial content
- Graphic content without warning
- Suicide methods (redirect to help)

---

## Anonymity & Security

### 3.1 Data Never Collected

**Absolute Prohibition List:**
- IP addresses (use proxy/reverse proxy)
- Email addresses
- Phone numbers
- Real names
- Location data
- Browser fingerprints
- Device identifiers
- Analytics or tracking pixels
- Third-party cookies
- Social media integrations

### 3.2 Anti-Tracking Measures

#### Technical Implementation
```nginx
# Nginx configuration
proxy_set_header X-Real-IP "";
proxy_set_header X-Forwarded-For "";
access_log off;
error_log /var/log/nginx/error.log warn;
```

#### Client-Side
```javascript
// Disable all tracking
window.ga = undefined;
window.gtag = undefined;
// No external resources
// No CDNs
// All assets self-hosted
```

### 3.3 Rate Limiting

#### By Action Type
```
Registration: 2 per hour per IP block (/24)
Login: 10 per hour per pseudo
Post Creation: 5 per hour per user
Replies: 20 per hour per user
Search: 30 per minute per session
```

**Implementation:** Token bucket algorithm with Redis

### 3.4 GDPR Compliance

#### Data Minimization
- Store absolute minimum data
- No data retention beyond necessity
- Automatic purge of old sessions

#### User Rights
- **Right to Access**: Show all posts by pseudo
- **Right to Deletion**: Hard delete on request
- **Right to Portability**: Export posts as JSON
- **No Right to Rectification**: Cannot edit pseudo (security)

#### Legal Basis
- Legitimate interest: peer support service
- No consent needed: no personal data
- Clear privacy notice on homepage

---

## Performance & Accessibility

### 4.1 Performance Targets

#### Core Web Vitals
```
LCP (Largest Contentful Paint): < 2.5s on 3G
FID (First Input Delay): < 100ms
CLS (Cumulative Layout Shift): < 0.1
```

#### Bundle Sizes
```
HTML: < 10KB per page
CSS: < 20KB total (inlined critical)
JS: < 30KB total (optional enhancement)
Total first load: < 50KB
```

### 4.2 Progressive Enhancement Strategy

#### Level 1: HTML Only
- Full functionality without JavaScript
- Form-based interactions
- Server-side rendering
- Works on any browser

#### Level 2: CSS Enhancement
- Improved layout and readability
- Mobile responsive design
- High contrast mode support
- Print stylesheet

#### Level 3: JavaScript Enhancement
- Auto-refresh for new posts
- Inline reply forms
- Client-side search filtering
- Optimistic UI updates

### 4.3 Mobile-First Design

#### Viewport Optimization
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

#### Touch Targets
- Minimum 44x44px tap targets
- 8px minimum spacing between targets
- Large, clear buttons

#### Typography
```css
:root {
  --base-font: 16px; /* Minimum for readability */
  --line-height: 1.5;
  --paragraph-spacing: 1em;
}
```

### 4.4 Offline Support

#### Service Worker Strategy
```javascript
// Cache-first for assets
// Network-first for content
// Offline page for failures
```

#### Local Storage
- Draft posts saved locally
- Last read position
- User preferences
- No sensitive data

### 4.5 Accessibility Standards

#### WCAG 2.1 Level AA Compliance
- Semantic HTML structure
- ARIA labels where needed
- Keyboard navigation
- Screen reader tested

#### Color & Contrast
```css
:root {
  --text-color: #000;
  --bg-color: #fff;
  --link-color: #0050C5; /* 4.5:1 ratio */
  --error-color: #D30000; /* 4.5:1 ratio */
}

@media (prefers-color-scheme: dark) {
  /* Auto dark mode */
}
```

---

## Data Model

### 5.1 User Schema

```sql
CREATE TABLE users (
    pseudo VARCHAR(20) PRIMARY KEY,
    pin_hash VARCHAR(128) NOT NULL,
    pin_salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMP NULL,
    post_count INT DEFAULT 0,
    is_moderator BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT NULL,
    INDEX idx_created (created_at),
    INDEX idx_last_login (last_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.2 Thread Schema

```sql
CREATE TABLE threads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    author_pseudo VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reply_count INT DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    report_count INT DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr',
    FOREIGN KEY (author_pseudo) REFERENCES users(pseudo),
    FULLTEXT KEY idx_search (title, body),
    INDEX idx_activity (last_activity DESC),
    INDEX idx_created (created_at DESC),
    INDEX idx_author (author_pseudo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.3 Reply Schema

```sql
CREATE TABLE replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    thread_id INT NOT NULL,
    body TEXT NOT NULL,
    author_pseudo VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    report_count INT DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (author_pseudo) REFERENCES users(pseudo),
    FULLTEXT KEY idx_search (body),
    INDEX idx_thread (thread_id, created_at),
    INDEX idx_author (author_pseudo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.4 Session Schema (Redis)

```json
{
  "key": "session:{token}",
  "value": {
    "pseudo": "user123",
    "created": "2025-01-01T00:00:00Z",
    "last_active": "2025-01-01T00:00:00Z",
    "ip_hash": "anonymized_hash"
  },
  "ttl": 604800
}
```

### 5.5 Rate Limit Schema (Redis)

```json
{
  "key": "rate:{action}:{identifier}",
  "value": 5,
  "ttl": 3600
}
```

---

## Belgian Context

### 6.1 Language Support

#### Primary Languages
1. **French** (40% of population)
2. **Dutch** (60% of population)
3. **German** (< 1% but official)

#### Implementation Strategy
```
- Interface: Fully translated
- Content: Language tagged, not translated
- Default: Browser language detection
- Override: User preference (localStorage)
```

#### Translation Management
```yaml
i18n:
  languages: [fr, nl, de, en]
  fallback: fr
  detection:
    - localStorage
    - navigator.language
    - default
```

### 6.2 Local Resources Integration

#### Crisis Hotlines
```javascript
const CRISIS_NUMBERS = {
  fr: {
    name: "Centre de Prévention du Suicide",
    number: "0800 32 123",
    hours: "24/7"
  },
  nl: {
    name: "Zelfmoordlijn",
    number: "1813",
    hours: "24/7"
  },
  drugs: {
    name: "Druglijn",
    number: "078 15 10 20",
    hours: "Ma-Vr 10-20h"
  }
};
```

#### Treatment Centers
- Link to official directories
- No endorsements
- Geographic anonymity maintained

### 6.3 Legal Considerations

#### Belgian Drug Policy
- **Harm Reduction**: Legally supported approach
- **Drug Consumption Rooms**: Legal framework exists
- **Medical Confidentiality**: Strong protections

#### Content Guidelines
- Follow Belgian harm reduction guidelines
- No promotion of illegal activities
- Medical advice disclaimer
- Age verification notice (18+)

#### Data Protection
- GDPR compliance mandatory
- Belgian Privacy Commission guidelines
- No data transfer outside EU
- Server hosting in Belgium required

### 6.4 Cultural Sensitivities

#### Communication Style
- Direct but respectful tone
- Avoid stigmatizing language
- Use person-first language
- Respect for privacy paramount

#### Community Norms
- No judgment policy
- Peer support emphasis
- Professional boundary respect
- Cultural diversity awareness

---

## Technical Architecture

### 7.1 Technology Stack

#### Backend
```yaml
Language: Node.js 20 LTS
Framework: Express.js (minimal)
Database: MariaDB 10.11
Cache: Redis 7
Session: express-session + connect-redis
Template: EJS (server-side rendering)
```

#### Frontend
```yaml
HTML: Semantic HTML5
CSS: Vanilla CSS (no framework)
JS: Vanilla ES6 (progressive enhancement)
Build: esbuild (minimal bundling)
```

### 7.2 Infrastructure

#### Deployment Architecture
```
[Cloudflare] -> [Nginx] -> [Node.js App] -> [MariaDB]
                                          -> [Redis]
```

#### Security Layers
1. **Cloudflare**: DDoS protection, IP anonymization
2. **Nginx**: Rate limiting, header stripping
3. **Application**: Input validation, CSRF protection
4. **Database**: Prepared statements, minimal privileges

### 7.3 Development Practices

#### Code Standards
- ESLint for JavaScript
- Prettier for formatting
- Conventional commits
- 100% test coverage for auth

#### Security Practices
- OWASP Top 10 compliance
- Regular dependency updates
- Security headers (CSP, HSTS)
- No external dependencies in production

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [x] Specification document
- [ ] Database schema implementation
- [ ] Basic authentication system
- [ ] Session management
- [ ] Core security measures

### Phase 2: Core Forum (Weeks 5-8)
- [ ] Thread creation and display
- [ ] Reply functionality
- [ ] Basic moderation tools
- [ ] Search implementation
- [ ] Mobile responsive design

### Phase 3: Enhancement (Weeks 9-12)
- [ ] Multi-language support
- [ ] Progressive enhancement
- [ ] Service worker for offline
- [ ] Performance optimization
- [ ] Accessibility audit

### Phase 4: Community (Weeks 13-16)
- [ ] Community moderation features
- [ ] Resource integration
- [ ] Extended search capabilities
- [ ] Admin dashboard
- [ ] Analytics (privacy-preserving)

### Phase 5: Launch Preparation
- [ ] Security audit
- [ ] Load testing
- [ ] Legal review
- [ ] Community guidelines
- [ ] Moderator training

### Phase 6: Post-Launch
- [ ] User feedback integration
- [ ] Performance monitoring
- [ ] Incremental improvements
- [ ] Community growth management
- [ ] Regular security updates

---

## Appendices

### A. Security Checklist
- [ ] HTTPS only deployment
- [ ] Security headers configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF tokens
- [ ] Rate limiting active
- [ ] No sensitive data in logs
- [ ] Regular security updates
- [ ] Incident response plan

### B. Performance Checklist
- [ ] < 50KB initial payload
- [ ] < 2.5s LCP on 3G
- [ ] Images optimized and lazy loaded
- [ ] Critical CSS inlined
- [ ] JavaScript deferred
- [ ] Gzip compression enabled
- [ ] Browser caching configured
- [ ] Database queries optimized
- [ ] Redis caching implemented
- [ ] CDN configured (Cloudflare)

### C. Accessibility Checklist
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigation complete
- [ ] Screen reader tested
- [ ] Color contrast verified
- [ ] Focus indicators visible
- [ ] Error messages clear
- [ ] Form labels proper
- [ ] ARIA landmarks used
- [ ] Language attributes set
- [ ] Alternative text provided

### D. Legal Compliance Checklist
- [ ] GDPR compliance verified
- [ ] Privacy policy drafted
- [ ] Terms of service created
- [ ] Cookie policy implemented
- [ ] Age verification notice
- [ ] Medical disclaimer
- [ ] Harm reduction guidelines
- [ ] Report abuse mechanism
- [ ] Data retention policy
- [ ] Law enforcement protocol

---

## Document Control

**Version History:**
- v1.0 - Initial specification (2025-11-17)

**Review Schedule:**
- Technical Review: Before Phase 1 completion
- Legal Review: Before Phase 4 completion
- Security Review: Before Phase 5 completion
- Post-Launch Review: 3 months after launch

**Approval Required From:**
- Technical Lead
- Security Officer
- Legal Counsel
- Community Representative
- Project Sponsor

---

*This specification prioritizes the safety, anonymity, and dignity of vulnerable community members seeking peer support.*