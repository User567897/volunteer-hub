const SETUP_PERSON = '47f07024-5ea3-4a35-a7ef-806cf748a3bf';
const SETUP_SESSION = '30000000-0000-4000-8000-000000000002';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLACK_MEMBER = /^[UW][A-Z0-9]+$/;
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
const asList = value => Array.isArray(value) ? value : [];
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function messageDraft(value) {
  // Recognize only the backend's literal leading mention before decoding fields.
  const text = String(value ?? '').replace(/^<!channel>/,'@channel');
  const decoded = text.replace(/&(lt|gt|amp);/g, (_, entity) => ({lt:'<',gt:'>',amp:'&'}[entity]));
  return decoded;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function dateLabel(value) {
  return validDate(value) ? new Intl.DateTimeFormat('en-US', {weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)) : 'Date TBD';
}

function timeLabel(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

function sessionTime(event) {
  const start = timeLabel(event.start_time), end = timeLabel(event.end_time);
  return start && end ? `${start} – ${end}` : start ? `Starts ${start}` : end ? `Ends ${end}` : 'Time TBD';
}

function stateLabel(value) {
  return String(value || 'Not created').replace(/[_-]+/g, ' ').replace(/^\w/, character => character.toUpperCase());
}

export function slackChannelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com')) ? url.href : '';
  } catch { return ''; }
}

