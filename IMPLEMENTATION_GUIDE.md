# Le Syndicat des Tox - Implementation Guide

## Quick Decision Matrix

| Criteria | Custom Fastify | Modified SMF | Modified Flarum |
|----------|---------------|--------------|-----------------|
| Development Time | 3-4 weeks | 2-3 weeks | 3 weeks |
| Performance on 2G/3G | Excellent | Good | Good |
| Anonymity Control | Complete | High | Medium |
| Maintenance Burden | High | Medium | Medium |
| Community Support | None | Established | Active |
| Security Responsibility | Full | Shared | Shared |
| No-JS Operation | Native | Native | Requires work |
| Mobile Experience | Custom-built | Needs theming | Good base |
| Customization Difficulty | N/A (built custom) | Medium | High |
| Long-term Viability | Depends on team | Stable | Growing |

---

## Option 1: Custom Fastify Implementation (RECOMMENDED)

### Technology Stack
```yaml
Backend:
  - Framework: Fastify 4.x
  - Language: Node.js 20 LTS
  - Template: EJS or Handlebars (server-side)
  - Database: PostgreSQL 15
  - Session: Redis 7
  - Process Manager: PM2

Frontend:
  - HTML5 (semantic, accessible)
  - CSS3 (minimal, inline critical)
  - Zero JavaScript (progressive enhancement optional)
  - Mobile-first responsive design

Security:
  - Helmet.js for headers
  - Rate limiting per session
  - CSRF protection
  - Input sanitization (DOMPurify)
```

### Database Schema (PostgreSQL)
```sql
-- Minimal schema focused on anonymity
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER REFERENCES threads(id),
    pseudo VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    -- No IP, no user_id, no tracking
);

CREATE TABLE threads (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    pseudo VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    reply_count INTEGER DEFAULT 0
);

CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,
    pseudo VARCHAR(20) NOT NULL,
    pin_hash VARCHAR(60) NOT NULL, -- bcrypt hash
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Auto-expire after 24 hours of inactivity
);

-- Indexes for performance on slow connections
CREATE INDEX idx_threads_activity ON threads(last_activity DESC);
CREATE INDEX idx_posts_thread ON posts(thread_id, created_at);
```

### Core Features Implementation

#### 1. Authentication Module
```javascript
// Pseudo + PIN authentication (no cookies, no tracking)
async function authenticate(req, reply) {
  const { pseudo, pin } = req.body;

  // Validate pseudo (alphanumeric, 3-20 chars)
  if (!/^[a-zA-Z0-9]{3,20}$/.test(pseudo)) {
    return reply.code(400).send({ error: 'Invalid pseudo format' });
  }

  // Validate PIN (4 digits)
  if (!/^\d{4}$/.test(pin)) {
    return reply.code(400).send({ error: 'PIN must be 4 digits' });
  }

  // Generate session without storing any identifying info
  const sessionId = generateSecureRandom();
  const pinHash = await bcrypt.hash(pin, 10);

  // Store in Redis with 24hr expiry
  await redis.setex(
    `session:${sessionId}`,
    86400,
    JSON.stringify({ pseudo, pinHash })
  );

  return { sessionId };
}
```

#### 2. Lightweight HTML Templates
```html
<!-- thread-list.ejs - No JavaScript, pure HTML forms -->
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Forum de Soutien</title>
    <style>
        /* Inline critical CSS for fastest load */
        body {
            font-family: system-ui, sans-serif;
            margin: 0;
            padding: 10px;
            max-width: 600px;
            margin: 0 auto;
        }
        .thread {
            border: 1px solid #ddd;
            padding: 10px;
            margin-bottom: 10px;
        }
        /* Mobile-first, works on 2G */
        @media (max-width: 480px) {
            body { padding: 5px; }
            .thread { padding: 8px; }
        }
    </style>
</head>
<body>
    <h1>Forum de Soutien Anonyme</h1>

    <% if (!session) { %>
    <form method="POST" action="/auth">
        <input type="text" name="pseudo" placeholder="Pseudo" required>
        <input type="password" name="pin" placeholder="PIN (4 chiffres)" required>
        <button type="submit">Entrer</button>
    </form>
    <% } %>

    <% threads.forEach(thread => { %>
    <div class="thread">
        <h2><a href="/thread/<%= thread.id %>"><%= thread.title %></a></h2>
        <p>Par <%= thread.pseudo %> - <%= thread.reply_count %> réponses</p>
    </div>
    <% }) %>
</body>
</html>
```

#### 3. Performance Optimizations for 2G/3G
```javascript
// Compression and caching middleware
app.register(compress, {
  global: true,
  threshold: 1024, // Compress everything over 1KB
  encodings: ['gzip', 'deflate']
});

// Aggressive caching for static assets
app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/static/',
  cacheControl: true,
  maxAge: '30d',
  immutable: true
});

// Pagination for thread lists
app.get('/threads', async (req, reply) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10; // Small pages for fast loading

  const threads = await db.query(
    'SELECT * FROM threads WHERE is_deleted = false ' +
    'ORDER BY last_activity DESC LIMIT $1 OFFSET $2',
    [limit, (page - 1) * limit]
  );

  reply.type('text/html').send(
    renderTemplate('thread-list', { threads })
  );
});
```

---

## Option 2: Modified SMF Implementation

### Modification Strategy

