// Shared by the browser and private reviewers. URL equality alone never merges updates.
export function canonicalWebsiteUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.search = ''; url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch { return ''; }
}

export function websiteChangeKey(record) {
  if (!record || (record.channel && !['blog', 'official_site'].includes(record.channel))) return '';
  const url = canonicalWebsiteUrl(record.sourceUrl || record.url || record.sourceUrls?.[0]);
  if (!url || !/^\/blogs\/news\/[^/]+$/.test(new URL(url).pathname) || !record.brand) return '';
  const country = record.countryCode || ({ '美国': 'US', '德国': 'DE', '英国': 'UK', '法国': 'FR' })[record.country] || record.country;
  if (!country) return '';
  const prefix = JSON.stringify([record.brand.toLowerCase(), country, url]);
  const type = record.changeType || record.type;
  if (['new_content', 'new_page', 'historical_publication'].includes(type) ||
      (!type && record.channel === 'blog' && record.actionId)) return `${prefix}|publication`;
  if (!['content_updated', 'content_change'].includes(type)) return '';
  const evidence = record.contentEvidence;
  if (!evidence || evidence.status !== 'changed_content' || !evidence.beforeHash || !evidence.afterHash || evidence.beforeHash === evidence.afterHash) return '';
  // Compare only actual evidence transitions, never date proximity or matching titles.
  return `${prefix}|update|${JSON.stringify([evidence.beforeHash, evidence.afterHash, record.updatedAt || ''])}`;
}

export function relatedBlogRecords(siteRecord, blogRecords = []) {
  const key = websiteChangeKey(siteRecord);
  return key ? blogRecords.filter(record => websiteChangeKey(record) === key) : [];
}

export function websiteReviewQueue(siteRecords = [], blogRecords = []) {
  const blog = blogRecords.filter(record => record.reviewStatus === 'pending').map(record => ({ ...record, discoveryRecordIds: [] }));
  const linked = [];
  const site = [];
  for (const record of siteRecords.filter(record => record.reviewStatus === 'pending')) {
    const matches = relatedBlogRecords(record, blogRecords);
    if (!matches.length) { site.push(record); continue; }
    linked.push({ recordId: record.recordId, brand: record.brand, country: record.country, blogRecordIds: matches.map(item => item.recordId), sourceUrl: record.url, reason: 'same_article_same_change' });
    for (const item of blog.filter(item => matches.some(match => match.recordId === item.recordId))) item.discoveryRecordIds.push(record.recordId);
  }
  return { site, blog, linked };
}

export function assertNoDuplicateWebsiteAction(action, actions = []) {
  const key = websiteChangeKey(action);
  if (!key) return;
  const existing = actions.find(item => item.actionId !== action.actionId && item.reviewStatus === 'approved' && websiteChangeKey(item) === key);
  if (existing) throw new Error(`Same Blog article change already approved as ${existing.actionId}; do not publish a second action`);
}

export function assertSiteReviewOwnership(record, blogRecords = []) {
  const matches = relatedBlogRecords(record, blogRecords);
  if (matches.length) throw new Error(`Blog owns this article change; review ${matches.map(item => item.recordId).join(', ')} through the shared website review entry`);
  const article = websiteChangeKey({ ...record, type: 'new_page', changeType: 'new_content' });
  const known = article && blogRecords.some(item => websiteChangeKey({ ...item, changeType: 'new_content' }) === article);
  if (record?.type === 'content_change' && known) throw new Error('Known Blog article update needs comparable Blog body evidence; keep this site observation pending rather than approve a second action');
}
