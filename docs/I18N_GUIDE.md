# Le Syndicat des Tox - Internationalization (i18n) Guide

## Overview

Le Syndicat des Tox supports **4 languages** to serve Belgian communities:

- **French (fr)** - Primary language
- **Dutch (nl)** - Flemish communities
- **German (de)** - German-speaking community
- **English (en)** - International users

## Translation Files

All translations are stored in `/locales/` directory:

```
locales/
├── fr.json (11KB, 281 lines) - French translations
├── nl.json (10KB, 281 lines) - Dutch translations
├── de.json (11KB, 282 lines) - German translations
└── en.json (9.7KB, 282 lines) - English translations
```

## Translation Structure

Each language file contains organized sections:

### Main Sections

1. **app** - Application name and tagline
2. **nav** - Navigation menu items
3. **auth** - Authentication and registration
4. **validation** - Form validation messages
5. **forum** - Forum features (threads, replies, etc.)
6. **moderation** - Moderation tools and actions
7. **user** - User profile and account management
8. **resources** - Crisis resources and help lines
9. **privacy** - Privacy and anonymity information
10. **accessibility** - Accessibility features
11. **time** - Time-related strings (relative times, durations)
12. **errors** - Error messages
13. **actions** - Common action buttons
14. **languages** - Language selector
15. **community** - Community guidelines
16. **pagination** - Pagination controls
17. **settings** - Settings and preferences

## Belgian Crisis Resources

### French (fr)
- **Centre de Prévention du Suicide**: 0800 32 123 (24/7)
- **Infor-Drogues**: 02 227 52 52

### Dutch (nl)
- **Zelfmoordlijn**: 1813 (24/7)
- **Druglijn**: 078 15 10 20

### German (de)
- **Telefonhilfe**: 108 (24/7)
- **Drogenhilfe**: 078 15 10 20

### Emergency (all languages)
- **Emergency services**: 112

## Usage in Code

### Server-side (Express routes/controllers)

```javascript
// Using in route handlers
app.get('/example', (req, res) => {
  const message = req.t('forum.threadCreated');
  const count = req.tn('forum.replyCount', 5); // Handles pluralization

  res.json({
    message,
    count
  });
});
```

### Client-side (EJS templates)

```ejs
<!-- Simple translation -->
<h1><%= t('app.name') %></h1>

<!-- With variables -->
<p><%= t('auth.welcomeBack', { pseudo: user.pseudo }) %></p>

<!-- Pluralization -->
<span><%= tn('forum.replyCount', thread.replyCount) %></span>

<!-- Nested objects -->
<button><%= t('actions.submit') %></button>
```

### Setting User Language

Language can be set via:

1. **User preference** (stored in database):
```javascript
const user = await User.findByPseudo(pseudo);
req.setLocale(user.preferredLanguage || 'fr');
```

2. **Query parameter**:
```
/threads?lang=nl
```

3. **Cookie** (named 'language'):
```javascript
res.cookie('language', 'de');
```

4. **Default fallback**: French (fr)

## Key Phrases by Language

### Welcome Message
- **FR**: "Bienvenue au Syndicat des Tox"
- **NL**: "Welkom bij Le Syndicat des Tox"
- **DE**: "Willkommen bei Le Syndicat des Tox"
- **EN**: "Welcome to Le Syndicat des Tox"

### Anonymity & Safety
- **FR**: "100% anonyme", "Espace sûr et sans jugement"
- **NL**: "100% anoniem", "Veilige en oordeelvrije ruimte"
- **DE**: "100% anonym", "Sicherer und urteilsfreier Raum"
- **EN**: "100% anonymous", "Safe and judgment-free space"

### Harm Reduction
- **FR**: "Approche de réduction des risques"
- **NL**: "Risicoverminderingsaanpak"
- **DE**: "Schadensminimierungsansatz"
- **EN**: "Harm reduction approach"

## Pluralization

i18n automatically handles pluralization using `_plural` suffix:

```json
{
  "replyCount": "{{count}} réponse",
  "replyCount_plural": "{{count}} réponses"
}
```

Usage:
```javascript
req.tn('forum.replyCount', 1);  // "1 réponse"
req.tn('forum.replyCount', 5);  // "5 réponses"
```

## Variable Interpolation

Use `{{variableName}}` syntax:

```json
{
  "welcomeBack": "Bon retour, {{pseudo}}"
}
```

Usage:
```javascript
req.t('auth.welcomeBack', { pseudo: 'Alice' });  // "Bon retour, Alice"
```

## Nested Object Notation

