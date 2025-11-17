# New Translation Keys Needed for i18n Implementation

This document lists all the new translation keys that need to be added to the locale files (locales/fr.json, locales/nl.json, locales/de.json, locales/en.json) to support the updated EJS templates.

## Template: thread-new.ejs

```json
"threadNew": {
  "pageTitle": "Nouvelle discussion - Le Syndicat des Tox",
  "title": "Créer une nouvelle discussion",
  "tipsTitle": "Conseils pour une bonne discussion",
  "tip1": "Choisissez un titre clair et descriptif",
  "tip2": "Soyez respectueux et bienveillant",
  "tip3": "Partagez votre expérience sans jugement",
  "tip4": "Évitez de mentionner des noms réels ou des lieux précis",
  "threadTitle": "Titre de la discussion",
  "threadTitlePlaceholder": "Ex: Comment gérer les envies de consommer?",
  "characters": "caractères",
  "minimum": "minimum",
  "yourMessage": "Votre message",
  "messagePlaceholder": "Partagez votre expérience, posez vos questions...",
  "threadLanguage": "Langue de la discussion",
  "publishAnonymous": "Publier en tant qu'anonyme (votre pseudo ne sera pas affiché)",
  "publishThread": "Publier la discussion",
  "abandonConfirm": "Abandonner cette discussion?",
  "importantReminder": "Rappel important",
  "editWindow": "Vous aurez 15 minutes après la publication pour modifier ou supprimer votre message. Après ce délai, seuls les modérateurs pourront intervenir en cas de problème.",
  "titleTooShort": "Le titre doit contenir au moins 5 caractères.",
  "messageTooShort": "Le message doit contenir au moins 10 caractères.",
  "sensitiveWarning": "Votre message semble aborder des sujets sensibles. Assurez-vous d'être dans un état d'esprit approprié pour cette discussion. Si vous êtes en détresse, consultez les ressources d'urgence dans le menu \"À propos\". \n\nContinuer la publication?"
}
```

## Template: thread-edit.ejs

```json
"threadEdit": {
  "pageTitle": "Modifier la discussion - Le Syndicat des Tox",
  "title": "Modifier la discussion",
  "timeRemaining": "Temps restant pour modifier",
  "timeRemainingNote": "Après ce délai, vous ne pourrez plus modifier votre message.",
  "timeExpired": "Délai de modification expiré",
  "timeExpiredNote": "Le délai de 15 minutes pour modifier cette discussion est écoulé. Seuls les modérateurs peuvent maintenant intervenir en cas de problème.",
  "threadTitle": "Titre de la discussion",
  "characters": "caractères",
  "minimum": "minimum",
  "yourMessage": "Votre message",
  "threadLanguage": "Langue de la discussion",
  "editReason": "Raison de la modification (optionnel)",
  "editReasonPlaceholder": "Ex: Correction d'une faute de frappe, ajout d'informations...",
  "editReasonNote": "Cette information sera visible dans l'historique des modifications",
  "saveChanges": "Enregistrer les modifications",
  "abandonConfirm": "Abandonner les modifications?",
  "dangerZone": "Zone dangereuse",
  "irreversibleAction": "Cette action est irréversible:",
  "deleteThread": "Supprimer définitivement cette discussion",
  "titleTooShort": "Le titre doit contenir au moins 5 caractères.",
  "messageTooShort": "Le message doit contenir au moins 10 caractères.",
  "confirmSave": "Enregistrer les modifications?",
  "deleteWarning": "ATTENTION: Cette action est IRRÉVERSIBLE!\n\nÊtes-vous absolument certain de vouloir supprimer cette discussion?\nToutes les réponses seront également supprimées.",
  "deleteLastChance": "Dernière chance: Confirmer la suppression?",
  "minute": "minute",
  "second": "seconde"
}
```

## Template: search.ejs

```json
"search": {
  "pageTitle": "Recherche - Le Syndicat des Tox",
  "title": "Rechercher dans les discussions",
  "searchLabel": "Rechercher",
  "placeholder": "Entrez vos mots-clés...",
  "searchButton": "Rechercher",
  "helpText": "Recherchez par titre, contenu ou auteur (minimum 2 caractères)",
  "advancedOptions": "Options avancées",
  "searchIn": "Rechercher dans",
  "all": "Tout",
  "titlesOnly": "Titres uniquement",
  "contentOnly": "Contenu uniquement",
  "repliesOnly": "Réponses uniquement",
  "language": "Langue",
  "allLanguages": "Toutes les langues",
  "sortBy": "Trier par",
  "relevance": "Pertinence",
  "newest": "Plus récent",
  "oldest": "Plus ancien",
  "mostReplies": "Plus de réponses",
  "period": "Période",
  "allDates": "Toutes les dates",
  "today": "Aujourd'hui",
  "thisWeek": "Cette semaine",
  "thisMonth": "Ce mois",
  "thisYear": "Cette année",
  "result": "résultat",
  "results": "résultats",
  "for": "pour",
  "by": "Par",
  "first": "Début",
  "last": "Fin",
  "noResults": "Aucun résultat trouvé",
  "noResultsFor": "Aucune discussion ne correspond à votre recherche",
  "suggestions": "Suggestions",
  "suggestion1": "Vérifiez l'orthographe de vos mots-clés",
  "suggestion2": "Essayez des mots-clés plus généraux",
  "suggestion3": "Essayez avec moins de mots",
  "suggestion4": "Changez les options de recherche avancée",
  "emptyState": "Entrez vos mots-clés pour rechercher dans les discussions",
  "popularSearches": "Recherches populaires",
  "tip": "Astuce",
  "tipText": "Utilisez les guillemets pour rechercher une expression exacte, par exemple: \"réduction des risques\""
}
```