#### Phase 1: Core Modifications
```php
// 1. Replace Sources/Register.php with custom pseudo+PIN system
function registerPseudoUser($pseudo, $pin) {
    // No email, no real username
    $pinHash = password_hash($pin, PASSWORD_BCRYPT);

    // Minimal user record
    $smcFunc['db_insert']('',
        '{db_prefix}members',
        array(
            'member_name' => 'string',
            'passwd' => 'string',
            'email_address' => 'string',
            'date_registered' => 'int',
        ),
        array(
            $pseudo,
            $pinHash,
            'anonymous@localhost', // Dummy email
            time(),
        ),
        array('id_member')
    );
}

// 2. Remove all tracking from Logging.php
function logAction($action, $extra = array()) {
    // Completely disabled
    return true;
}

// 3. Disable IP logging in Load.php
$user_info['ip'] = '0.0.0.0';
$user_info['ip2'] = '0.0.0.0';
```

#### Phase 2: Theme Modifications
```php
// Create minimal mobile theme
// Themes/Minimal/index.template.php
function template_html_above() {
    echo '<!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>', $context['page_title'], '</title>
        <style>
            /* Inline all CSS for single request */
            body {
                font-size: 16px;
                line-height: 1.5;
                margin: 0;
                padding: 10px;
            }
            /* Remove all unnecessary styling */
        </style>
    </head>
    <body>';
}
```

#### Phase 3: Database Cleanup
```sql
-- Remove unnecessary tables
DROP TABLE IF EXISTS smf_log_online;
DROP TABLE IF EXISTS smf_log_activity;
DROP TABLE IF EXISTS smf_log_errors;
DROP TABLE IF EXISTS smf_log_floodcontrol;
DROP TABLE IF EXISTS smf_log_search_messages;
DROP TABLE IF EXISTS smf_log_spider_hits;
DROP TABLE IF EXISTS smf_mail_queue;

-- Modify members table for anonymity
ALTER TABLE smf_members
DROP COLUMN real_name,
DROP COLUMN email_address,
DROP COLUMN member_ip,
DROP COLUMN member_ip2,
DROP COLUMN secret_question,
DROP COLUMN secret_answer;
```

---

## Option 3: Modified Flarum Approach

### Backend API Only Mode
```php
// config.php - Disable Flarum frontend entirely
return [
    'debug' => false,
    'api_only' => true, // Custom flag
    'database' => [
        'driver' => 'mysql',
        'host' => 'localhost',
        'database' => 'forum_anonymous',
        'username' => 'forum_user',
        'password' => 'secure_password',
    ],
    'url' => 'https://forum.example.com',
    'paths' => [
        'api' => 'api',
        'admin' => null, // Disable admin panel
    ],
];
```

### Custom Authentication Extension
```php
// extensions/anonymous-auth/src/AuthController.php
namespace AnonymousAuth;

use Flarum\Http\Controller\AbstractOAuth2Controller;

class AuthController {
    public function handle($request) {
        $pseudo = $request->getParsedBody()['pseudo'];
        $pin = $request->getParsedBody()['pin'];

        // Create temporary user session
        $token = $this->createAnonymousToken($pseudo, $pin);

        return new JsonResponse([
            'token' => $token,
            'pseudo' => $pseudo
        ]);
    }

    private function createAnonymousToken($pseudo, $pin) {
        // No database user creation
        // Just session token
        return bin2hex(random_bytes(32));
    }
}
```

### Lightweight Frontend
```html
<!-- Static HTML with form-based interactions -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        /* Ultra-minimal CSS */
        * { box-sizing: border-box; }
        body {
            font: 16px/1.5 -apple-system, system-ui, sans-serif;
            margin: 0;
            padding: 1rem;
            max-width: 40rem;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <!-- Pure HTML forms posting to Flarum API -->
    <form action="/api/posts" method="POST">
        <input type="hidden" name="session" value="">
        <textarea name="content" required></textarea>
        <button>Envoyer</button>
    </form>
</body>
</html>
```

---

## Deployment Considerations

### Server Requirements (Minimal)
- **VPS:** 1 vCPU, 1GB RAM minimum
- **OS:** Ubuntu 22.04 LTS or Debian 12
- **Reverse Proxy:** Nginx (for caching and compression)
- **SSL:** Let's Encrypt
- **Firewall:** UFW with strict rules
- **No logging:** Disable all access logs

### Nginx Configuration for Anonymity
```nginx
server {
    listen 443 ssl http2;
    server_name forum.example.com;

    # No access logs
    access_log off;
    error_log /dev/null;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "no-referrer";

    # Cache static content aggressively
    location ~* \.(css|js|jpg|jpeg|png|gif|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Proxy to app
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        # Don't forward real IP
        proxy_set_header X-Real-IP "0.0.0.0";
        proxy_set_header X-Forwarded-For "0.0.0.0";
    }
}
```

### Testing for Low Bandwidth
```bash
# Simulate 2G connection (50 Kbps)
npm install -g throttle
throttle 50 npm run dev

# Test with Chrome DevTools
# Network tab > Slow 3G preset

# Measure page load time
curl -w "@curl-format.txt" -o /dev/null -s https://forum.example.com
```

---

## Immediate Next Steps

1. **If choosing Custom Fastify:**
   - Set up basic project structure
   - Implement authentication module
   - Create database schema
   - Build thread listing page

2. **If choosing Modified SMF:**
   - Download SMF 2.1
   - Set up development environment
   - Begin removing user system
   - Create minimal theme

3. **If choosing Modified Flarum:**
   - Install Flarum
   - Disable frontend
   - Create authentication extension
   - Build HTML-only frontend

## Final Notes
- Always test on actual 2G/3G connections
- Use real low-end Android devices for testing
- Consider Progressive Web App for offline access
- Implement content moderation tools early
- Plan for scaling if community grows