# GDPR Service Documentation

## Overview

The GDPR Service (`src/services/gdprService.js`) implements GDPR compliance features for Le Syndicat des Tox, specifically:

- **Article 15 - Right to Access**: Users can export all their personal data
- **Article 17 - Right to Erasure**: Users can request permanent account deletion

## Features

### 1. Data Export (`exportUserData`)

Exports all user data in a structured, machine-readable JSON format.

#### Usage Example

```javascript
const GdprService = require('./services/gdprService');

// Export data for a user
const userData = await GdprService.exportUserData('testuser');

// userData contains:
// - Account information (pseudo, creation date, preferences)
// - Statistics (thread/reply counts, account age)
// - Full content (all threads and replies with body text)
// - Moderation history (reports made by user)
// - GDPR notice (rights information, retention policy)
```

#### Export Data Structure

```json
{
  "metadata": {
    "exportDate": "2024-01-15T10:30:00.000Z",
    "dataController": "Le Syndicat des Tox",
    "legalBasis": "GDPR Article 15 - Right to access",
    "format": "JSON",
    "version": "1.0"
  },
  "account": {
    "pseudo": "testuser",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "lastLogin": "2024-01-15T08:00:00.000Z",
    "preferredLanguage": "fr",
    "isModerator": false,
    "isBanned": false
  },
  "statistics": {
    "threadCount": 5,
    "replyCount": 15,
    "accountAge": 14
  },
  "content": {
    "threads": [
      {
        "id": 1,
        "title": "My thread",
        "body": "Full thread content...",
        "createdAt": "2024-01-02T10:00:00.000Z",
        "replyCount": 3,
        "viewCount": 50,
        "language": "fr"
      }
    ],
    "replies": [
      {
        "id": 1,
        "threadId": 5,
        "threadTitle": "Other thread",
        "body": "Full reply content...",
        "createdAt": "2024-01-03T15:00:00.000Z"
      }
    ]
  },
  "moderation": {
    "reportsMade": [
      {
        "contentType": "thread",
        "contentId": 10,
        "reason": "spam",
        "status": "reviewed"
      }
    ]
  }
}
```

#### Security Notes

- **PIN hash and salt are NEVER included** in exports
- Exports are only available to the authenticated user
- All export actions are logged in the audit trail (without IP addresses)

---

### 2. Account Deletion (`deleteUserAccount`)

Permanently deletes a user account with PIN verification.

#### Usage Example

```javascript
const GdprService = require('./services/gdprService');

// Delete account with anonymization (default)
const result = await GdprService.deleteUserAccount(
  'testuser',
  '1234',
  { contentStrategy: 'anonymize' }
);

// Delete account with content deletion
const result = await GdprService.deleteUserAccount(
  'testuser',
  '1234',
  { contentStrategy: 'delete' }
);
```

#### Content Strategies

**1. Anonymize (Recommended)**
- Preserves threads and replies for community value
- Changes author attribution to `[deleted]`
- Content remains visible but disconnected from the user
- Best for active discussions and helpful content

**2. Delete**
- Soft deletes all threads and replies
- Content is marked as `is_deleted = TRUE`
- Content becomes hidden from public view
- Best when user wants complete removal

#### What Gets Deleted

Both strategies delete:
- User account record
- All Redis sessions for the user
- Login attempt history
- Rate limiting data

#### Database Impact

**Anonymize Strategy:**
```sql
UPDATE threads SET author_pseudo = '[deleted]' WHERE author_pseudo = ?
UPDATE replies SET author_pseudo = '[deleted]' WHERE author_pseudo = ?
UPDATE reports SET reporter_pseudo = '[deleted]' WHERE reporter_pseudo = ?
UPDATE moderation_log SET moderator_pseudo = '[deleted]' WHERE moderator_pseudo = ?
DELETE FROM users WHERE pseudo = ?
```

**Delete Strategy:**
```sql
UPDATE threads SET is_deleted = TRUE, deleted_reason = 'Account deletion' WHERE author_pseudo = ?
UPDATE replies SET is_deleted = TRUE, deleted_reason = 'Account deletion' WHERE author_pseudo = ?
DELETE FROM reports WHERE reporter_pseudo = ?
DELETE FROM users WHERE pseudo = ?
```

#### Security Measures

1. **PIN Verification Required**
   - User must provide correct PIN
   - Failed attempts are logged as security events
   - No deletion occurs with invalid PIN

2. **Transaction Safety**
   - All operations in a single database transaction
   - Automatic rollback on any error
   - Data consistency guaranteed

3. **Session Clearing**
   - All Redis sessions are cleared
   - User is immediately logged out everywhere
   - Rate limit data is removed

4. **Audit Trail**
   - Deletion is logged with pseudo and strategy
   - Logged without IP addresses
   - Timestamp and reason recorded

---

### 3. Deletion Validation (`validateDeletionRequest`)

Validates if a user can request deletion and provides warnings.

#### Usage Example

```javascript
const validation = await GdprService.validateDeletionRequest('testuser');

if (validation.valid) {
  // Show warnings to user
  validation.warnings.forEach(warning => console.log(warning));

  // Show content stats
  console.log(`Threads: ${validation.contentStats.threads}`);
  console.log(`Replies: ${validation.contentStats.replies}`);
}
```

#### Validation Response

```json
{
  "valid": true,
  "warnings": [
    "You are a moderator. Your moderation history will be preserved as [deleted].",
    "You have 5 thread(s) that will be affected.",
    "You have 15 reply/replies that will be affected.",
    "You have 2 pending report(s) from the last 7 days."
  ],
  "contentStats": {
    "threads": 5,
    "replies": 15
  }
}
```

