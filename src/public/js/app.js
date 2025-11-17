/**
 * Le Syndicat des Tox - Main JavaScript
 * Progressive enhancement - works without JS
 * Target: < 20KB minified
 */

(function() {
  'use strict';

  // ===== CSRF Token Management =====
  const csrfToken = document.querySelector('meta[name="csrf-token"]');

  function getCSRFToken() {
    return csrfToken ? csrfToken.getAttribute('content') : '';
  }

  // Add CSRF token to all forms automatically
  function addCSRFToForms() {
    const forms = document.querySelectorAll('form[method="post"], form[method="POST"]');
    forms.forEach(form => {
      if (!form.querySelector('input[name="_csrf"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        input.value = getCSRFToken();
        form.appendChild(input);
      }
    });
  }

  // ===== Form Validation =====
  function validateForm(form) {
    const inputs = form.querySelectorAll('[required]');
    let isValid = true;

    inputs.forEach(input => {
      const errorElement = input.parentElement.querySelector('.form-error');

      // Remove previous errors
      if (errorElement) {
        errorElement.remove();
      }

      // Check validity
      if (!input.value.trim()) {
        isValid = false;
        showError(input, 'Ce champ est requis / Dit veld is verplicht / Dieses Feld ist erforderlich');
      } else if (input.type === 'email' && !isValidEmail(input.value)) {
        isValid = false;
        showError(input, 'Email invalide / Ongeldige e-mail / Ungültige E-Mail');
      } else if (input.dataset.minlength && input.value.length < parseInt(input.dataset.minlength)) {
        isValid = false;
        showError(input, `Minimum ${input.dataset.minlength} caractères / karakters / Zeichen`);
      }
    });

    return isValid;
  }

  function showError(input, message) {
    const error = document.createElement('div');
    error.className = 'form-error';
    error.textContent = message;
    input.parentElement.appendChild(error);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ===== Character Counter =====
  function setupCharacterCounters() {
    const textareas = document.querySelectorAll('textarea[data-maxlength]');

    textareas.forEach(textarea => {
      const maxLength = parseInt(textarea.dataset.maxlength);
      const counter = document.createElement('div');
      counter.className = 'character-counter';
      counter.style.fontSize = '0.875rem';
      counter.style.color = '#718096';
      counter.style.marginTop = '0.25rem';
      counter.style.textAlign = 'right';

      textarea.parentElement.appendChild(counter);

      function updateCounter() {
        const remaining = maxLength - textarea.value.length;
        counter.textContent = `${textarea.value.length} / ${maxLength}`;

        if (remaining < 50) {
          counter.style.color = '#e53e3e';
        } else if (remaining < 100) {
          counter.style.color = '#d69e2e';
        } else {
          counter.style.color = '#718096';
        }
      }

      textarea.addEventListener('input', updateCounter);
      updateCounter();
    });
  }

  // ===== Auto-dismiss Alerts =====
  function setupAutoDismissAlerts() {
    const alerts = document.querySelectorAll('.alert[data-autodismiss]');

    alerts.forEach(alert => {
      const delay = parseInt(alert.dataset.autodismiss) || 5000;
      setTimeout(() => {
        alert.style.opacity = '0';
        alert.style.transition = 'opacity 0.5s ease';
        setTimeout(() => alert.remove(), 500);
      }, delay);
    });
  }

  // ===== Keyboard Navigation Enhancement =====
  function setupKeyboardNavigation() {
    // Skip link functionality
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus();
        }
      });
    }

    // Escape key to close modals/dialogs
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
          closeModal(activeModal);
        }
      }
    });

    // Arrow key navigation for thread lists
    const threadItems = document.querySelectorAll('.thread-item a');
    if (threadItems.length > 0) {
      threadItems.forEach((item, index) => {
        item.addEventListener('keydown', function(e) {
          if (e.key === 'ArrowDown' && threadItems[index + 1]) {
            e.preventDefault();
            threadItems[index + 1].focus();
          } else if (e.key === 'ArrowUp' && threadItems[index - 1]) {
            e.preventDefault();
            threadItems[index - 1].focus();
          }
        });
      });
    }
  }

  // ===== Confirm Dangerous Actions =====
  function setupConfirmDialogs() {
    const dangerousActions = document.querySelectorAll('[data-confirm]');

    dangerousActions.forEach(element => {
      element.addEventListener('click', function(e) {
        const message = this.dataset.confirm;
        if (!confirm(message)) {
          e.preventDefault();
        }
      });
    });
  }

  // ===== Auto-save Draft (for replies/threads) =====
  function setupAutoSave() {
    const forms = document.querySelectorAll('form[data-autosave]');

    forms.forEach(form => {
      const key = form.dataset.autosave;
      const inputs = form.querySelectorAll('input, textarea, select');

      // Load saved data
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          Object.keys(data).forEach(name => {
            const input = form.querySelector(`[name="${name}"]`);
            if (input && !input.value) {
              input.value = data[name];
            }
          });
        } catch (e) {
          console.error('Failed to load autosave data');
        }
      }

      // Save on input
      inputs.forEach(input => {
        input.addEventListener('input', debounce(function() {
          const formData = {};
          inputs.forEach(inp => {
            if (inp.name) {
              formData[inp.name] = inp.value;
            }
          });
          localStorage.setItem(key, JSON.stringify(formData));
        }, 1000));
      });

      // Clear on submit
      form.addEventListener('submit', function() {
        localStorage.removeItem(key);
      });
    });
  }

  // ===== Utility: Debounce =====
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ===== Accessibility Announcements =====
  function announce(message, priority = 'polite') {
    const announcer = document.getElementById('aria-announcer') || createAnnouncer();
    announcer.setAttribute('aria-live', priority);
    announcer.textContent = message;

    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }

  function createAnnouncer() {
    const div = document.createElement('div');
    div.id = 'aria-announcer';
    div.className = 'sr-only';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.setAttribute('aria-atomic', 'true');
    document.body.appendChild(div);
    return div;
  }

  // ===== Report Content =====
  function setupReportButtons() {
    const reportButtons = document.querySelectorAll('[data-report]');

    reportButtons.forEach(button => {
      button.addEventListener('click', async function(e) {
        e.preventDefault();

        const contentType = this.dataset.contentType;
        const contentId = this.dataset.contentId;
        const reason = prompt('Raison du signalement / Reden voor rapportage / Grund für Meldung:');

        if (!reason) return;

        try {
          const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': getCSRFToken()
            },
            body: JSON.stringify({ contentType, contentId, reason })
          });

          if (response.ok) {
            announce('Content reported / Contenu signalé / Inhoud gerapporteerd');
            alert('Merci pour votre signalement / Bedankt voor uw melding / Vielen Dank für Ihre Meldung');
          } else {
            throw new Error('Report failed');
          }
        } catch (error) {
          alert('Erreur / Fout / Fehler');
        }
      });
    });
  }

  // ===== Image Loading Optimization =====
  function setupLazyLoading() {
    if ('loading' in HTMLImageElement.prototype) {
      const images = document.querySelectorAll('img[data-src]');
      images.forEach(img => {
        img.src = img.dataset.src;
      });
    } else {
      // Fallback for older browsers
      const images = document.querySelectorAll('img[data-src]');
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            observer.unobserve(img);
          }
        });
      });

      images.forEach(img => imageObserver.observe(img));
    }
  }

  // ===== Dark Mode Toggle (optional) =====
  function setupDarkMode() {
    const toggle = document.querySelector('[data-dark-mode-toggle]');
    if (!toggle) return;

    const currentMode = localStorage.getItem('darkMode') || 'auto';

    toggle.addEventListener('click', function() {
      const newMode = currentMode === 'dark' ? 'light' : 'dark';
      localStorage.setItem('darkMode', newMode);
      applyDarkMode(newMode);
    });

    applyDarkMode(currentMode);
  }

  function applyDarkMode(mode) {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark-mode');
    } else if (mode === 'light') {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  // ===== Initialize All Features =====
  function init() {
    // Check if JavaScript is enabled
    document.documentElement.classList.add('js-enabled');

    // Core features
    addCSRFToForms();
    setupAutoDismissAlerts();
    setupKeyboardNavigation();
    setupConfirmDialogs();

    // Form enhancements
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      form.addEventListener('submit', function(e) {
        if (!validateForm(this)) {
          e.preventDefault();
          announce('Erreurs dans le formulaire / Fouten in formulier / Formularfehler', 'assertive');
        }
      });
    });

    setupCharacterCounters();
    setupAutoSave();

    // Content features
    setupReportButtons();
    setupLazyLoading();
    setupDarkMode();

    // Log initialization
    if (window.console && console.log) {
      console.log('Le Syndicat des Tox - Initialized');
    }
  }

  // ===== DOM Ready =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===== Export Public API =====
  window.SyndicatTox = {
    announce: announce,
    getCSRFToken: getCSRFToken
  };

})();
