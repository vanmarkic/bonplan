# Le Syndicat des Tox - Forum Library Audit Report
## Anonymous Peer Support Forum for Belgian Drug Addict Community

### Executive Summary
After comprehensive research of available forum libraries and frameworks, this report evaluates options against critical requirements: 100% anonymity, extreme lightweight performance for low-spec devices and poor networks (2G/3G), and the ability to implement pseudo+4-digit PIN authentication without traditional user tracking.

---

## 1. JavaScript/Node.js Forum Libraries

### Discourse
**License:** GPL-2.0
**Technology:** Ruby on Rails backend, Ember.js frontend
**Database:** PostgreSQL

**Pros:**
- Highly feature-rich and mature platform
- Excellent mobile support with Progressive Web App capabilities
- Strong community and active development
- Extensive plugin ecosystem

**Cons:**
- **HEAVYWEIGHT** - Requires minimum 2GB RAM, dual-core CPU
- JavaScript-heavy, won't work without JS
- Complex architecture, difficult to strip down
- Built-in user tracking and analytics difficult to remove
- Resource-intensive for poor networks

**Verdict:** ❌ **NOT RECOMMENDED** - Too heavy for requirements

---

### NodeBB
**License:** GPL-3.0
**Technology:** Node.js, Socket.io
**Database:** Redis/MongoDB

**Pros:**
- Real-time features via WebSockets
- Mobile-responsive design
- RESTful API available
- Active development

**Cons:**
- Requires WebSocket connections (poor on 2G/3G)
- Complex user system deeply integrated
- Not classified as lightweight (per user reports)
- Difficult to implement simple pseudo+PIN auth

**Verdict:** ❌ **NOT RECOMMENDED** - WebSocket dependency problematic for poor networks

---

### Flarum
**License:** MIT
**Technology:** PHP backend, Mithril.js frontend
**Database:** MySQL/MariaDB

**Pros:**
- **Lightweight** compared to Discourse/NodeBB
- Mobile-first design
- Clean, modern interface
- Fast performance
- Extensible with plugins
- Version 2.0 coming in 2024

**Cons:**
- Still requires JavaScript for frontend
- User system integral to architecture
- Would require significant modification for pseudo+PIN
- Limited anonymous posting support

**Verdict:** ⚠️ **POSSIBLE WITH HEAVY MODIFICATION** - Most promising of modern forums

---

## 2. PHP-Based Traditional Forums

### phpBB
**License:** GPL-2.0
**Technology:** PHP
**Database:** MySQL/PostgreSQL/SQLite

**Pros:**
- Mature, stable platform (20+ years)
- Works without JavaScript (basic functionality)
- Extensive documentation
- Large community
- Can be lightweight with careful configuration

**Cons:**
- Complex user system
- Many features unnecessary for use case
- Security requires constant updates
- Mobile experience dated without responsive themes

**Verdict:** ⚠️ **POSSIBLE** - Could work if heavily stripped down

---

### Simple Machines Forum (SMF)
**License:** BSD
**Technology:** PHP
**Database:** MySQL/PostgreSQL

**Pros:**
- **Excellent security record** (12.5/15 rating)
- Minimal features available
- Works without JavaScript
- Lighter than phpBB
- Good for public forums

**Cons:**
- User registration system integral
- Mobile experience needs work
- Less active development than alternatives

**Verdict:** ✅ **RECOMMENDED FOR MODIFICATION** - Good security, minimal features

---

### MyBB
**License:** LGPL-3.0
**Technology:** PHP
**Database:** MySQL/PostgreSQL/SQLite

**Pros:**
- User-friendly administration
- Clean interface
- Lighter than phpBB
- Plugin system for customization
- Works mostly without JavaScript

**Cons:**
- User system deeply integrated
- Mobile responsiveness depends on theme
- Would need significant auth modifications

**Verdict:** ⚠️ **POSSIBLE** - Clean and lightweight enough to consider

---

## 3. Minimalist & Anonymous Options

### Agreper
**License:** Open Source
**Technology:** Unknown (from GitHub)
**URL:** github.com/Demindiro/agreper

**Pros:**
- **NO JAVASCRIPT REQUIRED**
- Minimal design philosophy
- Lightweight by design
- Progressive enhancement approach

**Cons:**
- Limited documentation
- Small community
- May lack features needed for support forum
- Uncertain maintenance status

**Verdict:** ✅ **INVESTIGATE FURTHER** - Aligns with no-JS requirement

---

### LynxChan
**License:** MIT
**Technology:** Node.js
**Database:** MongoDB

**Pros:**
- Designed for anonymous imageboards
- No registration required by default
- Lightweight compared to traditional forums
- Active development
- Used by multiple anonymous communities