---

### 4. Placeholder User (`ensureDeletedUserExists`)

Creates a `[deleted]` placeholder user for anonymized content.

#### Usage Example

```javascript
// Run during database initialization or migration
await GdprService.ensureDeletedUserExists();
```

#### Purpose

- Prevents foreign key violations when content is anonymized
- The `[deleted]` user is banned and cannot log in
- Created with random PIN for security
- Should be run once during setup

---

## Integration Guide

### Route Handler Example

```javascript
const express = require('express');
const router = express.Router();
const GdprService = require('../services/gdprService');
const { requireAuth } = require('../middleware/auth');
const { csrfProtection } = require('../middleware/csrf');

// Export user data
router.get('/account/export', requireAuth, async (req, res) => {
  try {
    const exportData = await GdprService.exportUserData(req.session.pseudo);

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="data-export-${req.session.pseudo}-${Date.now()}.json"`);

    res.json(exportData);
  } catch (error) {
    logger.error('Data export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Delete account (with validation first)
router.post('/account/delete', requireAuth, csrfProtection, async (req, res) => {
  try {
    const { pin, contentStrategy } = req.body;

    // Validate deletion request
    const validation = await GdprService.validateDeletionRequest(req.session.pseudo);

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Perform deletion
    const result = await GdprService.deleteUserAccount(
      req.session.pseudo,
      pin,
      { contentStrategy: contentStrategy || 'anonymize' }
    );

    // Destroy session
    req.session.destroy();

    res.json(result);
  } catch (error) {
    if (error.message === 'Invalid PIN') {
      return res.status(401).json({ error: 'Code PIN incorrect' });
    }

    logger.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
```

---

## Model Changes

### Thread Model

Added `includeBody` option to `findByAuthor()`:

```javascript
// Get threads without body (metadata only)
const threads = await Thread.findByAuthor('testuser', {
  limit: 10,
  offset: 0,
  includeBody: false
});

// Get threads with full body (for GDPR export)
const threadsWithBody = await Thread.findByAuthor('testuser', {
  limit: 10000,
  offset: 0,
  includeBody: true
});
```

### Reply Model

Added `includeBody` option to `findByAuthor()`:

```javascript
// Get replies without body (metadata only)
const replies = await Reply.findByAuthor('testuser', {
  limit: 20,
  offset: 0,
  includeBody: false
});

// Get replies with full body (for GDPR export)
const repliesWithBody = await Reply.findByAuthor('testuser', {
  limit: 10000,
  offset: 0,
  includeBody: true
});
```

---

## Testing

### Unit Tests

Run unit tests:

```bash
npm run test:unit -- tests/unit/services/gdprService.test.js
```

### Manual Testing

1. **Test Data Export:**
   ```javascript
   const data = await GdprService.exportUserData('testuser');
   console.log(JSON.stringify(data, null, 2));
   ```

2. **Test Account Deletion (Anonymize):**
   ```javascript
   const result = await GdprService.deleteUserAccount('testuser', '1234', {
     contentStrategy: 'anonymize'
   });

   // Verify: threads/replies show author as [deleted]
   const thread = await Thread.findById(1);
   console.log(thread.author_pseudo); // Should be '[deleted]'
   ```

3. **Test Account Deletion (Delete):**
   ```javascript
   const result = await GdprService.deleteUserAccount('testuser', '1234', {
     contentStrategy: 'delete'
   });

   // Verify: threads/replies are soft deleted
   const thread = await Thread.findById(1);
   console.log(thread.is_deleted); // Should be true
   ```

---

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `User not found` | Pseudo doesn't exist | Check spelling, verify user exists |
| `Invalid PIN` | Wrong PIN provided | Ask user to retry with correct PIN |
| `Database error` | Transaction failed | Check logs, verify DB connection |
| `Redis connection error` | Redis unavailable | Check Redis status, session clearing will be skipped |

---

## Performance Considerations

### Data Export

- **Large datasets**: Users with 1000+ threads/replies may have slow exports
- **Optimization**: Consider pagination or streaming for very large exports
- **Current limit**: 10,000 threads + 10,000 replies per export

### Account Deletion

- **Transaction size**: Deleting users with many threads/replies requires large transactions
- **Timeouts**: May need increased timeout for users with 500+ threads
- **Redis**: Session clearing iterates all sessions, may be slow with many active users

---

## GDPR Compliance Checklist

- [x] Data export in machine-readable format (JSON)
- [x] Complete user data included (account, content, statistics)
- [x] Sensitive data excluded (PIN hash/salt)
- [x] Right to erasure implemented (account deletion)
- [x] Two deletion strategies (anonymize/delete)
- [x] PIN verification before deletion
- [x] All sessions cleared on deletion
- [x] Audit trail maintained (without IP logging)
- [x] Transaction safety (rollback on errors)
- [x] GDPR notice included in exports

---

## Future Enhancements

Potential improvements:

1. **Streaming exports** for users with massive datasets
2. **Scheduled deletions** (30-day grace period)
3. **Data portability** to other platforms (XML, CSV formats)
4. **Partial deletion** (delete account but keep specific content)
5. **Automated reports** to administrators (GDPR compliance metrics)

---

## Support

For questions or issues:

1. Check logs: `/logs/app.log` and `/logs/error.log`
2. Review security logs for failed deletion attempts
3. Verify Redis connection for session clearing
4. Check database transaction logs for rollbacks

---

## License

This service is part of Le Syndicat des Tox, licensed under AGPL-3.0.