/** Upcoming events with current signups, across every category. No Slack writes. */
export function selectSlackEvents(adminRecords = {}, {date = today(), now = new Date(), eligiblePersonIds} = {}) {
  const eligible = Array.isArray(eligiblePersonIds) ? new Set(eligiblePersonIds) : null;
  const people = new Map(asList(adminRecords.people).filter(person => person.id !== SETUP_PERSON && UUID.test(person.id || '') && person.active === true && (!eligible || eligible.has(person.id))).map(person => [person.id, person]));
  const rosters = new Map();
  for (const signup of asList(adminRecords.signups)) {
    if (normalized(signup.status) === 'cancelled' || !people.has(signup.person_id)) continue;
    if (!rosters.has(signup.session_id)) rosters.set(signup.session_id, new Map());
    const roster = rosters.get(signup.session_id), prior = roster.get(signup.person_id);
    const roles = [...new Set([...(prior?.roles || []), String(signup.role || '').trim()].filter(Boolean))].sort();
    roster.set(signup.person_id, {...people.get(signup.person_id), roles, role:roles.join(' · ')});
  }
  const instant = new Date(now);
  const clock = Number.isNaN(instant.getTime()) ? null : Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(part => [part.type,part.value]));
  const seconds = value => {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value || '');
    return !match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59 ? null : Number(match[1])*3600+Number(match[2])*60+Number(match[3] || 0);
  };
  const currentDate = clock && `${clock.year}-${clock.month}-${clock.day}`;
  return asList(adminRecords.events).filter(event => event.id !== SETUP_SESSION && UUID.test(event.id || '') && validDate(event.date) && event.active !== false && event.date >= date && rosters.get(event.id)?.size)
    .filter(event => {
      if (event.date !== date || currentDate !== date) return true;
      const start = seconds(event.start_time), end = seconds(event.end_time);
      return end === null || (start !== null && end <= start) || end > Number(clock.hour)*3600+Number(clock.minute)*60+Number(clock.second);
    })
    .map(event => ({...event,roster:[...rosters.get(event.id).values()].sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')) || a.id.localeCompare(b.id)),signup_count:rosters.get(event.id).size}))
    .sort((a,b) => a.date.localeCompare(b.date) || (seconds(a.start_time) ?? Infinity)-(seconds(b.start_time) ?? Infinity) || String(a.name || '').localeCompare(String(b.name || '')) || a.id.localeCompare(b.id));
}

function directoryMembers(directory) {
  return asList(directory?.members).filter(member => SLACK_MEMBER.test(member.id || '') && member.id !== 'USLACKBOT' && member.deleted !== true && member.is_bot !== true && member.is_app_user !== true)
    .slice().sort((a, b) => String(a.display_name || a.name || a.id).localeCompare(String(b.display_name || b.name || b.id)));
}

function personLabel(item, adminRecords, directory) {
  const id = typeof item === 'string' ? item : item?.slack_user_id || item?.id;
  const member = asList(directory?.members).find(candidate => candidate.id === id);
  if (typeof item === 'string') return adminRecords.people?.find(person => person.id === item)?.name || member?.display_name || member?.name || item;
  return item?.name || item?.display_name || adminRecords.people?.find(person => person.id === item?.person_id)?.name || member?.display_name || member?.name || item?.person_id || id || 'Unknown member';
}

function memberList(title, items, adminRecords, directory) {
  const list = asList(items);
  return `<div><h4>${esc(title)} (${list.length})</h4>${list.length ? `<ul>${list.map(item => `<li>${esc(personLabel(item, adminRecords, directory))}${item?.role ? ` · ${esc(item.role)}` : ''}${item?.reason ? ` · ${esc(item.reason)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">None</p>'}</div>`;
}

function channelLink(value, label = 'Open private channel') {
  const url = slackChannelUrl(value);
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
}

function syncErrorLabel(error, adminRecords, directory) {
  if (typeof error === 'string') return error;
  const detail = [error?.message,error?.error,error?.reason,error?.code].find(value => typeof value === 'string') || 'Operation needs review';
  const operation = error?.action || error?.operation || error?.step;
  const id = error?.slack_user_id || error?.user_id || error?.person_id;
  return [typeof operation === 'string' ? stateLabel(operation) : '',id ? personLabel(id,adminRecords,directory) : '',detail].filter(Boolean).join(' · ');
}

function syncResult(result, adminRecords, directory) {
  if (!result) return '';
  const partial = result.partial === true || result.needs_review === true || asList(result.errors).length > 0;
  const heading = result.connected === false ? 'Slack not connected' : result.ok === true ? partial ? 'Sync needs review' : 'Event sent to Slack' : 'Send did not complete';
  return `<section class="notice" role="status"><h4>${heading}</h4>${result.channel?.name ? `<p>#${esc(result.channel.name)} ${channelLink(result.channel.url)}</p>` : ''}${result.ok === true || result.partial ? `<p>${asList(result.invited).length} invited · ${asList(result.removed).length} removed</p>` : ''}${asList(result.errors).length ? `<ul>${result.errors.map(error => `<li>${esc(syncErrorLabel(error,adminRecords,directory))}</li>`).join('')}</ul>` : ''}${result.error ? `<p class="error">${esc(result.error)}</p>` : ''}${result.reason ? `<p>${esc(result.reason)}</p>` : ''}${Number(result.retry_after) > 0 ? `<p>Try again after ${Math.ceil(Number(result.retry_after))} seconds.</p>` : ''}</section>`;
}

function syncedLabel(value) {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? '' : new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(instant);
}

function mappingPanel(adminRecords, state, connected, busy) {
  const directory = state.directory, loaded = directory?.connected === true;
  const members = directoryMembers(directory), memberIds = new Set(members.map(member => member.id));
  const mappings = new Map(asList(directory?.mappings).map(mapping => [mapping.person_id, mapping]));
  const query = normalized(state.mappingSearch);
  const people = asList(adminRecords.people).filter(person => person.id !== SETUP_PERSON && UUID.test(person.id || ''))
    .filter(person => !loaded || mappings.has(person.id))
    .filter(person => person.active !== false || mappings.get(person.id)?.slack_user_id)
    .slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || a.id.localeCompare(b.id));
  const matches = person => !query || normalized(`${person.name || ''} ${person.grade || ''}`).includes(query);
  return `<details id="slack-member-mapping" ${state.mappingOpen ? 'open' : ''}><summary>Match students to Slack members</summary><p>Choose each student’s actual workspace account. Names are never matched automatically.</p><div class="actions"><button type="button" id="slack-directory-refresh" ${!connected || busy ? 'disabled' : ''}>${loaded ? 'Refresh Slack members' : 'Load Slack members'}</button></div>
    ${loaded ? `<form id="slack-mapping-filter" class="form-grid"><label>Find student<input type="search" id="slack-person-search" name="query" value="${esc(state.mappingSearch || '')}" placeholder="Name or grade" autocomplete="off"></label><button type="submit">Find</button></form>
    ${people.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Student</th><th scope="col">Grade</th><th scope="col">Slack member</th></tr></thead><tbody>${people.map(person => {
      const mapping = mappings.get(person.id), current = mapping?.slack_user_id || '', unavailable = current && !memberIds.has(current);
      return `<tr data-slack-person-name="${esc(normalized(`${person.name || ''} ${person.grade || ''}`))}" ${matches(person) ? '' : 'hidden'}><td>${esc(person.name || 'Unnamed student')}${person.active === false ? '<br><small>Inactive account</small>' : ''}</td><td>${esc(person.grade || '—')}</td><td><form class="slack-person-map" data-person="${esc(person.id)}"><label>Slack member for ${esc(person.name || 'student')}<select name="slack_user_id" ${!connected || busy ? 'disabled' : ''}><option value="" ${current ? '' : 'selected'}>Not mapped</option>${unavailable ? `<option value="${esc(current)}" selected>Current mapping unavailable (${esc(current)})</option>` : ''}${members.map(member => `<option value="${esc(member.id)}" ${member.id === current ? 'selected' : ''}>${esc(member.display_name || member.name || member.id)}${member.name && member.display_name && member.name !== member.display_name ? ` (@${esc(member.name)})` : ''}</option>`).join('')}</select></label>${unavailable ? '<p class="muted">Choose a current member or select Not mapped.</p>' : ''}${mapping?.team_id && state.status?.team_id && mapping.team_id !== state.status.team_id ? '<p class="error">This mapping belongs to another workspace.</p>' : ''}<button type="submit" ${!connected || busy ? 'disabled' : ''}>Save mapping</button></form></td></tr>`;
    }).join('')}</tbody></table></div>` : ''}<p id="slack-mapping-empty" ${people.some(matches) ? 'hidden' : ''}>No matching student records.</p>` : `<p>${directory?.connected === false ? esc(directory.reason || 'Slack members could not be loaded.') : 'Load the workspace member list to set mappings.'}</p>`}
  </details>`;
}

/** Pure admin renderer. Selecting an event only previews; sending requires its fresh server hash. */
export function renderSlackPanel(adminRecords = {}, state = {}) {
  const connected = state.status?.connected === true, busy = Boolean(state.loading);
  const events = selectSlackEvents(adminRecords, {date:state.date || today(),now:state.now || new Date(),eligiblePersonIds:state.directory?.connected === true ? asList(state.directory.mappings).map(person => person.person_id) : undefined});
  const selected = events.find(event => event.id === state.sessionId) || events[0];
  const channels = new Map(asList(state.status?.events).map(event => [event.session_id, event]));
  const current = channels.get(selected?.id);
  const preview = selected && state.preview?.event?.id === selected.id ? state.preview : null;
  const hash = typeof preview?.preview_hash === 'string' ? preview.preview_hash.trim() : '';
  const storedDraft = selected && Object.hasOwn(state.drafts || {},selected.id);
  const draft = selected ? storedDraft ? state.drafts[selected.id] : preview?.custom_message ?? messageDraft(preview?.message) : '';
  const hasEditor = Boolean(preview || storedDraft);
  const reviewed = Boolean(preview && state.reviewedDraft?.sessionId === selected?.id && state.reviewedDraft.text === draft && state.reviewedDraft.version === (state.draftVersions?.[selected?.id] || 0));
  const canSync = connected && !busy && reviewed && preview?.connected === true && preview.can_sync === true && Boolean(hash) && Boolean(String(draft).trim());
  const connectionLabel = connected ? 'Slack connected' : state.status ? 'Slack not connected' : busy ? 'Checking Slack connection…' : 'Slack connection not checked';
  return `<section class="slack-admin-panel">
    <div class="section-head"><div><h3>Slack</h3><p><span class="status-chip">${connectionLabel}</span> · Private event channels</p><p>Choose an event, review the message, then send.</p></div><button type="button" id="slack-refresh" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Check connection'}</button></div>
    ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}${state.notice ? `<p class="notice" role="status">${esc(state.notice)}</p>` : ''}${!connected && state.status ? `<p>${esc(state.status.reason || 'Connect the team’s Slack app to send event details.')}</p>` : ''}
    ${syncResult(state.result,adminRecords,state.directory)}
    <div class="slack-event-workspace"><nav class="slack-event-picker" aria-label="Upcoming Slack events"><h4>Upcoming · ${events.length}</h4>
    ${events.length ? `<ol class="slack-event-list">${events.map(event => `<li><button type="button" class="event-choice" data-slack-select="${esc(event.id)}" aria-pressed="${event.id === selected?.id}" ${busy ? 'disabled' : ''}><strong>${esc(event.name)}</strong><span>${esc(dateLabel(event.date))}</span><small>${esc(sessionTime(event))} · ${event.signup_count} signed up</small></button></li>`).join('')}</ol>` : '<p>No upcoming events with signups.</p>'}</nav>
    ${selected ? `<article class="slack-event-detail connected-date" aria-label="Selected Slack event"><div class="section-head"><div><h3>${esc(selected.name)}</h3><p>${esc(dateLabel(selected.date))} · ${esc(sessionTime(selected))} Eastern</p><p>${esc(selected.location || 'Place TBD')}</p><p>Wear Avenger apparel</p></div>${!hasEditor ? `<button type="button" data-slack-preview="${esc(selected.id)}" ${!connected || busy ? 'disabled' : ''}>Review message</button>` : ''}</div>
      <p>Channel: ${current?.channel_name ? `#${esc(current.channel_name)}` : connected ? 'Not created' : 'Not checked'}${current?.state ? ` · ${esc(stateLabel(current.state))}` : ''} ${channelLink(current?.channel_url)}</p>${current?.last_synced_at && syncedLabel(current.last_synced_at) ? `<p class="muted">Last sent: ${esc(syncedLabel(current.last_synced_at))}</p>` : ''}${current?.last_error ? `<p class="error">${esc(current.last_error)}</p>` : ''}
      <details open><summary>Signed up (${selected.signup_count})</summary>${memberList('Volunteers',selected.roster,adminRecords,state.directory)}</details>
      ${hasEditor ? `<section class="notice"><h4>Message${preview?.channel?.name ? ` · #${esc(preview.channel.name)}` : ''}</h4>
      <label>Edit message<textarea id="slack-message-draft" data-session="${esc(selected.id)}" rows="5" maxlength="3000" aria-describedby="slack-draft-status" style="width:100%;resize:vertical" ${state.loading === 'Updating private channel' ? 'disabled' : ''}>${esc(draft)}</textarea></label>
      <p id="slack-draft-status" class="muted" role="status">${reviewed ? canSync ? 'Reviewed. Ready to send.' : 'Message reviewed. Resolve any blockers before sending.' : 'Review changes before sending.'}</p>
      <div class="form-actions"><button type="button" data-slack-preview="${esc(selected.id)}" ${!connected || busy || !String(draft).trim() ? 'disabled' : ''}>Review changes</button><button type="button" class="primary" data-slack-sync="${esc(selected.id)}" ${canSync ? `data-preview-hash="${esc(hash)}"` : 'disabled'}>${preview?.channel?.id || current?.channel_id ? 'Update Slack message' : 'Send to Slack'}</button></div>
      ${preview?.connected === false ? `<p class="error">${esc(preview.reason || 'Slack is not connected.')}</p>` : ''}${asList(preview?.reasons).length ? `<ul>${preview.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}
      ${preview ? `<details><summary>Channel members and changes</summary><p>Signed-up volunteers, you, and the Volunteer Hub bot.</p>${memberList('Invite',preview.invite,adminRecords,state.directory)}${memberList('Remove from channel',preview.remove,adminRecords,state.directory)}${asList(preview.unknown_members).length ? memberList('Other channel members',preview.unknown_members,adminRecords,state.directory) : ''}</details>
      ${asList(preview.missing_mappings).length ? memberList('Students without a Slack mapping',preview.missing_mappings,adminRecords,state.directory) : ''}${asList(preview.invalid_mappings).length ? memberList('Mappings to review',preview.invalid_mappings,adminRecords,state.directory) : ''}` : ''}</section>` : ''}
    </article>` : ''}</div>
    ${mappingPanel(adminRecords,state,connected,busy)}
  </section>`;
}
