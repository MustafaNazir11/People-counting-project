import i18n from '../i18n'

// Format numbers with Arabic-Indic digits when language is Arabic
export const arNum = (v) => Number(v).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : undefined)