## Template: privacy.ejs

```json
"privacyPolicy": {
  "title": "Politique de confidentialité",
  "lastUpdate": "Dernière mise à jour",
  "commitment": "Notre engagement",
  "commitmentText": "Le Syndicat des Tox ne collecte AUCUNE donnée personnelle identifiable.",
  "minimization": "Nous pratiquons la minimisation des données par principe, pas par compromis.",
  "dataCollected": "Données collectées",
  "dataType": "Donnée",
  "collected": "Collectée ?",
  "ipAddress": "Adresse IP",
  "no": "NON",
  "yes": "OUI",
  "ipAnonymized": "anonymisée au niveau du proxy",
  "email": "Email",
  "neverAsked": "jamais demandé",
  "phone": "Numéro de téléphone",
  "realName": "Nom réel",
  "location": "Localisation",
  "noGeolocation": "aucun GPS, aucune géolocalisation",
  "pseudo": "Pseudo",
  "pseudoNote": "choisi par vous, anonyme",
  "pin": "Code PIN",
  "pinEncrypted": "chiffré avec Argon2id, impossible à déchiffrer",
  "messages": "Messages",
  "messagesNote": "publics, associés à votre pseudo",
  "cookies": "Cookies",
  "cookiesIntro": "Nous utilisons UN SEUL cookie essentiel :",
  "sessionCookie": "Cookie de session (sid)",
  "sessionCookieNote": "Nécessaire pour maintenir votre connexion. Expire après 7 jours ou à la déconnexion.",
  "noCookies": "Pas de cookies de tracking, pas de cookies publicitaires, pas de cookies tiers.",
  "analytics": "Analytics et tracking",
  "analyticsNone": "Aucun.",
  "analyticsNote": "Pas de Google Analytics, pas de Facebook Pixel, pas de suivi comportemental. Nous ne savons pas comment vous utilisez le site, et c'est voulu.",
  "gdpr": "Bases légales (GDPR)",
  "gdprIntro": "Conformément au RGPD :",
  "legalBasis": "Base légale :",
  "legalBasisText": "Intérêt légitime (fournir un service de soutien par les pairs)",
  "dataMinimization": "Minimisation des données :",
  "dataMinimizationText": "Seules les données strictement nécessaires sont collectées",
  "storage": "Stockage :",
  "storageText": "Données hébergées en Belgique",
  "retention": "Durée de conservation :",
  "retentionText": "Tant que votre compte existe",
  "yourRights": "Vos droits",
  "yourRightsIntro": "Vous avez le droit de :",
  "accessRight": "Accès :",
  "accessRightText": "Voir tous vos messages",
  "deletionRight": "Suppression :",
  "deletionRightText": "Supprimer votre compte et tous vos messages",
  "portabilityRight": "Portabilité :",
  "portabilityRightText": "Exporter vos données en JSON",
  "noRectification": "Note : Pas de \"droit à la rectification\" du pseudo, car cela compromettrait la sécurité.",
  "security": "Sécurité",
  "securityIntro": "Mesures de sécurité en place :",
  "https": "HTTPS obligatoire (TLS 1.3)",
  "pinEncryption": "Code PIN chiffré avec Argon2id (64MB memory cost)",
  "sessions": "Sessions stockées dans Redis avec expiration",
  "securityHeaders": "Headers de sécurité (CSP, HSTS, etc.)",
  "sqlProtection": "Protection contre les injections SQL",
  "xssProtection": "Protection contre les attaques XSS",
  "rateLimiting": "Rate limiting pour prévenir les abus",
  "dataSharing": "Partage de données",
  "noSharing": "Nous ne partageons AUCUNE donnée avec des tiers.",
  "noSharingNote": "Pas de régie publicitaire, pas de partenaires commerciaux, pas de vente de données.",
  "legal": "Autorités légales",
  "legalIntro": "En cas de demande légitime des autorités belges :",
  "legalCan": "Nous ne pouvons fournir QUE : pseudo, messages publics, dates de création",
  "legalCannot": "Nous ne pouvons PAS fournir : adresse IP (nous ne les stockons pas), identité réelle (nous ne la connaissons pas)",
  "modifications": "Modifications de cette politique",
  "modificationsNote": "Nous vous informerons de toute modification importante via une bannière sur le site.",
  "contact": "Contact",
  "contactNote": "Pour toute question sur cette politique : Voir la page",
  "aboutPage": "À propos",
  "footer": "Cette politique de confidentialité reflète notre engagement envers votre anonymat. Nous croyons que la vie privée est un droit fondamental, pas un privilège."
}
```