Access nested translations using dot notation:

```json
{
  "moderation": {
    "reason": {
      "spam": "Spam ou publicité",
      "harmful": "Contenu dangereux ou nuisible"
    }
  }
}
```

Usage:
```javascript
req.t('moderation.reason.spam');  // "Spam ou publicité"
```

## Adding New Translations

1. Add key to all 4 language files:

```json
// fr.json
"new": {
  "feature": "Nouvelle fonctionnalité"
}

// nl.json
"new": {
  "feature": "Nieuwe functie"
}

// de.json
"new": {
  "feature": "Neue Funktion"
}

// en.json
"new": {
  "feature": "New feature"
}
```

2. Use in code:
```javascript
req.t('new.feature');
```

## Translation Principles

### Tone and Style
- **Respectful and non-judgmental** - Harm reduction approach
- **Clear and simple** - Accessible to all literacy levels
- **Culturally appropriate** - Belgian context
- **Welcoming and safe** - Emphasize anonymity and peer support

### Terminology Consistency
- Use consistent terms across all languages
- Avoid medical jargon
- Emphasize community and mutual aid
- Maintain anonymous/peer-support language

### Length Considerations
- Keep translations concise for UI elements
- Ensure button text fits in small spaces
- Test longer German compound words in layouts

## Testing Translations

### Manual Testing
1. Change browser language or use `?lang=` parameter
2. Navigate through all pages
3. Verify:
   - All text is translated
   - Pluralization works correctly
   - Variables interpolate properly
   - Crisis numbers are correct

### Automated Testing
```javascript
const i18n = require('./src/utils/i18n');

// Test all keys exist in all languages
const languages = ['fr', 'nl', 'de', 'en'];
const requiredKeys = ['app.name', 'auth.login', ...];

languages.forEach(lang => {
  i18n.setLocale(lang);
  requiredKeys.forEach(key => {
    const translation = i18n.__(key);
    if (!translation) {
      console.error(`Missing translation: ${lang}.${key}`);
    }
  });
});
```

## Configuration

i18n is configured in `/src/utils/i18n.js`:

```javascript
i18n.configure({
  locales: ['fr', 'nl', 'de', 'en'],
  defaultLocale: 'fr',
  directory: path.join(__dirname, '../../locales'),
  cookie: 'language',
  queryParameter: 'lang',
  autoReload: process.env.NODE_ENV === 'development',
  objectNotation: true
});
```

## Integration Points

### Server Middleware
Located in `/src/server.js`:
```javascript
const i18n = require('./utils/i18n');
app.use(i18n.init);
```

### User Model
Store user language preference:
```sql
CREATE TABLE users (
  ...
  preferred_language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr'
);
```

### Session
Language persists across sessions via cookie.

## Best Practices

1. **Always provide all 4 translations** when adding new keys
2. **Test with real Belgian users** for cultural appropriateness
3. **Keep crisis numbers up-to-date** and verified
4. **Use object notation** for organized structure
5. **Handle missing translations gracefully** (falls back to key name)
6. **Consider RTL languages** if expanding beyond Belgium
7. **Document context** for translators (comments in JSON)

## Common Patterns

### Success Messages
```javascript
res.json({
  success: true,
  message: req.t('forum.threadCreated')
});
```

### Error Messages
```javascript
res.status(400).json({
  error: req.t('validation.required')
});
```

### Form Labels
```ejs
<label><%= t('auth.pseudo') %></label>
<input type="text" placeholder="<%= t('auth.pseudoPlaceholder') %>">
```

### Relative Time
```ejs
<time><%= tn('time.minuteAgo', 5) %></time>
```

## Resources

- **i18n module documentation**: https://github.com/mashpie/i18n-node
- **Belgian crisis resources**: See `resources` section in translations
- **Language codes**: ISO 639-1 (fr, nl, de, en)

## Maintenance

### Regular Updates Needed
- Crisis hotline numbers (verify annually)
- Community guidelines translations
- Legal/GDPR text updates
- New feature translations

### Translation Review Process
1. Add key in French (primary language)
2. Professional translation for Dutch/German/English
3. Review by native speakers
4. Test in production with real users
5. Iterate based on feedback

## Accessibility

All translations consider:
- **Screen reader compatibility** - Clear, descriptive text
- **Cognitive accessibility** - Simple language, no jargon
- **Cultural sensitivity** - Belgian harm reduction approach
- **Crisis support** - Always accessible, multiple languages

---

For questions or translation updates, consult the Belgian harm reduction community or professional translators familiar with addiction support services.
