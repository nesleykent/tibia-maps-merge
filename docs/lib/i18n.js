// Small dictionary for the strings app.js and logs.js generate dynamically.
// Everything else (headings, labels, hints) lives directly in each
// language's HTML file -- no templating needed for static text.
const STRINGS = {
  en: {
    loading: 'Loading…',
    loaded: (count, date) => `Loaded ${localeNumber(count, 'en')} community markers (updated ${date})`,
    unknownDate: 'unknown date',
    retry: 'Retry',
    checkForUpdates: 'Check for updates',
    communityFailed: 'Community markers failed to load -- click Retry above first.',
    chooseFile: 'Choose at least one of your own marker files first.',
    noneParsed: 'None of your marker files could be parsed.',
    labelCommunity: 'Community markers loaded',
    labelYours: 'Your markers loaded',
    labelTotal: 'Total markers in result',
    skippedIntro: 'Skipped (could not read):',
    working: 'Working…',
    filesSelected: (n) => `${n} files selected`,

    mergedSuccessZip: (name) => `Merged successfully -- <strong>${name}</strong> downloaded.`,
    convertedSuccessZip: (name) => `Converted successfully -- <strong>${name}</strong> downloaded.`,
    labelAdded: 'New, only in your file',
    labelIdentical: 'Unchanged (already matched community)',
    labelConflicts: 'Conflicts, resolved in your favor',
    chooseConversionFile: 'Choose a file to convert first.',

    formatBin: 'Tibia binary marker format (.bin)',
    formatJson: 'JSON (markers.json)',
    formatCommunityLive: "tibiamaps.io live download (minimap-with-markers.zip)",

    logTitleMerge: 'Tibia Maps Merge -- Merge Log',
    logTitleConversion: 'Tibia Maps Merge -- Conversion Log',
    logGeneratedAt: 'Generated',
    logSourceFile: 'Source file',
    logSourceFormat: 'Source format',
    logOutputFormat: 'Output format',
    logMarkersConverted: 'Markers converted',
    logValidation: 'Validation',
    logValidationOk: 'OK -- round-trip verified, no data loss',
    logValidationOkDedup: (n) => `OK -- round-trip verified; ${n} exact duplicate marker(s) at the same coordinate were removed`,
    logMarkersModified: 'Markers modified',
    logMarkersModifiedNone: 'none (this is a pure format conversion)',
    logProcessingLocation: 'Processing location',
    logProcessingLocal: '100% local in your browser -- nothing was uploaded',
    logUserFile: 'Your file(s)',
    logBackupFile: 'Backup file(s) created',
    logCommunityLoaded: 'Community markers loaded',
    logPersonalLoaded: 'Your markers loaded',
    logAdded: 'New, only in your file(s)',
    logIdentical: 'Unchanged (already matched community)',
    logConflicts: 'Conflicts, resolved in your favor',
    logTotal: 'Total markers in final file',
    logPolicy: 'Conflict resolution policy',
    logPolicyText: 'Your markers always take priority over community markers at the same coordinate.',
    logConflictsListHeader: 'Detected conflicts (coordinate: community marker -> your marker):',
    logConflictsListEmpty: '(none)',
  },
  'pt-BR': {
    loading: 'Carregando…',
    loaded: (count, date) => `${localeNumber(count, 'pt-BR')} marcações da comunidade carregadas (atualizado em ${date})`,
    unknownDate: 'data desconhecida',
    retry: 'Tentar novamente',
    checkForUpdates: 'Verificar atualizações',
    communityFailed: 'Não foi possível carregar as marcações da comunidade -- clique em "Tentar novamente" acima.',
    chooseFile: 'Escolha pelo menos um dos seus próprios arquivos de marcação primeiro.',
    noneParsed: 'Não foi possível ler nenhum dos seus arquivos de marcação.',
    labelCommunity: 'Marcações da comunidade carregadas',
    labelYours: 'Suas marcações carregadas',
    labelTotal: 'Total de marcações no resultado',
    skippedIntro: 'Ignorados (não foi possível ler):',
    working: 'Processando…',
    filesSelected: (n) => `${n} arquivos selecionados`,

    mergedSuccessZip: (name) => `Mesclado com sucesso -- <strong>${name}</strong> baixado.`,
    convertedSuccessZip: (name) => `Convertido com sucesso -- <strong>${name}</strong> baixado.`,
    labelAdded: 'Novas, só no seu arquivo',
    labelIdentical: 'Sem alteração (já igual à comunidade)',
    labelConflicts: 'Conflitos, resolvidos a seu favor',
    chooseConversionFile: 'Escolha um arquivo para converter primeiro.',

    formatBin: 'Formato binário de marcações do Tibia (.bin)',
    formatJson: 'JSON (markers.json)',
    formatCommunityLive: 'download em tempo real do tibiamaps.io (minimap-with-markers.zip)',

    logTitleMerge: 'Tibia Maps Merge -- Log de Mesclagem',
    logTitleConversion: 'Tibia Maps Merge -- Log de Conversão',
    logGeneratedAt: 'Gerado em',
    logSourceFile: 'Arquivo de origem',
    logSourceFormat: 'Formato de origem',
    logOutputFormat: 'Formato de saída',
    logMarkersConverted: 'Marcações convertidas',
    logValidation: 'Validação',
    logValidationOk: 'OK -- verificado por round-trip, sem perda de dados',
    logValidationOkDedup: (n) => `OK -- verificado por round-trip; ${n} marcação(ões) duplicada(s) na mesma coordenada foram removidas`,
    logMarkersModified: 'Marcações modificadas',
    logMarkersModifiedNone: 'nenhuma (esta é uma conversão pura de formato)',
    logProcessingLocation: 'Local de processamento',
    logProcessingLocal: '100% local no seu navegador -- nada foi enviado',
    logUserFile: 'Seu(s) arquivo(s)',
    logBackupFile: 'Backup(s) criado(s)',
    logCommunityLoaded: 'Marcações da comunidade carregadas',
    logPersonalLoaded: 'Suas marcações carregadas',
    logAdded: 'Novas, só no(s) seu(s) arquivo(s)',
    logIdentical: 'Sem alteração (já igual à comunidade)',
    logConflicts: 'Conflitos, resolvidos a seu favor',
    logTotal: 'Total de marcações no arquivo final',
    logPolicy: 'Política de resolução de conflitos',
    logPolicyText: 'Suas marcações sempre têm prioridade sobre as da comunidade na mesma coordenada.',
    logConflictsListHeader: 'Conflitos detectados (coordenada: marcação da comunidade -> sua marcação):',
    logConflictsListEmpty: '(nenhum)',
  },
};

export function currentLang() {
  if (typeof document === 'undefined') return 'en';
  const lang = document.documentElement.lang;
  return STRINGS[lang] ? lang : 'en';
}

export function tFor(lang, key, ...args) {
  const entry = STRINGS[lang]?.[key] ?? STRINGS.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

export function t(key, ...args) {
  return tFor(currentLang(), key, ...args);
}

export function localeNumber(n, lang) {
  return n.toLocaleString((lang ?? currentLang()) === 'pt-BR' ? 'pt-BR' : 'en-US');
}

export function localeDate(date, lang) {
  if (!date) return tFor(lang ?? currentLang(), 'unknownDate');
  const locale = (lang ?? currentLang()) === 'pt-BR' ? 'pt-BR' : 'en-US';
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}
