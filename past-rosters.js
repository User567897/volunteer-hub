const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

function easternClock(now = new Date()) {
  const instant = new Date(now);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return {date: `${parts.year}-${parts.month}-${parts.day}`, seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)};
}

function seconds(value) {
  const match = timePattern.exec(String(value ?? ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function isPast(event, date, clock) {
  if (!datePattern.test(event.date || '')) return false;
  if (event.date < date) return true;
  if (event.date !== date || clock?.date !== date) return false;
  const end = seconds(event.end_time), start = seconds(event.start_time);
  // An end before its start may mean an overnight event; do not guess when it ended.
  return end !== null && (start === null || end > start) && end <= clock.seconds;
}

function append(map, key, value) {
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function signupLabel(signups) {
  const statuses = new Set(signups.map(signup => normalized(signup.status)));
  if (statuses.has('completed')) return 'Completed';
  if (statuses.has('required')) return 'Required';
  if (statuses.has('signed up')) return 'Signed Up';
  return signups[0]?.status || 'Signed Up';
}

/**
 * Build an admin-only, read-only signup follow-up view from already-loaded records.
 * Default cutoff is strictly before today in New York. An explicit `now` also
 * includes today's sessions whose known end time has passed.
 */
export function buildPastRosters(data = {}, {date, now} = {}) {
  const clock = easternClock(now ?? new Date());
  const cutoff = datePattern.test(date || '') ? date : clock?.date;
  if (!cutoff) return [];
  const todayClock = now === undefined ? null : clock;
  const people = new Map((data.people || []).map(person => [person.id, person]));
  const signupsBySession = new Map(), linkedBySession = new Map(), unlinkedByPersonDate = new Map();
  for (const signup of data.signups || []) append(signupsBySession, signup.session_id, signup);
  for (const hour of data.hours || []) {
    if (hour.session_id) {
      if (!linkedBySession.has(hour.session_id)) linkedBySession.set(hour.session_id, new Map());
      append(linkedBySession.get(hour.session_id), hour.person_id, hour);
    } else {
      if (!unlinkedByPersonDate.has(hour.person_id)) unlinkedByPersonDate.set(hour.person_id, new Map());
      append(unlinkedByPersonDate.get(hour.person_id), hour.date, hour);
    }
  }
  return (data.events || []).filter(event => isPast(event, cutoff, todayClock)).map(event => {
    const signupsByPerson = new Map();
    for (const signup of signupsBySession.get(event.id) || []) append(signupsByPerson, signup.person_id, signup);
    const rows = [...signupsByPerson].map(([personId, signups]) => {
      const current = signups.filter(signup => normalized(signup.status) !== 'cancelled');
      const cancelled = current.length === 0;
      const relevant = cancelled ? signups : current;
      const person = people.get(personId);
      const linked = linkedBySession.get(event.id)?.get(personId) || [];
      const nonrejected = linked.filter(hour => normalized(hour.status) !== 'rejected');
      const unlinked = (unlinkedByPersonDate.get(personId)?.get(event.date) || []).filter(hour => normalized(hour.activity) === normalized(event.name));
      const approved = nonrejected.some(hour => normalized(hour.status) === 'approved');
      const rejected = linked.length > 0 && nonrejected.length === 0;
      const statusKey = approved ? 'approved' : nonrejected.length ? 'pending' : rejected ? 'rejected' : unlinked.length ? 'unlinked' : cancelled ? 'cancelled' : 'missing';
      const status = {approved:'Approved', pending:'Pending', rejected:'Rejected', unlinked:'Unlinked hours to review', missing:'Not submitted', cancelled:'Cancelled'}[statusKey];
      const roles = [...new Set(relevant.map(signup => String(signup.role || '').trim()).filter(Boolean))];
      return {
        person_id: personId, name: person?.name || 'Student record unavailable', grade: person?.grade ?? '',
        person_active: person?.active ?? null, missing_person: !person,
        role: roles.join(' · ') || 'Volunteer', roles,
        signup_status: cancelled ? 'Cancelled' : signupLabel(current), signup_statuses: [...new Set(relevant.map(signup => signup.status))],
        cancelled, status, status_key: statusKey,
        missing: !cancelled && linked.length === 0 && unlinked.length === 0,
        submitted: nonrejected.length > 0, rejected, needs_review: unlinked.length > 0 || rejected || nonrejected.length > 1,
        duplicate_hours: nonrejected.length > 1, multiple_logs: linked.length > 1,
        linked_hours: linked.slice(), unlinked_hours: unlinked.slice(),
      };
    }).sort((a, b) => a.name.localeCompare(b.name) || String(a.person_id).localeCompare(String(b.person_id)));
    const currentRows = rows.filter(row => !row.cancelled);
    return {...event, rows, counts: {
      signed_up: currentRows.length, submitted: currentRows.filter(row => row.submitted).length,
      missing: currentRows.filter(row => row.missing).length, rejected: currentRows.filter(row => row.rejected).length,
      unlinked: currentRows.filter(row => row.unlinked_hours.length > 0).length,
      cancelled: rows.length - currentRows.length, duplicates: currentRows.filter(row => row.duplicate_hours).length,
    }};
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.start_time || '').localeCompare(String(a.start_time || '')) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)));
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric', timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
}

function timeLabel(value) {
  const time = seconds(value);
  if (time === null) return '';
  const hour = Math.floor(time / 3600), minute = Math.floor(time / 60) % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

function sessionTime(event) {
  const start = timeLabel(event.start_time), end = timeLabel(event.end_time);
  return start && end ? `${start} – ${end}` : start ? `Starts ${start}` : end ? `Ends ${end}` : 'Time TBD';
}

/** Render HTML only; the host persists the three control values and handles attendance clicks. */
export function renderPastRosters(data = {}, {sessionId = '', onlyMissing = false, includeCancelled = false, date, now} = {}) {
  const events = buildPastRosters(data, {date, now});
  const selected = events.find(event => event.id === sessionId) || events[0];
  const missingTotal = events.reduce((count, event) => count + event.counts.missing, 0);
  const rows = selected?.rows.filter(row => (includeCancelled || !row.cancelled) && (!onlyMissing || row.missing)) || [];
  return `<section class="past-rosters-panel">
    <div class="section-head"><div><h3>Past rosters</h3><p>${events.length} past event${events.length === 1 ? '' : 's'} · <strong>${missingTotal}</strong> not submitted</p></div></div>
    <label>Past event<select id="past-roster-event" ${events.length ? '' : 'disabled'}>${events.map(event => `<option value="${esc(event.id)}" ${event.id === selected?.id ? 'selected' : ''}>${esc(dateLabel(event.date))} · ${esc(event.name)} · ${event.counts.missing} not submitted</option>`).join('')}</select></label>
    <div class="actions"><label class="check-row"><input type="checkbox" id="past-roster-missing" ${onlyMissing ? 'checked' : ''}>Not submitted only</label><label class="check-row"><input type="checkbox" id="past-roster-cancelled" ${includeCancelled ? 'checked' : ''}>Include cancelled</label></div>
    ${selected ? `<div class="section-head"><div><h3>${esc(selected.name)}</h3><p>${esc(dateLabel(selected.date))} · ${esc(sessionTime(selected))}${selected.location ? ` · ${esc(selected.location)}` : ''}${selected.active === false ? ' · Hidden event' : ''}</p><p>${selected.counts.signed_up} on roster · ${selected.counts.missing} not submitted · ${selected.counts.submitted} submitted${selected.counts.rejected ? ` · ${selected.counts.rejected} rejected` : ''}${selected.counts.unlinked ? ` · ${selected.counts.unlinked} unlinked to review` : ''}</p></div><button type="button" data-log-attendance="${esc(selected.id)}">Log attendance / walk-ins</button></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Student</th><th scope="col">Grade</th><th scope="col">Role</th><th scope="col">Sign-up</th><th scope="col">Hours</th></tr></thead><tbody>${rows.map(row => `<tr data-past-person="${esc(row.person_id)}"><td>${esc(row.name)}${row.person_active === false ? '<br><small>Inactive account</small>' : ''}</td><td>${esc(row.grade || '—')}</td><td>${esc(row.role)}</td><td>${esc(row.signup_status)}</td><td><span class="status-chip status-${row.status_key}">${esc(row.status)}</span>${row.rejected ? '<br><small>Needs resubmission or review</small>' : ''}${row.unlinked_hours.length && row.status_key !== 'unlinked' ? '<br><small>Unlinked hours to review</small>' : ''}${row.multiple_logs ? `<br><small>${row.linked_hours.length} linked logs${row.duplicate_hours ? ' · Review duplicates' : ''}</small>` : ''}${row.cancelled ? '<br><small>Cancelled · excluded from missing counts</small>' : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p>${onlyMissing ? 'No unsubmitted hours on this roster.' : 'No sign-ups for this event.'}</p>`}
    ${selected.counts.unlinked ? '<p class="muted">Unlinked hours match the student, activity name and date. Review them before treating hours as missing.</p>' : ''}<p class="muted">Sign-ups do not confirm attendance.</p>` : '<p>No past events yet.</p>'}
  </section>`;
}
