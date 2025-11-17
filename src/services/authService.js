/**
 * Authentication Service
 * Handles user registration, login, and PIN verification
 */

const argon2 = require('argon2');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');
const config = require('../../config/app.config.example');

class AuthService {
  /**
   * Hash a PIN using Argon2id
   * @param {string} pin - 4-digit PIN
   * @param {string} salt - Random salt (optional, will be generated if not provided)
   */
  static async hashPin(pin, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(32).toString('hex');
    }

    const hash = await argon2.hash(pin, {
      type: argon2.argon2id,
      memoryCost: config.auth.argon2.memoryCost,
      timeCost: config.auth.argon2.timeCost,
      parallelism: config.auth.argon2.parallelism,
      salt: Buffer.from(salt, 'hex')
    });

    return { hash, salt };
  }

  /**
   * Verify a PIN against stored hash
   * @param {string} pin - PIN to verify
   * @param {string} hash - Stored hash
   */
  static async verifyPin(pin, hash) {
    try {
      return await argon2.verify(hash, pin);
    } catch (error) {
      logger.error('PIN verification error:', error);
      return false;
    }
  }

  /**
   * Validate pseudo format
   * @param {string} pseudo
   */
  static validatePseudo(pseudo) {
    if (!pseudo || typeof pseudo !== 'string') {
      return { valid: false, error: 'Pseudo requis' };
    }

    const trimmed = pseudo.trim();

    if (trimmed.length < config.auth.pseudo.minLength) {
      return { valid: false, error: `Pseudo trop court (min ${config.auth.pseudo.minLength} caractères)` };
    }

    if (trimmed.length > config.auth.pseudo.maxLength) {
      return { valid: false, error: `Pseudo trop long (max ${config.auth.pseudo.maxLength} caractères)` };
    }

    if (!config.auth.pseudo.pattern.test(trimmed)) {
      return { valid: false, error: 'Pseudo invalide (lettres, chiffres, _ et - seulement)' };
    }

    // Check reserved words
    if (config.auth.pseudo.reservedWords.includes(trimmed.toLowerCase())) {
      return { valid: false, error: 'Ce pseudo est réservé' };
    }

    return { valid: true, pseudo: trimmed };
  }

  /**
   * Validate PIN format
   * @param {string} pin
   */
  static validatePin(pin) {
    if (!pin || typeof pin !== 'string') {
      return { valid: false, error: 'Code PIN requis' };
    }

    if (!config.auth.pin.pattern.test(pin)) {
      return { valid: false, error: 'Code PIN invalide (4 chiffres requis)' };
    }

    return { valid: true, pin };
  }

  /**
   * Register a new user
   * @param {string} pseudo
   * @param {string} pin
   * @param {string} language
   */
  static async register(pseudo, pin, language = 'fr') {
    // Validate pseudo
    const pseudoValidation = this.validatePseudo(pseudo);
    if (!pseudoValidation.valid) {
      throw new Error(pseudoValidation.error);
    }

    // Validate PIN
    const pinValidation = this.validatePin(pin);
    if (!pinValidation.valid) {
      throw new Error(pinValidation.error);
    }

    // Check if pseudo already exists
    const exists = await User.exists(pseudoValidation.pseudo);
    if (exists) {
      throw new Error('Ce pseudo est déjà pris');
    }

    // Hash PIN
    const { hash, salt } = await this.hashPin(pinValidation.pin);

    // Create user
    await User.create(pseudoValidation.pseudo, hash, salt, language);

    logger.audit('User registered', pseudoValidation.pseudo);

    return { pseudo: pseudoValidation.pseudo };
  }

  /**
   * Login user
   * @param {string} pseudo
   * @param {string} pin
   */
  static async login(pseudo, pin) {
    // Validate inputs
    const pseudoValidation = this.validatePseudo(pseudo);
    if (!pseudoValidation.valid) {
      throw new Error('Pseudo ou code PIN incorrect');
    }

    const pinValidation = this.validatePin(pin);
    if (!pinValidation.valid) {
      throw new Error('Pseudo ou code PIN incorrect');
    }

    // Find user
    const user = await User.findByPseudo(pseudoValidation.pseudo);
    if (!user) {
      throw new Error('Pseudo ou code PIN incorrect');
    }

    // Check if account is banned
    if (user.is_banned) {
      if (user.ban_until && new Date(user.ban_until) > new Date()) {
        throw new Error('Compte temporairement banni');
      } else if (user.is_banned && !user.ban_until) {
        throw new Error('Compte banni définitivement');
      }
    }

    // Check if account is locked
    const lockedUntil = await User.isLocked(pseudoValidation.pseudo);
    if (lockedUntil) {
      const minutes = Math.ceil((new Date(lockedUntil) - new Date()) / 60000);
      throw new Error(`Compte verrouillé. Réessayez dans ${minutes} minute(s)`);
    }

    // Verify PIN
    const validPin = await this.verifyPin(pinValidation.pin, user.pin_hash);

    if (!validPin) {
      // Increment failed attempts
      await User.incrementFailedAttempts(pseudoValidation.pseudo);

      // Check if we need to lock the account
      const updatedUser = await User.findByPseudo(pseudoValidation.pseudo);
      if (updatedUser.failed_attempts >= config.auth.lockout.maxAttempts) {
        const lockoutMinutes = config.auth.lockout.lockoutDuration / 60;
        await User.lockAccount(pseudoValidation.pseudo, lockoutMinutes);
        logger.security('Account locked due to failed attempts', { pseudo: pseudoValidation.pseudo });
        throw new Error(`Trop de tentatives. Compte verrouillé pour ${lockoutMinutes} minutes`);
      }

      const attemptsLeft = config.auth.lockout.maxAttempts - updatedUser.failed_attempts;
      throw new Error(`Pseudo ou code PIN incorrect (${attemptsLeft} tentative(s) restante(s))`);
    }

    // Successful login - reset failed attempts and update last login
    await User.resetFailedAttempts(pseudoValidation.pseudo);
    await User.updateLastLogin(pseudoValidation.pseudo);

    logger.audit('User logged in', pseudoValidation.pseudo);

    return {
      pseudo: user.pseudo,
      isModerator: user.is_moderator,
      preferredLanguage: user.preferred_language
    };
  }
}

module.exports = AuthService;
