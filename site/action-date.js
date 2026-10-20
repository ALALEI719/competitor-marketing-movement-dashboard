// Articles keep the source calendar day. Normalized mail timestamps use the same
// Beijing day as the EDM library. Import time is never a historical action date.
export function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return '';
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
    && Number.isFinite(Date.parse(value)) ? day : '';
}

export function actionDateInfo(action) {
  const isChange=action.changeType === 'content_updated' || action.actionType === 'page_change';
  // An update is a different action from the original publication. Without an
  // explicitly confirmed occurrence date, retain its observation date/basis.
  for (const field of isChange ? ['occurredAt'] : ['occurredAt', 'publishDate', 'sentAt']) {
    const day = calendarDay(action[field]);
    if (day) return { day: action.channel === 'edm' ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(action[field])) : day,
      basis: action.dateBasis || (field === 'sentAt' || action.channel === 'edm' ? 'sent_date' : 'source_publication') };
  }
  const day = action.historicalBackfill ? '' : calendarDay(action.discoveredAt);
  return { day, basis: day ? (isChange ? 'change_observed' : 'discovery_only') : 'unknown' };
}

export function actionDateLabel(action) {
  const { day, basis } = actionDateInfo(action);
  const label = { change_observed: '变化发现日期', manual_record: '人工记录', discovery_only: '发现日期', source_publication: '来源发布日期', sent_date: '发信日期' }[basis] || '动作日期';
  return day ? `${day} · ${label}` : '动作日期待确认';
}

export function matchesActionPeriod(action, { from = '', to = '', campaign = '' } = {}) {
  const { day } = actionDateInfo(action);
  return (!campaign || action.campaignId === campaign)
    && ((!from && !to) || Boolean(day && (!from || day >= from) && (!to || day <= to)));
}

export function actionDateOrder(a, b) {
  return actionDateInfo(b).day.localeCompare(actionDateInfo(a).day)
    || String(a.actionId || '').localeCompare(String(b.actionId || ''));
}
