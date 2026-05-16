import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  i18n,
  normalizeLanguage,
} from '.';
import zhCn from './zh-cn.json';

describe('locale helpers', () => {
  it('defaults invalid stored values to English', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'system');

    expect(normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY))).toBe(
      DEFAULT_LANGUAGE,
    );
  });

  it('normalizes browser language variants to supported app languages', () => {
    expect(normalizeLanguage('zh-CN')).toBe('zh-CN');
    expect(normalizeLanguage('zh')).toBe('zh-CN');
    expect(normalizeLanguage('fr-CA')).toBe('fr');
    expect(normalizeLanguage('en-US')).toBe('en');
  });

  it('keeps picker options aligned with supported languages', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.value)).toEqual(
      SUPPORTED_LANGUAGES,
    );
  });

  it('keeps locale JSON files aligned by direct English keys', () => {
    const englishKeys = Object.keys(en).sort();

    expect(Object.keys(zhCn).sort()).toEqual(englishKeys);
    expect(Object.keys(fr).sort()).toEqual(englishKeys);
  });

  it('translates direct English sentence keys', async () => {
    await i18n.changeLanguage('fr');

    expect(i18n.t('Sign out')).toBe('Se déconnecter');
    expect(i18n.t('Choose the language used by this browser.')).toBe(
      'Choisissez la langue utilisée par ce navigateur.',
    );
  });

  it('translates direct English plural keys', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('{{count}} session', { count: 1 })).toBe('1 session');
    expect(i18n.t('{{count}} session', { count: 2 })).toBe('2 sessions');
    expect(i18n.t('Also delete {{count}} imported session', { count: 2 })).toBe(
      'Also delete 2 imported sessions',
    );

    await i18n.changeLanguage('fr');

    expect(i18n.t('{{count}} new session imported', { count: 2 })).toBe(
      '2 nouvelles sessions importées',
    );

    await i18n.changeLanguage('zh-CN');

    expect(i18n.t('{{count}} session', { count: 3 })).toBe('3 条记录');
  });

  it('does not keep opaque plural translation keys', () => {
    const opaquePluralKeys = [
      'connectorSession',
      'deleteImportedSessions',
      'newSessionImported',
    ];
    const localeKeys = [en, fr, zhCn].flatMap((locale) => Object.keys(locale));

    expect(
      localeKeys.filter((key) =>
        opaquePluralKeys.some((opaqueKey) => key.startsWith(opaqueKey)),
      ),
    ).toEqual([]);
  });
});
