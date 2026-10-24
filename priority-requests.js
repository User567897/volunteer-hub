// Display helpers only. The server awards and persists every signup multiplier.
const PRIORITY_WINDOW_MS = 48 * 60 * 60 * 1000;
const normalized = value => String(value ?? '').trim().toLowerCase();
const multiplierValue = value => value === 2 ? 2 : 1;
const numberLabel = value => new Intl.NumberFormat('en-US', {maximumFractionDigits:2}).format(value);

// Require a zoned server timestamp; never interpret school wall time in the
// student's device timezone. The server resolves America/New_York and DST.
function timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/i.exec(value);
  if (!match) return null;
  const [,year,month,day,hour,minute,second,offsetHour='0',offsetMinute='0'] = match.map((part,index) => index ? Number(part ?? 0) : part);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year,month-1,day);
  calendar.setUTCHours(hour,minute,second,0);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month-1 || calendar.getUTCDate() !== day) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

function clock(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return timestamp(value);
}

/** A stale browser may remove a priority badge, but may never grant the bonus. */
export function isPriorityRequest(request, {now = new Date()} = {}) {
  if (!request || request.is_priority !== true || normalized(request.status) !== 'open') return false;
  const remaining = Number(request.remaining_count ?? request.needed_count);
  if (!Number.isFinite(remaining) || remaining <= 0) return false;
  const start = timestamp(request.event_start_at), current = clock(now);
  return start !== null && current !== null && start > current && start-current <= PRIORITY_WINDOW_MS;
}

/** Copy before sorting. Priority first, then earliest start; missing times last. */
export function sortPriorityRequests(requests, {now = new Date()} = {}) {
  return (Array.isArray(requests) ? requests : []).map((request,index) => ({request,index,start:timestamp(request?.event_start_at),priority:isPriorityRequest(request,{now})}))
    .sort((a,b) => {
      if (a.priority !== b.priority) return Number(b.priority)-Number(a.priority);
      if (a.start !== b.start) return a.start === null ? 1 : b.start === null ? -1 : a.start-b.start;
      return a.index-b.index;
    }).map(item => item.request);
}

/** Prospective new signup only: exact session/role, or a universal null role. */
export function findPriorityRequest(requests, sessionId, role, {now = new Date()} = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const selectedRole = String(role ?? '').trim();
  const matching = (Array.isArray(requests) ? requests : []).filter(request => request?.session_id === sessionId &&
    (request.role == null || String(request.role).trim() === '' || String(request.role).trim() === selectedRole) && isPriorityRequest(request,{now}));
  return sortPriorityRequests(matching,{now})[0] ?? null;
}

/** Personal earned credit is stored on the signup, never inferred from requests. */
export function signupCreditMultiplier(signup) {
  return !signup || normalized(signup.status) === 'cancelled' ? 1 : multiplierValue(signup.credit_multiplier);
}

/** Actual hours remain separate from credits; validation/maximums are server-owned. */
export function creditMath(actual, multiplier = 1) {
  const factor = multiplierValue(multiplier);
  const amount = typeof actual === 'number' ? actual : typeof actual === 'string' && actual.trim() ? Number(actual) : NaN;
  if (!Number.isFinite(amount) || amount < 0) return {actualHours:null,multiplier:factor,creditedHours:null};
  const credited = Math.round((amount+Number.EPSILON)*factor*100)/100;
  return Number.isFinite(credited) ? {actualHours:amount,multiplier:factor,creditedHours:credited} : {actualHours:null,multiplier:factor,creditedHours:null};
}

export function formatCreditMath(actual, multiplier = 1) {
  const result = creditMath(actual,multiplier);
  if (result.actualHours === null) return 'Hours to be confirmed';
  return result.multiplier === 2 ? `${numberLabel(result.actualHours)} actual → ${numberLabel(result.creditedHours)} credited hours` : `${numberLabel(result.creditedHours)} ${result.creditedHours === 1 ? 'hour' : 'hours'}`;
}
