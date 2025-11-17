# i18n Quick Reference

## Common Translation Keys

### Authentication
```javascript
req.t('auth.login')              // "Se connecter" / "Inloggen" / "Anmelden" / "Log in"
req.t('auth.register')           // "S'inscrire" / "Registreren" / "Registrieren" / "Sign up"
req.t('auth.welcomeBack', { pseudo: 'Alice' })  // "Bon retour, Alice"
req.t('auth.accountLocked', { minutes: 30 })    // Account lockout message
```

### Forum
```javascript
req.t('forum.newThread')         // "Nouvelle discussion"
req.t('forum.threadCreated')     // Success message
req.tn('forum.replyCount', 5)    // "5 réponses" (plural)
req.t('forum.editWindow', { minutes: 15 })      // "You can edit for 15 minutes..."
```

### Errors
```javascript
req.t('errors.unauthorized')     // "Vous devez être connecté"
req.t('errors.rateLimited')      // "Trop de requêtes. Veuillez patienter."
req.t('errors.sessionExpired')   // Session expired message
```

### Actions
```javascript
req.t('actions.submit')          // "Envoyer" / "Verzenden" / "Senden" / "Submit"
req.t('actions.cancel')          // "Annuler" / "Annuleren" / "Abbrechen" / "Cancel"
req.t('actions.delete')          // Delete action
```

### Validation
```javascript
req.t('validation.required')     // "Ce champ est requis"
req.t('validation.bodyMinLength', { min: 10 })  // Minimum length error
req.t('validation.tooLong', { max: 200 })       // Maximum length error
```

### Crisis Resources
```javascript
req.t('resources.crisis_line_suicide')        // Crisis line name (language-specific)
req.t('resources.crisis_line_suicide_number') // Crisis line number (language-specific)
req.t('resources.emergency')                  // "En cas d'urgence vitale, appelez le 112"
```

## Setting Language

### From User Preference
```javascript
const user = await User.findByPseudo(req.session.pseudo);
req.setLocale(user.preferredLanguage || 'fr');
```

### From Query Parameter
```javascript
// URL: /threads?lang=nl
// Automatically handled by i18n middleware
```

### From Cookie
```javascript
res.cookie('language', 'de');
```

## In EJS Templates

```ejs
<!-- Simple translation -->
<h1><%= t('app.name') %></h1>

<!-- With variable -->
<p><%= t('auth.welcomeBack', { pseudo: user.pseudo }) %></p>

<!-- Pluralization -->
<span><%= tn('forum.replyCount', thread.replyCount) %></span>

<!-- Button -->
<button><%= t('actions.submit') %></button>

<!-- Error message -->
<div class="error"><%= t('errors.unauthorized') %></div>

<!-- Form label -->
<label for="pseudo"><%= t('auth.pseudo') %></label>
<input id="pseudo" placeholder="<%= t('auth.pseudoPlaceholder') %>">
```

## Time Formatting

```javascript
// Relative time
req.tn('time.minuteAgo', 5)      // "Il y a 5 minutes"
req.tn('time.hourAgo', 2)        // "Il y a 2 heures"
req.tn('time.dayAgo', 1)         // "Il y a 1 jour"

// Duration
req.tn('time.editWindowMinutes', 15)   // "15 minutes"
req.tn('time.lockoutDuration', 30)     // "30 minutes"
```

## Language Codes

- `fr` - Français (French) - **Default**
- `nl` - Nederlands (Dutch/Flemish)
- `de` - Deutsch (German)
- `en` - English

## Crisis Hotlines by Language

| Language | Service | Number |
|----------|---------|--------|
| French | Centre de Prévention du Suicide | 0800 32 123 |
| French | Infor-Drogues | 02 227 52 52 |
| Dutch | Zelfmoordlijn | 1813 |
| Dutch | Druglijn | 078 15 10 20 |
| German | Telefonhilfe | 108 |
| German | Drogenhilfe | 078 15 10 20 |
| **All** | **Emergency** | **112** |

## Getting Current Language

```javascript
const currentLang = req.getLocale();  // 'fr', 'nl', 'de', or 'en'
```

## Testing Missing Translations

```javascript
const i18n = require('./src/utils/i18n');

i18n.setLocale('nl');
const translation = i18n.__('some.key');

if (translation === 'some.key') {
  // Translation missing - falls back to key name
}
```

## Adding New Translation

1. Add to all 4 files:

**locales/fr.json:**
```json
{
  "myFeature": {
    "title": "Mon titre"
  }
}
```

**locales/nl.json:**
```json
{
  "myFeature": {
    "title": "Mijn titel"
  }
}
```

**locales/de.json:**
```json
{
  "myFeature": {
    "title": "Mein Titel"
  }
}
```

**locales/en.json:**
```json
{
  "myFeature": {
    "title": "My title"
  }
}
```

2. Use in code:
```javascript
req.t('myFeature.title')
```

## Common Mistakes

❌ **Don't:**
```javascript
res.send('Thread created');  // Hardcoded English
```

✅ **Do:**
```javascript
res.send(req.t('forum.threadCreated'));  // Translated
```

---

❌ **Don't:**
```javascript
req.t('forum.replies', { count: 5 });  // Won't pluralize
```

✅ **Do:**
```javascript
req.tn('forum.replyCount', 5);  // Handles plural correctly
```

---

❌ **Don't:**
```ejs
<button>Submit</button>  <!-- Hardcoded -->
```

✅ **Do:**
```ejs
<button><%= t('actions.submit') %></button>  <!-- Translated -->
```

## Performance Tips

- Translations are cached after first load
- Use `autoReload: false` in production
- Keep translation files organized by feature
- Reuse common translations (actions, errors, etc.)

## Debugging

```javascript
// Log current locale
console.log('Current locale:', req.getLocale());

// Log translation
console.log('Translation:', req.t('auth.login'));

// Get all available locales
const locales = req.getLocales();  // ['fr', 'nl', 'de', 'en']
```
