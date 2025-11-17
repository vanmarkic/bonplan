# Public Assets Directory

This directory contains all frontend assets for Le Syndicat des Tox.

## Directory Structure

```
public/
├── css/
│   └── main.css           # Main stylesheet (< 50KB target)
├── js/
│   └── app.js             # Main JavaScript (< 20KB target)
├── images/
│   └── (forum images, icons)
├── fonts/
│   └── (self-hosted fonts if needed)
├── robots.txt             # Search engine instructions
└── favicon.ico           # Site favicon
```

## Build Process

The build scripts in package.json will process these files:

### CSS Build
```bash
npm run build:css
```
- Processes: `src/public/css/main.css`
- Output: `dist/public/css/main.min.css`
- Uses PostCSS with autoprefixer and cssnano for optimization

### JavaScript Build
```bash
npm run build:js
```
- Processes: `src/public/js/app.js`
- Output: `dist/public/js/app.min.js`
- Uses esbuild for bundling and minification

### Full Build
```bash
npm run build
```
Runs both CSS and JS builds.

## Design Principles

### 1. Radical Accessibility
- Works on low-end devices
- Optimized for poor network connections
- High contrast support
- Screen reader compatible
- Keyboard navigation
- Focus indicators

### 2. Privacy First
- No external fonts (no Google Fonts, etc.)
- No CDN dependencies
- All assets self-hosted
- No tracking scripts
- No analytics by default

### 3. Progressive Enhancement
- Works without JavaScript
- JavaScript enhances, not required
- Form validation on both client and server
- Semantic HTML

### 4. Performance Targets
- Initial page load: < 50KB
- LCP on 3G: < 2.5s
- FID: < 100ms
- CSS: < 50KB
- JS: < 20KB

### 5. Multi-Language Support
- French (fr)
- Dutch (nl)
- German (de)
- English (en)

## CSS Architecture

### Base Styles
- CSS Reset
- Typography
- Layout containers

### Components
- Buttons
- Cards
- Forms
- Alerts
- Badges
- Thread/Reply components

### Dark Mode
- Automatic based on `prefers-color-scheme`
- Manual toggle support (optional)

### Accessibility
- Skip links
- Screen reader only classes
- High contrast mode
- Reduced motion support

## JavaScript Features

### Core
- CSRF token handling
- Form validation
- Keyboard navigation
- Accessibility announcements

### Enhancements
- Character counters for textareas
- Auto-dismiss alerts
- Auto-save drafts
- Lazy loading images
- Report content

### API
Global object: `window.SyndicatTox`
- `announce(message, priority)` - Screen reader announcements
- `getCSRFToken()` - Get current CSRF token

## Adding New Assets

### Images
1. Place in `src/public/images/`
2. Use descriptive filenames
3. Optimize before adding (use tools like ImageOptim)
4. Add alt text in templates

### Fonts (if needed)
1. Place in `src/public/fonts/`
2. Use WOFF2 format for best compression
3. Subset fonts to reduce size
4. Update main.css with @font-face declarations

## Testing Checklist

- [ ] Works without JavaScript
- [ ] Works on mobile devices
- [ ] Works in high contrast mode
- [ ] Works with screen reader (NVDA/JAWS/VoiceOver)
- [ ] Works with keyboard only
- [ ] Fast on slow 3G connection
- [ ] Dark mode displays correctly
- [ ] Forms validate properly
- [ ] No console errors
- [ ] Total page weight < 50KB

## Browser Support

- Modern browsers (last 2 versions)
- Firefox ESR
- Safari iOS 12+
- Android Browser 5+
- Works (gracefully degraded) on IE11

## Security Notes

- All forms include CSRF tokens
- Input sanitization on server side
- No inline scripts (CSP compliant)
- No external resources
