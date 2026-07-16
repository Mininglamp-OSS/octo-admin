import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import commonEN from './locales/en-US/common.json'
import commonZH from './locales/zh-CN/common.json'
import navEN from './locales/en-US/nav.json'
import navZH from './locales/zh-CN/nav.json'
import layoutEN from './locales/en-US/layout.json'
import layoutZH from './locales/zh-CN/layout.json'
import loginEN from './locales/en-US/login.json'
import loginZH from './locales/zh-CN/login.json'
import dashboardEN from './locales/en-US/dashboard.json'
import dashboardZH from './locales/zh-CN/dashboard.json'
import usersEN from './locales/en-US/users.json'
import usersZH from './locales/zh-CN/users.json'
import groupsEN from './locales/en-US/groups.json'
import groupsZH from './locales/zh-CN/groups.json'
import spacesEN from './locales/en-US/spaces.json'
import spacesZH from './locales/zh-CN/spaces.json'
import spaceAdminEN from './locales/en-US/spaceAdmin.json'
import spaceAdminZH from './locales/zh-CN/spaceAdmin.json'
import appBotsEN from './locales/en-US/appBots.json'
import appBotsZH from './locales/zh-CN/appBots.json'
import systemSettingEN from './locales/en-US/systemSetting.json'
import systemSettingZH from './locales/zh-CN/systemSetting.json'
import backupEN from './locales/en-US/backup.json'
import backupZH from './locales/zh-CN/backup.json'
import downloadEN from './locales/en-US/download.json'
import downloadZH from './locales/zh-CN/download.json'
import systemMcpEN from './locales/en-US/systemMcp.json'
import systemMcpZH from './locales/zh-CN/systemMcp.json'

export const SUPPORTED_LANGUAGES = ['en-US', 'zh-CN'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANG_COOKIE = 'i18n_lang'
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en-US'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'en-US': {
        common: commonEN,
        nav: navEN,
        layout: layoutEN,
        login: loginEN,
        dashboard: dashboardEN,
        users: usersEN,
        groups: groupsEN,
        spaces: spacesEN,
        spaceAdmin: spaceAdminEN,
        appBots: appBotsEN,
        systemSetting: systemSettingEN,
        backup: backupEN,
        download: downloadEN,
        systemMcp: systemMcpEN,
      },
      'zh-CN': {
        common: commonZH,
        nav: navZH,
        layout: layoutZH,
        login: loginZH,
        dashboard: dashboardZH,
        users: usersZH,
        groups: groupsZH,
        spaces: spacesZH,
        spaceAdmin: spaceAdminZH,
        appBots: appBotsZH,
        systemSetting: systemSettingZH,
        backup: backupZH,
        download: downloadZH,
        systemMcp: systemMcpZH,
      },
    },
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: 'common',
    ns: [
      'common',
      'nav',
      'layout',
      'login',
      'dashboard',
      'users',
      'groups',
      'spaces',
      'spaceAdmin',
      'appBots',
      'systemSetting',
      'backup',
      'download',
      'systemMcp',
    ],
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'cookie', 'navigator'],
      lookupQuerystring: 'lang',
      lookupCookie: LANG_COOKIE,
      caches: ['cookie'],
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        secure: window.location.protocol === 'https:',
        path: '/',
      },
    },
  })

export default i18n
