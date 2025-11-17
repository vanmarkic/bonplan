/**
 * Le Syndicat des Tox - i18n Configuration
 * Multi-language support for Belgian users (fr, nl, de, en)
 */

const i18n = require('i18n');
const path = require('path');

i18n.configure({
  locales: ['fr', 'nl', 'de', 'en'],
  defaultLocale: 'fr',
  directory: path.join(__dirname, '../../locales'),
  updateFiles: false,
  indent: '  ',
  extension: '.json',
  prefix: '',
  cookie: 'language',
  queryParameter: 'lang',
  autoReload: process.env.NODE_ENV === 'development',
  syncFiles: false,
  objectNotation: true,
  api: {
    __: 't',
    __n: 'tn'
  },
  register: global
});

module.exports = i18n;