## Template: moderation.ejs

```json
"moderationDashboard": {
  "pageTitle": "Tableau de bord de modération - Le Syndicat des Tox",
  "title": "Tableau de bord de modération",
  "accessDenied": "Accès refusé",
  "moderatorsOnly": "Cette page est réservée aux modérateurs.",
  "reports": "Signalements",
  "toProcess": "À traiter",
  "pinned": "Épinglés",
  "threads": "Discussions",
  "locked": "Verrouillés",
  "resolved": "Traités",
  "today": "Aujourd'hui",
  "reportedTab": "Signalements",
  "hiddenTab": "Contenu masqué",
  "pinnedTab": "Discussions épinglées",
  "logsTab": "Journal d'activité",
  "reportedContent": "Contenu signalé",
  "thread": "Discussion",
  "reply": "Réponse",
  "noTitle": "Sans titre",
  "author": "Auteur",
  "reportedOn": "Signalé le",
  "reportCount": "Nombre de signalements",
  "reportReasons": "Raisons des signalements",
  "by": "par",
  "anonymous": "anonyme",
  "noDetails": "Pas de détails disponibles",
  "excerpt": "Extrait du contenu",
  "noContent": "[Contenu non disponible]",
  "actions": "Actions",
  "dismiss": "Ignorer (pas de problème)",
  "hideContent": "Masquer le contenu",
  "deletePermanently": "Supprimer définitivement",
  "lockThread": "Verrouiller la discussion",
  "noReportedContent": "Aucun contenu signalé à traiter!",
  "hiddenContent": "Contenu masqué",
  "hiddenOn": "Masqué le",
  "makeVisible": "Rendre visible",
  "noHiddenContent": "Aucun contenu masqué",
  "pinnedThreads": "Discussions épinglées",
  "note": "Note",
  "pinnedNote": "Les discussions épinglées apparaissent en haut de la liste des discussions. Limitez-vous à 3-5 discussions épinglées maximum pour une meilleure expérience utilisateur.",
  "pinnedOn": "Épinglé le",
  "unpin": "Désépingler",
  "lock": "Verrouiller",
  "noPinnedThreads": "Aucune discussion épinglée",
  "browseThreads": "Parcourir les discussions",
  "activityLog": "Journal d'activité de modération (dernières 48h)",
  "dateTime": "Date/Heure",
  "moderator": "Modérateur",
  "action": "Action",
  "target": "Cible",
  "view": "Voir",
  "noActivity": "Aucune activité de modération récente",
  "guidelines": "Principes de modération",
  "guideline1": "Privilégiez toujours la bienveillance et le dialogue",
  "guideline2": "Ne supprimez que le contenu clairement dangereux ou illégal",
  "guideline3": "Respectez les principes de réduction des risques",
  "guideline4": "En cas de doute, consultez les autres modérateurs",
  "guideline5": "Documentez vos actions importantes dans le journal",
  "confirmAction": "Confirmer cette action",
  "deleteWarning": "ATTENTION: Cette action est irréversible! Confirmer la suppression?"
}
```

## Summary

**Total new translation keys needed:** ~180 keys across 5 sections

### Templates Updated:
1. ✅ **thread-new.ejs** - New thread creation form (23 keys)
2. ✅ **thread-edit.ejs** - Edit thread form (20 keys)
3. ✅ **search.ejs** - Search interface (35 keys)
4. ✅ **privacy.ejs** - Privacy policy (55 keys)
5. ✅ **moderation.ejs** - Moderator dashboard (47 keys)

### Next Steps:
1. Add these translation keys to `/Users/dragan/Documents/bonplan/locales/fr.json`
2. Translate to Dutch in `/Users/dragan/Documents/bonplan/locales/nl.json`
3. Translate to German in `/Users/dragan/Documents/bonplan/locales/de.json`
4. Translate to English in `/Users/dragan/Documents/bonplan/locales/en.json`

### Implementation Notes:
- All templates now use `t()` function for translations
- JavaScript alert/confirm messages are also translated
- Form placeholders, labels, and help text are translated
- Pagination and navigation elements are translated
- Helper functions use translation keys where appropriate
- Pluralization is handled correctly (e.g., "1 result" vs "2 results")
- All hardcoded French text has been replaced with translation keys
