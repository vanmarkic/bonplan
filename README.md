# Le Syndicat des Tox

A secure, anonymous peer support platform for Belgian drug addict communities, prioritizing user privacy, safety, and accessibility.

## Core Principles

- **100% Anonymity**: No email, real names, or IP tracking
- **Radical Accessibility**: Works on any device, any connection
- **Community-Driven**: Peer-to-peer support without judgment
- **Harm Reduction**: Evidence-based approach to substance use

## Documentation

### Essential Reading

1. **[Full Specification](docs/SPECIFICATION.md)** - Complete system design and requirements
2. **[Security Implementation](docs/SECURITY_IMPLEMENTATION.md)** - Critical security measures (MUST READ)
3. **[API Documentation](docs/API_ENDPOINTS.md)** - All endpoints and contracts
4. **[Database Schema](docs/DATABASE_SCHEMA.sql)** - Complete database structure

## Quick Start

### Prerequisites

- Node.js 20 LTS or higher
- MariaDB 10.11 or higher
- Redis 7 or higher
- Nginx (for production)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bonplan.git
   cd bonplan
   ```

2. **Install dependencies**
   ```bash
   npm install --production
   ```

3. **Configure the application**
   ```bash
   cp config/app.config.example.js config/app.config.js
   # Edit config/app.config.js with your settings
   ```

4. **Set up the database**
   ```bash
   mysql -u root -p < docs/DATABASE_SCHEMA.sql
   ```

5. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with secure values
   ```

6. **Start the application**
   ```bash
   npm start
   ```

### Development

```bash
# Install dev dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Check code style
npm run lint
```

## Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────────┐
│  Cloudflare │────>│  Nginx   │────>│   Node.js    │
│    (CDN)    │     │ (Reverse │     │  Express.js  │
└─────────────┘     │  Proxy)  │     └──────────────┘
                    └──────────┘              │
                                              ├────> MariaDB
                                              └────> Redis
```

## Security Features

- **Argon2id** PIN hashing with 64MB memory cost
- **Zero IP logging** - Complete anonymization at proxy level
- **Session-based auth** - No JWT tokens that could leak
- **Aggressive rate limiting** - Protection against abuse
- **Input sanitization** - XSS and SQL injection prevention
- **CSP headers** - Defense in depth
- **No external resources** - Everything self-hosted

## Key Features

### For Users
- Simple pseudo + 4-digit PIN authentication
- Public forum with threads and replies
- Multi-language support (FR/NL/DE/EN)
- Works on low-spec devices
- No registration barriers

### For Moderators
- Community-driven moderation
- Report threshold system
- Minimal privilege access
- Audit trail for actions
- No access to user data

## Language Support

The platform supports Belgium's official languages:
- French (Français)
- Dutch (Nederlands)
- German (Deutsch)
- English (International)

## Performance Targets

- **< 50KB** initial page load
- **< 2.5s** Largest Contentful Paint on 3G
- **< 100ms** First Input Delay
- Works without JavaScript
- Progressive enhancement

## Privacy & Legal

- **GDPR Compliant**: Minimal data, user rights respected
- **No tracking**: Zero analytics, no cookies beyond session
- **Data minimization**: Only pseudo, PIN hash, and posts stored
- **Belgian hosting**: Data never leaves Belgium

## Support Resources

The platform integrates with Belgian crisis and support services:

- **Centre de Prévention du Suicide**: 0800 32 123 (24/7)
- **Zelfmoordlijn**: 1813 (24/7)
- **Druglijn**: 078 15 10 20
- **Infor-Drogues**: 02 227 52 52

## Contributing

This project serves a vulnerable community. All contributions must:

1. Maintain absolute user anonymity
2. Follow security best practices
3. Ensure accessibility standards
4. Respect the harm reduction approach
5. Be thoroughly tested

Please read [SECURITY_IMPLEMENTATION.md](docs/SECURITY_IMPLEMENTATION.md) before contributing.

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# Accessibility tests
npm run test:a11y

# All tests
npm test
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment instructions.

Critical deployment requirements:
- HTTPS only
- Belgian hosting
- Nginx with anonymization
- Redis with password
- Database with limited privileges
- Regular security updates

## Emergency Procedures

If you suspect a security incident:

1. Immediately enable maintenance mode
2. Flush all Redis sessions
3. Review logs (no IPs should be present)
4. Contact security team
5. Follow incident response protocol

## License

This project is released under the AGPL-3.0 License to ensure it remains free and open for the community it serves.

## Acknowledgments

Built with deep respect for the dignity and privacy of people struggling with addiction. This platform aims to provide a safe space for peer support without judgment or surveillance.

---

**For Users**: If you need immediate help, please call the crisis numbers listed above. This platform is for peer support, not emergency services.

**For Developers**: Remember that every line of code affects real people in vulnerable situations. Code with compassion.