**Cons:**
- Imageboard format, not traditional forum
- MongoDB requirement
- May have features unnecessary for text-only support

**Verdict:** ⚠️ **POSSIBLE** - Good anonymity features but imageboard-focused

---

### jschan
**License:** AGPL-3.0
**Technology:** Node.js
**Database:** MongoDB

**Pros:**
- Anonymous by design
- Actively maintained (popular in 2024)
- Good functionality with fewer bugs
- Used by multiple active communities

**Cons:**
- Imageboard software, not forum
- MongoDB dependency
- May be overkill for text-only support

**Verdict:** ⚠️ **POSSIBLE** - Modern anonymous platform

---

## 4. Build-From-Scratch Options

### Express.js Custom Build
**Estimated Effort:** 3-4 weeks for MVP

**Pros:**
- Complete control over features
- Minimal dependencies
- Can optimize for exact requirements
- No unnecessary features

**Cons:**
- Security responsibility
- Maintenance burden
- No community support
- Longer initial development

---

### Fastify Custom Build
**Estimated Effort:** 3-4 weeks for MVP

**Pros:**
- **30,000 requests/second performance**
- Lighter than Express
- Schema validation built-in
- Plugin architecture
- TypeScript support

**Cons:**
- Same as Express (security, maintenance)
- Less community resources than Express

**Verdict:** ✅ **RECOMMENDED** if building from scratch

---

## 5. Headless/API Approaches

While researched, headless CMS platforms (Strapi, Directus, Payload) are not designed for forum functionality and would require extensive customization to support threaded discussions, making them unsuitable for this use case.

---

## Final Recommendations

### Option 1: Modified SMF (Simple Machines Forum) - RECOMMENDED
**Approach:** Strip down SMF, replace auth system with pseudo+PIN

**Implementation Plan:**
1. Remove all user registration/profile modules
2. Implement custom pseudo+PIN authentication
3. Disable all tracking and analytics
4. Create minimal mobile theme
5. Remove unnecessary features (private messages, user profiles, etc.)
6. Configure for PostgreSQL/MariaDB

**Pros:**
- Proven security record
- PHP-based (widely hostable)
- Works without JavaScript
- Established codebase

**Cons:**
- Requires significant modification
- May have licensing considerations for modifications

**Estimated Effort:** 2-3 weeks

---

### Option 2: Custom Fastify Build - RECOMMENDED
**Approach:** Build minimal forum from scratch using Fastify

**Architecture:**
```
- Fastify backend (API-only)
- Server-side rendered HTML (no client JS required)
- PostgreSQL for data
- Redis for sessions (pseudo+PIN)
- Progressive enhancement for better networks
```

**Features:**
- Thread creation with pseudo+PIN
- Reply to threads
- Report harmful content
- Basic moderation tools
- Zero JavaScript requirement
- Optimized for 2G/3G

**Pros:**
- Exactly what you need, nothing more
- Optimal performance
- Complete anonymity control
- Modern, maintainable code

**Cons:**
- More initial development time
- Security responsibility

**Estimated Effort:** 3-4 weeks

---

### Option 3: Modified Flarum - ALTERNATIVE
**Approach:** Heavy modification of Flarum with custom frontend

**Implementation:**
1. Use Flarum PHP backend API only
2. Build custom lightweight HTML frontend
3. Replace authentication entirely
4. Remove all unnecessary extensions

**Pros:**
- Modern, maintained codebase
- Good API structure
- Active community

**Cons:**
- Significant modification required
- May fight against framework assumptions

**Estimated Effort:** 3 weeks

---

## Security & Privacy Considerations

### Critical Requirements:
1. **No IP logging** - Configure server to not log IPs
2. **No cookies** except session (pseudo+PIN)
3. **No analytics or tracking scripts**
4. **No CDN dependencies** (host all assets locally)
5. **HTTPS only** with proper certificates
6. **No email functionality**
7. **No file uploads** (text only)
8. **Rate limiting** by session, not IP

### Database Recommendations:
- **PostgreSQL** - Best performance and reliability
- **MariaDB** - Good alternative, lighter
- Avoid NoSQL for this use case (unnecessary complexity)

---

## Final Verdict

**PRIMARY RECOMMENDATION:** Build custom with Fastify
- Gives complete control over anonymity
- Optimized for exact requirements
- No framework fighting
- Best performance for poor networks

**SECONDARY RECOMMENDATION:** Modified SMF
- Proven security
- Faster to implement
- Established patterns

**NOT RECOMMENDED:**
- Discourse (too heavy)
- NodeBB (WebSocket dependency)
- Any imageboard software (wrong format)
- Headless CMS platforms (not designed for forums)

The sensitive nature of this project (drug addiction support) and strict anonymity requirements strongly favor a custom build or heavily modified traditional forum over modern JavaScript-heavy platforms.