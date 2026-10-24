import {isPriorityRequest,sortPriorityRequests,signupCreditMultiplier} from './priority-requests.js?v=20261024-coach-priority';
import {followsDuration, updateHoursCalculation} from './event-hours.js?v=20261021';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York'}).format(new Date());
const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : value || 'Date to be confirmed';
const clock = value => { const match = /^(\d{1,2}):(\d{2})/.exec(value || ''); if (!match) return ''; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`; };
const timeRange = event => { const start = clock(event.start_time), end = clock(event.end_time); return start && end ? `${start} – ${end}` : start || end || 'Time to be confirmed'; };
const openRequest = request => String(request.status || 'Open').toLowerCase() === 'open';
export const requestRemaining = request => Math.max(0, Number(request.remaining_count ?? request.needed_count) || 0);
export function mentorDriveLink(value) { try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'drive.google.com' ? url.href : ''; } catch { return ''; } }
const activeSignup = signup => signup.status !== 'Cancelled';
export function mentorSessionType(event = {}) { return ['mentoring','mentorship'].includes(String(event.category || '').toLowerCase()) ? 'Mentorship' : 'Competition'; }
export function mentorSessionSchool(event = {}, programs = []) {
  if (mentorSessionType(event) === 'Competition') return event.competition_school || 'Other';
  return event.mentor_school || programs.find(program => program.id === event.program_id)?.mentor_school || 'School not assigned';
}
const sessionLabel = event => mentorSessionType(event) === 'Mentorship' ? 'Mentorship practice' : 'Competition';
const paths = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  certificate:'<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-3 6 3-2-9"/>',
  people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
  signout:'<path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h11"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;

export function certificateState(certificate, date = today()) {
  const expired = !!certificate.expiry_date && certificate.expiry_date < date;
  const status = certificate.status || 'Pending';
  return {expired, label:expired ? 'Expired' : status, tone:expired || status === 'Rejected' ? 'danger' : status === 'Verified' ? 'success' : 'pending'};
}

export function parseMentorRoles(text) {
  const roles = [], seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/).filter(line => line.trim())) {
    const match = /^(.*?):\s*(\d+)\s*$/.exec(raw.trim());
    if (!match) throw new Error('Use Role: spots on each line, such as Judge: 4.');
    const name = match[1].trim(), capacity = Number(match[2]);
    if (!name || name.length > 100 || !Number.isSafeInteger(capacity) || capacity > 1000) throw new Error('Use role names up to 100 characters and 0–1,000 spots.');
    if (seen.has(name.toLowerCase())) throw new Error(`The role “${name}” appears more than once.`);
    seen.add(name.toLowerCase()); roles.push({name,capacity});
  }
  return roles;
}

export function selectMentorEvents(data, {period='Upcoming',school='All',type='All',sort='date',query='',date=today()} = {}) {
  const signups = data.signups || [];
  const schoolName = event => mentorSessionSchool(event,data.programs || []);
  const count = id => signups.filter(row => row.session_id === id && activeSignup(row)).length;
  const need = event => Number(event.capacity) > 0 ? Math.max(0, Number(event.capacity) - count(event.id)) : 0;
  const result = (data.events || []).filter(event => {
    const future = event.date >= date;
    return (period === 'All' || period === 'Upcoming' && future || period === 'Past' && !future) &&
      (school === 'All' || schoolName(event) === school) && (type === 'All' || mentorSessionType(event) === type) &&
      [event.name,schoolName(event),event.location,sessionLabel(event)].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  return result.sort((a,b) => {
    const byDate = String(a.date || '').localeCompare(String(b.date || '')) || String(a.start_time || '').localeCompare(String(b.start_time || ''));
    if (sort === 'date-desc') return -byDate || a.name.localeCompare(b.name);
    if (sort === 'school') return schoolName(a).localeCompare(schoolName(b)) || byDate;
    if (sort === 'name') return a.name.localeCompare(b.name) || byDate;
    if (sort === 'status') return Number(b.active !== false) - Number(a.active !== false) || byDate;
    if (sort === 'need') return need(b) - need(a) || byDate;
    return byDate || a.name.localeCompare(b.name);
  });
}

const normalize = value => ({...value, mentor:value?.mentor || {}, events:value?.events || [],programs:value?.programs || [],roles:value?.roles || [],signups:value?.signups || [],people:value?.people || [],certificates:value?.certificates || [],certificate_attachments:value?.certificate_attachments || [],requests:value?.requests || []});

/** Mounts an authenticated mentor workspace. update() refreshes without discarding drafts. */
export function mountMentor(root, {repo,onSignOut,initialData} = {}) {
  if (!root || !repo?.loadMentor) throw new Error('A mentor root and repository are required.');
  let data = normalize(initialData), revision, destroyed = false, busy = false, refreshing = false, loaded = !!initialData;
  let view = 'competitions', period = 'Upcoming', school = 'All', type = 'All', sort = 'date', query = '', selectedId = '';
  let editor = null, requestFor = '', dirty = false, certificateQuery = '', certificateFilter = 'All', requestFilter = 'Open';
  let rosterQuery = '', notice = '', noticeKind = 'success', loadedAt;
  const controller = new AbortController();
  const signal = controller.signal;
  root.classList.add('mentor-host');

  const selected = () => data.events.find(event => event.id === selectedId);
  const person = id => data.people.find(row => row.id === id);
  const eventRoles = id => data.roles.filter(role => role.session_id === id);
  const eventSignups = id => data.signups.filter(signup => signup.session_id === id && activeSignup(signup));
  const eventRequests = id => data.requests.filter(request => request.session_id === id);
  const hasDraft = () => dirty || editor !== null || !!requestFor;
  const fieldFocused = () => root.contains(document.activeElement) && document.activeElement.matches('input,select,textarea');
  const activePeople = () => data.people.filter(row => row.active !== false).sort((a,b) => a.name.localeCompare(b.name));
  const schoolName = event => mentorSessionSchool(event,data.programs);
  const canCompetition = () => loaded && data.mentor.competition_access !== false;
  const allSchools = () => canCompetition() && !!data.mentor.all_competitions;
  const canEdit = event => !!event && canCompetition() && mentorSessionType(event) === 'Competition';
  const scopes = () => [canCompetition() ? 'competitions' : '',data.mentor.mentorship_access ? 'practice dates' : ''].filter(Boolean).join(' and ');
  const schools = () => [...new Set(['Whitlow','Sawnee','Otwell','Other',...data.events.map(schoolName)])];
  const filteredEvents = () => selectMentorEvents(data,{period,school,type,sort,query});

  function announce(message, kind='success') {
    notice = message; noticeKind = kind;
    const element = root.querySelector('[data-mentor-notice]');
    if (element) { element.textContent = message; element.hidden = !message; element.className = `mentor-notice ${kind === 'error' ? 'is-error' : ''}`; }
  }
  function syncStatus() {
    const element = root.querySelector('[data-mentor-sync]');
    if (element) element.textContent = hasDraft() ? 'Updates paused while editing' : refreshing ? 'Refreshing…' : loadedAt ? `Updated ${new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(loadedAt)}` : 'Loading workspace…';
  }
  function guardDraft() {
    if (!hasDraft()) return false;
    announce('Save or cancel your open form first. Your entries are still here.', 'error');
    return true;
  }
  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button[data-mutation],form[data-mentor-edit-form] button[type=submit]').forEach(button => { button.disabled = value; });
    root.setAttribute('aria-busy',String(value));
  }

  function badges(id) {
    const certificates = data.certificates.filter(certificate => certificate.person_id === id);
    return certificates.length ? certificates.map(certificate => {
      const status = certificateState(certificate);
      return `<span class="mentor-badge ${status.tone}" title="${escape(`${certificate.status}${certificate.expiry_date ? ' · Expires '+displayDate(certificate.expiry_date) : ''}`)}">${escape(certificate.name)} · ${escape(status.label)}</span>`;
    }).join('') : '<span class="mentor-muted">No certifications</span>';
  }

  function competitionCards() {
    const events = filteredEvents();
    return events.length ? events.map(event => {
      const signed = eventSignups(event.id).length, capacity = Number(event.capacity), need = capacity > 0 ? Math.max(0,capacity-signed) : null;
      const requests = eventRequests(event.id).filter(request => openRequest(request) && requestRemaining(request) > 0);
      return `<article class="mentor-event-card ${selectedId === event.id ? 'is-selected' : ''}">
        <div class="mentor-card-meta"><span>${escape(schoolName(event))}</span><span class="mentor-badge ${event.active === false ? '' : 'success'}">${mentorSessionType(event) === 'Mentorship' ? 'Practice' : 'Competition'} · ${event.active === false ? 'Hidden' : event.date < today() ? 'Past' : 'Published'}</span></div>
        <h3><button type="button" data-mentor-action="select-event" data-id="${escape(event.id)}" aria-pressed="${selectedId === event.id}">${escape(event.name)}${icon('arrow')}</button></h3>
        <p class="mentor-date">${escape(displayDate(event.date))}</p><p>${escape(timeRange(event))}</p>
        ${event.location ? `<p class="mentor-location">${escape(event.location)}</p>` : ''}
        <div class="mentor-card-foot"><span><strong>${signed}${capacity > 0 ? ` / ${capacity}` : ''}</strong> volunteers</span><span>${need === null ? 'Open capacity' : need ? `${need} spots open` : 'Full'}</span></div>
        ${requests.some(r=>isPriorityRequest(r))?'<span class="priority-badge">Priority · 2× hours for new sign-ups</span>':''}${requests.length ? `<span class="mentor-request-marker">${requests.length} open volunteer request${requests.length === 1 ? '' : 's'}</span>` : ''}
      </article>`;
    }).join('') : `<div class="mentor-empty"><h3>No sessions found</h3><p>Try another date, type, or school filter.</p></div>`;
  }

  function rosterRows(event) {
    const rows = data.signups.filter(signup => signup.session_id === event.id && activeSignup(signup) && [person(signup.person_id)?.name,person(signup.person_id)?.grade,signup.role,signup.status].join(' ').toLowerCase().includes(rosterQuery.toLowerCase())).sort((a,b) => (person(a.person_id)?.name || '').localeCompare(person(b.person_id)?.name || ''));
    return rows.length ? rows.map(signup => {
      const student = person(signup.person_id);
      return `<tr><td><strong>${escape(student?.name || 'Volunteer')}</strong><small>${student?.grade ? `Grade ${escape(student.grade)}` : 'Grade not listed'}</small></td><td>${escape(signup.role || 'Volunteer')}</td><td><span class="mentor-badge ${signup.status === 'Required' ? 'pending' : signup.status === 'Cancelled' ? 'danger' : ''}">${escape(signup.status)}</span>${signupCreditMultiplier(signup)===2?'<span class="priority-badge">2× hours earned</span>':''}</td><td><div class="mentor-certificate-badges">${badges(signup.person_id)}</div></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="mentor-empty-cell">No volunteers match this roster.</td></tr>';
  }

  function requestForm(event) {
    if (requestFor !== event.id) return '';
    const roles = eventRoles(event.id);
    return `<section class="mentor-form-panel" aria-labelledby="mentor-request-title"><div class="mentor-section-heading"><h3 id="mentor-request-title">Request volunteers</h3><button type="button" class="mentor-icon-button" data-mentor-action="cancel-request" aria-label="Cancel volunteer request">${icon('close')}</button></div>
      <div class="mentor-date-focus"><p class="mentor-eyebrow">${escape(schoolName(event))} · ${escape(sessionLabel(event))}</p><strong>${escape(event.name)}</strong><p>${escape(displayDate(event.date))}</p><p>${escape(timeRange(event))}</p><small>${mentorSessionType(event) === 'Mentorship' ? 'This practice date only — not the whole series.' : 'This event date only.'}</small></div><form data-mentor-edit-form id="mentor-request-form" data-session="${escape(event.id)}">
      <div class="mentor-form-pair"><label>Additional volunteers<input name="count" type="number" inputmode="numeric" min="1" max="100" step="1" value="1" required></label><label>Role${roles.length ? `<select name="role">${roles.map(role => `<option value="${escape(role.name)}">${escape(role.name)}</option>`).join('')}</select>` : '<input name="role" value="Volunteer" readonly><span class="mentor-field-hint">No separate roles are set for this event.</span>'}</label></div>
      <p class="mentor-fine">Requests within 48 hours of the start offer double hours to first-time sign-ups for the requested role.</p><label>Note to students<textarea name="note" rows="3" maxlength="1000" placeholder="Where to meet, what to bring, or who can help"></textarea></label><div class="mentor-form-actions"><button type="submit" class="mentor-primary">${icon('people')}Post volunteer request</button><button type="button" data-mentor-action="cancel-request">Cancel</button></div></form></section>`;
  }

  function requestCards(requests, compact=false) {
    return requests.length ? sortPriorityRequests(requests).map(request => {
      const event = data.events.find(row => row.id === request.session_id);
      const remaining = requestRemaining(request), fulfilled = openRequest(request) && remaining === 0;
      const amount = openRequest(request) ? remaining : Number(request.needed_count), roleLabel = request.role && request.role !== 'Volunteer' ? `${escape(request.role)} volunteer${amount === 1 ? '' : 's'}` : `volunteer${amount === 1 ? '' : 's'}`;
      return `<article class="mentor-request-card ${isPriorityRequest(request)?'priority-request':''}">${isPriorityRequest(request)?'<span class="priority-badge">Priority · 2× hours for new sign-ups</span>':''}<div class="mentor-card-meta"><span>${escape(event ? schoolName(event) : '')}</span><span class="mentor-badge ${openRequest(request) && !fulfilled ? 'pending' : 'success'}">${fulfilled ? 'Filled' : escape(request.status || 'Open')}</span></div>
        <h3>${openRequest(request) ? `${remaining} more` : escape(request.needed_count)} ${roleLabel}</h3><p class="mentor-fine">${fulfilled ? 'The requested spots are filled.' : openRequest(request) ? `${remaining} still needed · ${escape(request.needed_count)} originally requested` : `${escape(request.needed_count)} originally requested`}</p>
        ${!compact ? `<p><strong>${escape(event?.name || 'School session')}</strong></p>` : ''}<div class="mentor-request-date"><p>${escape(displayDate(event?.date))} · ${escape(event ? timeRange(event) : 'Time to be confirmed')}</p><small>${event && mentorSessionType(event) === 'Mentorship' ? 'This practice date only' : 'This event date only'}</small></div>
        ${request.note ? `<p class="mentor-request-note">${escape(request.note)}</p>` : ''}<p class="mentor-fine">${escape(request.mentor_name || data.mentor.name)}${request.created_at ? ` · ${escape(displayDate(String(request.created_at).slice(0,10)))}` : ''}</p>
        ${openRequest(request) ? `<button type="button" data-mutation data-mentor-action="close-request" data-id="${escape(request.id)}">Close request</button>` : '<p class="mentor-fine">This request is closed.</p>'}</article>`;
    }).join('') : '<div class="mentor-empty"><p>No volunteer requests here.</p></div>';
  }

  function roster() {
    const event = selected();
    if (!event) return '';
    const roles = eventRoles(event.id), signups = eventSignups(event.id);
    return `<section class="mentor-roster mentor-surface" aria-labelledby="mentor-roster-title"><div class="mentor-section-heading"><div><p class="mentor-eyebrow">${escape(schoolName(event))} · ${mentorSessionType(event) === 'Mentorship' ? 'PRACTICE DATE' : 'COMPETITION'} ROSTER</p><h2 id="mentor-roster-title">${escape(event.name)}</h2></div><span class="mentor-roster-total"><strong>${signups.length}</strong><small>volunteers</small></span></div>
      <p class="mentor-date">${escape(displayDate(event.date))} · ${escape(timeRange(event))}</p>${event.location ? `<p>${escape(event.location)}</p>` : ''}${event.description ? `<p class="mentor-description">${escape(event.description)}</p>` : ''}
      <div class="mentor-roster-actions"><button type="button" class="mentor-primary" data-mentor-action="open-request" data-id="${escape(event.id)}">${icon('people')}Request volunteers for this date</button>${canEdit(event) ? `<button type="button" data-mentor-action="edit-event" data-id="${escape(event.id)}">${icon('edit')}Edit competition</button>` : ''}</div>
      ${roles.length ? `<div class="mentor-role-summary">${roles.map(role => `<span><strong>${escape(role.name)}</strong>${signups.filter(signup => signup.role === role.name).length}${Number(role.capacity) > 0 ? ` / ${Number(role.capacity)}` : ''} signed up</span>`).join('')}</div>` : ''}
      ${requestForm(event)}<div class="mentor-roster-filter"><label><span class="mentor-visually-hidden">Search this roster</span><input id="mentor-roster-search" type="search" placeholder="Search this roster" value="${escape(rosterQuery)}"></label></div>
      <div class="mentor-table-scroll" tabindex="0" role="region" aria-label="${escape(sessionLabel(event))} volunteer roster"><table><thead><tr><th>Student</th><th>Role</th><th>Status</th><th>Certifications</th></tr></thead><tbody data-mentor-roster-rows>${rosterRows(event)}</tbody></table></div>
      ${eventRequests(event.id).length ? `<div class="mentor-section-heading mentor-inner-heading"><h3>Volunteer requests</h3></div><div class="mentor-request-grid">${requestCards(eventRequests(event.id).slice().sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))),true)}</div>` : ''}</section>`;
  }

  function competitionEditor() {
    if (editor === null || !canCompetition()) return '';
    const event = editor, roles = event.id ? eventRoles(event.id) : [], scopedSchool = data.mentor.school_scope;
    return `<section class="mentor-form-panel mentor-competition-editor" aria-labelledby="mentor-editor-title"><div class="mentor-section-heading"><div><p class="mentor-eyebrow">COMPETITION DETAILS</p><h2 id="mentor-editor-title">${event.id ? 'Edit competition' : 'Create competition'}</h2></div><button type="button" class="mentor-icon-button" data-mentor-action="cancel-editor" aria-label="Cancel competition editor">${icon('close')}</button></div>
      <form data-mentor-edit-form id="mentor-event-form" data-id="${escape(event.id || '')}">
        <label>Competition name<input name="name" maxlength="160" value="${escape(event.name || '')}" required></label>
        <div class="mentor-form-pair"><label>School<select name="competition_school" ${scopedSchool ? 'aria-describedby="mentor-school-scope"' : ''}>${(scopedSchool ? [scopedSchool] : schools()).map(value => `<option value="${escape(value)}" ${value === (event.competition_school || scopedSchool || 'Other') ? 'selected' : ''}>${escape(value)}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${escape(event.date || today())}" required><span class="mentor-field-hint" data-mentor-weekday>${escape(displayDate(event.date || today()))}</span></label></div>
        ${scopedSchool ? `<p id="mentor-school-scope" class="mentor-fine">Your competitions are assigned to ${escape(scopedSchool)}.</p>` : ''}
        <div class="mentor-form-pair"><label>Start time<input name="start_time" type="time" value="${escape((event.start_time || '').slice(0,5))}" required></label><label>End time<input name="end_time" type="time" value="${escape((event.end_time || '').slice(0,5))}" required></label></div>
        <label>Volunteer hours<input name="hours" type="number" min="0.01" max="24" step="0.01" value="${escape(event.hours ?? 1)}" required></label><label class="mentor-check"><input name="auto_hours" type="checkbox" ${followsDuration(event) ? 'checked' : ''}>Calculate hours from start and end times</label><p class="mentor-fine" data-hours-hint>Set both times to calculate hours. You can also enter a custom amount.</p>
        <label>Location<input name="location" maxlength="300" value="${escape(event.location || '')}"></label><label>Description<textarea name="description" rows="3" maxlength="4000">${escape(event.description || '')}</textarea></label>
        <div class="mentor-form-pair"><label>Total volunteer capacity<input name="capacity" type="number" min="0" max="1000" step="1" value="${escape(event.capacity ?? 0)}" required><span class="mentor-field-hint">0 means unlimited.</span></label>${event.id ? `<label>Visibility<select name="active"><option value="true" ${event.active !== false ? 'selected' : ''}>Published</option><option value="false" ${event.active === false ? 'selected' : ''}>Hidden</option></select></label>` : '<p class="mentor-field-hint">Publishing adds this competition to the student app.</p>'}</div>
        <label>Roles and spots<textarea name="roles" rows="4" maxlength="6000" placeholder="Judge: 4&#10;Check-in: 2">${escape(roles.map(role => `${role.name}: ${role.capacity}`).join('\n'))}</textarea><span class="mentor-field-hint">One Role: spots per line. Use 0 for unlimited, or leave blank for Volunteer.</span></label>
        <div class="mentor-form-actions"><button type="submit" class="mentor-primary">${icon(event.id ? 'edit' : 'plus')}${event.id ? 'Save competition' : 'Publish competition'}</button><button type="button" data-mentor-action="cancel-editor">Cancel</button></div>
      </form></section>`;
  }

  function competitions() {
    const visible = filteredEvents();
    if (!selectedId && visible.length) selectedId = visible[0].id;
    return `<div class="mentor-section-heading"><div><p class="mentor-eyebrow">${allSchools() ? 'ALL COMPETITIONS' : escape(data.mentor.school_scope || 'YOUR SCHOOL')}</p><h1>School sessions</h1></div>${canCompetition() ? `<button type="button" class="mentor-primary" data-mentor-action="new-event">${icon('plus')}Create competition</button>` : ''}</div>
      ${competitionEditor()}
      <div class="mentor-filter-bar"><label>Dates<select id="mentor-period">${['Upcoming','Past','All'].map(value => `<option ${period === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Type<select id="mentor-type"><option value="All">All sessions</option>${canCompetition() ? `<option value="Competition" ${type === 'Competition' ? 'selected' : ''}>Competitions</option>` : ''}${data.mentor.mentorship_access ? `<option value="Mentorship" ${type === 'Mentorship' ? 'selected' : ''}>Mentorship practices</option>` : ''}</select></label>${allSchools() ? `<label>School<select id="mentor-school"><option>All</option>${schools().map(value => `<option ${school === value ? 'selected' : ''}>${escape(value)}</option>`).join('')}</select></label>` : ''}<label>Sort<select id="mentor-sort">${[['date','Date · soonest'],['date-desc','Date · latest'],['school','School'],['name','Session name'],['status','Published status'],['need','Most open spots']].map(([value,label]) => `<option value="${value}" ${sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="mentor-search-label">Find a session<input id="mentor-event-search" type="search" value="${escape(query)}" placeholder="Name, school, or location"></label></div>
      <p class="mentor-fine" data-mentor-event-count>${visible.length} session${visible.length === 1 ? '' : 's'}</p><div class="mentor-event-grid" data-mentor-event-grid>${competitionCards()}</div><div data-mentor-roster>${roster()}</div>`;
  }

  function certificateDirectory() {
    const matches = activePeople().map(student => ({student,certificates:data.certificates.filter(certificate => certificate.person_id === student.id)})).filter(({student,certificates}) => {
      const text = [student.name,student.grade,...certificates.map(certificate => certificate.name)].join(' ').toLowerCase();
      return text.includes(certificateQuery.trim().toLowerCase()) && (certificateFilter === 'All' || certificateFilter === 'None' && !certificates.length || certificates.some(certificate => certificateState(certificate).label === certificateFilter));
    });
    return matches.length ? matches.map(({student,certificates}) => `<article class="mentor-student-card"><div class="mentor-section-heading"><h3>${escape(student.name)}</h3><span class="mentor-muted">${student.grade ? `Grade ${escape(student.grade)}` : 'Grade not listed'}</span></div>${certificates.length ? certificates.map(certificate => {
      const status = certificateState(certificate), files = data.certificate_attachments.filter(file => file.certification_id === certificate.id);
      return `<section class="mentor-certification"><div class="mentor-card-meta"><strong>${escape(certificate.name)}</strong><span class="mentor-badge ${status.tone}">${escape(status.label)}</span></div>${certificate.organization ? `<p>${escape(certificate.organization)}</p>` : ''}<p>Earned ${escape(displayDate(certificate.earned_date))}${certificate.expiry_date ? `<br>Expires ${escape(displayDate(certificate.expiry_date))}` : '<br>No expiry listed'}</p>${status.expired && certificate.status !== 'Verified' ? `<p>Review status: ${escape(certificate.status)}</p>` : ''}${files.length ? `<div class="mentor-evidence-actions">${files.map((file,index) => {
        const direct = !file.mime_type && mentorDriveLink(file.drive_url), label = `Evidence${files.length > 1 ? ` ${index+1}` : ''}`;
        return direct ? `<a class="mentor-evidence-link" href="${escape(direct)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escape(certificate.name)} evidence for ${escape(student.name)} in Google Drive">${icon('download')}${label} · Drive</a>` : `<button type="button" data-mentor-action="download-certificate" data-id="${escape(file.id)}" data-filename="${escape(file.original_name || 'certification-evidence')}" aria-label="Download ${escape(certificate.name)} evidence for ${escape(student.name)}${files.length > 1 ? `, file ${index+1}` : ''}">${icon('download')}${label}</button>`;
      }).join('')}</div>` : '<p class="mentor-fine">No downloadable evidence listed.</p>'}</section>`;
    }).join('') : '<p class="mentor-muted">No certifications on record.</p>'}</article>`).join('') : '<div class="mentor-empty"><h3>No students match</h3><p>Try a different name or certification filter.</p></div>';
  }

  function certificates() {
    return `<div class="mentor-section-heading"><div><p class="mentor-eyebrow">TEAM RECORDS</p><h1>Certifications</h1></div><span class="mentor-muted">${activePeople().length} active students</span></div><div class="mentor-filter-bar"><label class="mentor-search-label">Find a student or certification<input id="mentor-certificate-search" type="search" placeholder="Student name or certificate" value="${escape(certificateQuery)}"></label><label>Status<select id="mentor-certificate-status">${['All','Verified','Pending','Rejected','Expired','None'].map(value => `<option ${certificateFilter === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="mentor-student-grid" data-mentor-certificate-directory>${certificateDirectory()}</div>`;
  }
  function requests() {
    const requests = data.requests.filter(request => requestFilter === 'All' || (requestFilter === 'Open' ? openRequest(request) : !openRequest(request))).sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
    return `<div class="mentor-section-heading"><div><p class="mentor-eyebrow">VOLUNTEER COVERAGE</p><h1>Requests</h1></div><button type="button" data-mentor-action="requests-browse">${icon('calendar')}Choose a session</button></div><p class="mentor-muted">Choose the specific practice or competition date, then request volunteers for that date.</p><div class="mentor-filter-bar"><label>Show<select id="mentor-request-status">${['Open','Closed','All'].map(value => `<option ${requestFilter === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="mentor-request-grid">${requestCards(requests)}</div>`;
  }

  function render() {
    if (destroyed) return;
    root.innerHTML = `<div class="mentor-workspace"><header class="mentor-topbar"><a class="mentor-brand" href="#" data-mentor-action="home"><img src="./avenger-logo.png" alt="Avenger Robotics" width="43" height="43"><span>AVENGER<small>MENTOR WORKSPACE</small></span></a><div class="mentor-account"><span><strong>${escape(data.mentor.name || 'Mentor')}</strong><small>${allSchools() ? 'All competitions' : escape(data.mentor.school_scope || 'School sessions')}${data.mentor.mentorship_access ? ` · ${escape(scopes())}` : ''}</small></span><button type="button" data-mentor-action="signout" aria-label="Sign out">${icon('signout')}<span>Sign out</span></button></div></header>
      <div class="mentor-layout"><nav class="mentor-nav" aria-label="Mentor navigation">${[['competitions','calendar','Sessions'],['certificates','certificate','Certifications'],['requests','people','Requests']].map(([id,symbol,label]) => `<button type="button" data-mentor-action="view" data-view="${id}" aria-pressed="${view === id}">${icon(symbol)}<span>${label}</span></button>`).join('')}<button type="button" data-mentor-action="refresh" class="mentor-refresh">${icon('refresh')}<span>Refresh</span></button><p data-mentor-sync class="mentor-sync"></p></nav>
      <main class="mentor-content"><div data-mentor-notice class="mentor-notice ${noticeKind === 'error' ? 'is-error' : ''}" role="status" ${!notice ? 'hidden' : ''}>${escape(notice)}</div>${!loaded ? '<div class="mentor-empty"><p>Loading school sessions…</p></div>' : view === 'competitions' ? competitions() : view === 'certificates' ? certificates() : requests()}</main></div></div>`;
    if (editor !== null) updateHoursCalculation(root.querySelector('#mentor-event-form'));
    syncStatus(); setBusy(busy);
  }

  async function update(options={}) {
    if (destroyed || refreshing || busy) return false;
    if (hasDraft() || fieldFocused()) {
      if (!options.silent) announce('Your open form is preserved. Save or cancel it before refreshing.', 'error');
      return false;
    }
    refreshing = true; syncStatus();
    try {
      const next = normalize(options.data || await repo.loadMentor());
      let nextRevision;
      if (typeof repo.scheduleRevision === 'function') { try { nextRevision = await repo.scheduleRevision(); } catch {} }
      if (destroyed || hasDraft() || fieldFocused()) return false;
      data = next; loaded = true; loadedAt = new Date(); revision = nextRevision;
      if (!data.events.some(event => event.id === selectedId)) selectedId = '';
      if (type === 'Competition' && !canCompetition() || type === 'Mentorship' && !data.mentor.mentorship_access) type = 'All';
      if (data.mentor.school_scope && !allSchools()) school = data.mentor.school_scope;
      render(); return true;
    } catch (error) { if (!destroyed) announce(error.message || 'The mentor workspace could not be refreshed.', 'error'); if (options.throwOnError) throw error; return false; }
    finally { refreshing = false; if (!destroyed) syncStatus(); }
  }

  async function mutate(work, message, after) {
    if (busy || destroyed) return;
    setBusy(true); announce('');
    try {
      const result = await work(); if (destroyed) return;
      after?.(result); dirty = false;
      try { data = normalize(await repo.loadMentor()); loadedAt = new Date(); notice = message; noticeKind = 'success'; }
      catch { notice = `${message} The latest records could not be reloaded. Use Refresh to check them.`; noticeKind = 'error'; }
      if (destroyed) return;
      render();
    } catch (error) { if (!destroyed) announce(error.message || 'This change could not be saved. Your entries are still here.', 'error'); }
    finally { if (!destroyed) { setBusy(false); syncStatus(); } }
  }

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-mentor-action]');
    if (!button || !root.contains(button) || busy) return;
    event.preventDefault(); const action = button.dataset.mentorAction;
    if (action === 'cancel-editor') { editor = null; dirty = false; render(); return; }
    if (action === 'cancel-request') { requestFor = ''; dirty = false; render(); return; }
    if (action === 'download-certificate') {
      setBusy(true);
      try { const form = new FormData(); form.set('action','download'); form.set('attachment',button.dataset.id); const file = await repo.evidence(form); if (!(file instanceof Blob)) throw new Error('Certificate evidence could not be downloaded.'); if (destroyed) return; const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = button.dataset.filename || 'certification-evidence'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
      catch (error) { if (!destroyed) announce(error.message,'error'); }
      finally { if (!destroyed) setBusy(false); }
      return;
    }
    if (action === 'refresh') { await update(); return; }
    if (action === 'close-request') { if (guardDraft()) return; await mutate(() => repo.closeVolunteerRequest(button.dataset.id),'Volunteer request closed.'); return; }
    if (action === 'select-event' && button.dataset.id === selectedId) { root.querySelector('[data-mentor-roster]')?.scrollIntoView({block:'start',behavior:'smooth'}); return; }
    if (guardDraft()) return;
    if (action === 'signout') { await onSignOut?.(); return; }
    if (action === 'view') { view = button.dataset.view; notice = ''; render(); return; }
    if (action === 'home' || action === 'requests-browse') { view = 'competitions'; notice = ''; render(); return; }
    if (action === 'new-event') { if (!canCompetition()) { announce('Competition editing is not enabled for this mentor account.','error'); return; } view = 'competitions'; editor = {}; render(); root.querySelector('.mentor-competition-editor')?.scrollIntoView({block:'start'}); root.querySelector('#mentor-event-form [name=name]')?.focus({preventScroll:true}); return; }
    if (action === 'edit-event') { const event = data.events.find(row => row.id === button.dataset.id); if (!canEdit(event)) { announce('Practice dates are managed in the team schedule. You can request volunteers for a scheduled date.','error'); return; } view = 'competitions'; editor = {...event}; render(); root.querySelector('.mentor-competition-editor')?.scrollIntoView({block:'start'}); root.querySelector('#mentor-event-form [name=name]')?.focus({preventScroll:true}); return; }
    if (action === 'open-request') { const event = data.events.find(row => row.id === button.dataset.id); if (!event) return; selectedId = event.id; requestFor = event.id; render(); root.querySelector('#mentor-request-form')?.scrollIntoView({block:'start'}); root.querySelector('#mentor-request-form [name=count]')?.focus({preventScroll:true}); return; }
    if (action === 'select-event') { selectedId = button.dataset.id; rosterQuery = ''; render(); root.querySelector('[data-mentor-roster]')?.scrollIntoView({block:'start',behavior:'smooth'}); }
  },{signal});

  root.addEventListener('input', event => {
    const field = event.target;
    if (field.closest('[data-mentor-edit-form]')) { dirty = true; syncStatus(); }
    if (field.closest('#mentor-event-form')) {
      const form = field.form;
      if (['hours','start_time','end_time'].includes(field.name)) updateHoursCalculation(form,field.name === 'hours');
      if (field.name === 'date') form.querySelector('[data-mentor-weekday]').textContent = displayDate(field.value);
    }
    if (field.id === 'mentor-event-search') { query = field.value; root.querySelector('[data-mentor-event-grid]').innerHTML = competitionCards(); const count = filteredEvents().length; root.querySelector('[data-mentor-event-count]').textContent = `${count} session${count === 1 ? '' : 's'}`; }
    if (field.id === 'mentor-certificate-search') { certificateQuery = field.value; root.querySelector('[data-mentor-certificate-directory]').innerHTML = certificateDirectory(); }
    if (field.id === 'mentor-roster-search') { rosterQuery = field.value; const event = selected(); if (event) root.querySelector('[data-mentor-roster-rows]').innerHTML = rosterRows(event); }
  },{signal});

  root.addEventListener('change', event => {
    const field = event.target;
    if (field.closest('[data-mentor-edit-form]')) { dirty = true; syncStatus(); }
    if (field.name === 'auto_hours') updateHoursCalculation(field.form);
    const filters = ['mentor-period','mentor-type','mentor-school','mentor-sort','mentor-certificate-status','mentor-request-status'];
    if (!filters.includes(field.id)) return;
    if (hasDraft()) { announce('Save or cancel your open form before changing this view.', 'error'); if (field.id === 'mentor-period') field.value = period; if (field.id === 'mentor-type') field.value = type; if (field.id === 'mentor-school') field.value = school; if (field.id === 'mentor-sort') field.value = sort; return; }
    if (field.id === 'mentor-period') { period = field.value; selectedId = ''; }
    if (field.id === 'mentor-type') { type = field.value; selectedId = ''; }
    if (field.id === 'mentor-school') { school = field.value; selectedId = ''; }
    if (field.id === 'mentor-sort') sort = field.value;
    if (field.id === 'mentor-certificate-status') certificateFilter = field.value;
    if (field.id === 'mentor-request-status') requestFilter = field.value;
    render();
  },{signal});

  root.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-mentor-edit-form]')) return;
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    const values = new FormData(form);
    if (form.id === 'mentor-request-form') {
      const count = Number(values.get('count')), hasRoles = eventRoles(form.dataset.session).length > 0, role = hasRoles ? String(values.get('role') || '').trim() : '';
      if (!Number.isInteger(count) || count < 1 || count > 100 || hasRoles && !role) { announce('Enter 1–100 volunteers and choose a role.', 'error'); return; }
      const event = data.events.find(row => row.id === form.dataset.session);
      if (!event) { announce('Choose an available session date before requesting volunteers.','error'); return; }
      await mutate(() => repo.requestVolunteers(event.id,count,role,String(values.get('note') || '').trim()),`Volunteer request posted for ${displayDate(event.date)}.`,() => { requestFor = ''; });
    } else if (form.id === 'mentor-event-form') {
      if (!canCompetition() || form.dataset.id && !canEdit(data.events.find(event => event.id === form.dataset.id))) { announce('Competition editing is not enabled for this session.','error'); return; }
      updateHoursCalculation(form);
      if (!form.reportValidity()) return;
      try {
        const current = new FormData(form), payload = {
          name:String(current.get('name') || '').trim(), category:'Competition', competition_school:data.mentor.school_scope || String(current.get('competition_school')),
          date:String(current.get('date')), start_time:String(current.get('start_time')), end_time:String(current.get('end_time')),
          hours:Number(current.get('hours')), location:String(current.get('location') || '').trim(), description:String(current.get('description') || '').trim(),
          capacity:Number(current.get('capacity')), active:form.dataset.id ? current.get('active') === 'true' : true, roles:parseMentorRoles(current.get('roles')),
        };
        await mutate(() => repo.saveMentorEvent(form.dataset.id || null,payload),form.dataset.id ? 'Competition updated.' : 'Competition published to the student app.',id => { selectedId = id || form.dataset.id || selectedId; editor = null; period = 'All'; });
      } catch (error) { announce(error.message,'error'); }
    }
  },{signal});

  const timer = setInterval(async () => {
    if (destroyed || busy || refreshing || document.hidden || hasDraft() || fieldFocused()) return;
    if (typeof repo.scheduleRevision !== 'function') { await update({silent:true}); return; }
    try { const next = await repo.scheduleRevision(); if (destroyed) return; const priorityBoundaryChanged=data.requests.some(request=>Boolean(request.is_priority)!==isPriorityRequest({...request,is_priority:true})); if (revision === undefined) revision = next; if (priorityBoundaryChanged || JSON.stringify(next) !== JSON.stringify(revision)) await update({silent:true}); }
    catch { /* Explicit refresh surfaces network errors; background checks preserve the current view. */ }
  },15000);

  render();
  const ready = initialData ? (async () => { loadedAt = new Date(); if (data.mentor.school_scope && !allSchools()) school = data.mentor.school_scope; if (repo.scheduleRevision) { try { revision = await repo.scheduleRevision(); } catch {} } syncStatus(); return true; })() : update({silent:true,throwOnError:true});
  return {ready,update,destroy() { destroyed = true; controller.abort(); clearInterval(timer); root.classList.remove('mentor-host'); root.removeAttribute('aria-busy'); }};
}
