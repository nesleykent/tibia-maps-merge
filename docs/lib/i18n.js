// Small dictionary for the handful of strings app.js generates dynamically.
// Everything else (headings, labels, hints) lives directly in each
// language's HTML file -- no templating needed for static text.
const STRINGS = {
  en: {
    loading: 'Loading…',
    loaded: (count, date) => `Loaded ${localeNumber(count)} community markers (updated ${date})`,
    unknownDate: 'unknown date',
    retry: 'Retry',
    communityFailed: 'Community markers failed to load -- click Retry above first.',
    chooseFile: 'Choose at least one of your own marker files first.',
    noneParsed: 'None of your marker files could be parsed.',
    mergedSuccess: (name) => `Merged successfully -- <strong>${name}</strong> downloaded.`,
    labelCommunity: 'Community markers',
    labelYours: 'Your markers',
    labelOverridden: 'Yours overrode community',
    labelTotal: 'Total in result',
    skippedIntro: 'Skipped (could not read):',
    working: 'Working…',
    filesSelected: (n) => `${n} files selected`,
  },
  'pt-BR': {
    loading: 'Carregando…',
    loaded: (count, date) => `${localeNumber(count)} marcações da comunidade carregadas (atualizado em ${date})`,
    unknownDate: 'data desconhecida',
    retry: 'Tentar novamente',
    communityFailed: 'Não foi possível carregar as marcações da comunidade -- clique em "Tentar novamente" acima.',
    chooseFile: 'Escolha pelo menos um dos seus próprios arquivos de marcação primeiro.',
    noneParsed: 'Não foi possível ler nenhum dos seus arquivos de marcação.',
    mergedSuccess: (name) => `Mesclado com sucesso -- <strong>${name}</strong> baixado.`,
    labelCommunity: 'Marcações da comunidade',
    labelYours: 'Suas marcações',
    labelOverridden: 'Suas marcações substituíram as da comunidade',
    labelTotal: 'Total no resultado',
    skippedIntro: 'Ignorados (não foi possível ler):',
    working: 'Processando…',
    filesSelected: (n) => `${n} arquivos selecionados`,
  },
};

export function currentLang() {
  const lang = document.documentElement.lang;
  return STRINGS[lang] ? lang : 'en';
}

export function t(key, ...args) {
  const entry = STRINGS[currentLang()][key] ?? STRINGS.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

export function localeNumber(n) {
  return n.toLocaleString(currentLang() === 'pt-BR' ? 'pt-BR' : 'en-US');
}

export function localeDate(date) {
  if (!date) return t('unknownDate');
  const locale = currentLang() === 'pt-BR' ? 'pt-BR' : 'en-US';
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}
