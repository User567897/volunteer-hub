function minutes(value) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}

export function durationHours(start, end) {
  const from = minutes(start), to = minutes(end);
  if (from === null || to === null || to <= from) return null;
  return Math.round((to - from) / 60 * 100) / 100;
}

export function followsDuration(event) {
  const calculated = durationHours(event.start_time, event.end_time);
  return !event.id || calculated === null || Math.abs(Number(event.hours) - calculated) < 0.005;
}

export function updateHoursCalculation(form, manualInput = false) {
  const automatic = form.elements.auto_hours;
  if (!automatic) return;
  if (manualInput) automatic.checked = false;
  const start = form.elements.start_time.value, end = form.elements.end_time.value;
  const calculated = durationHours(start, end);
  form.elements.end_time.setCustomValidity(start && end && calculated === null ? 'End time must be after start time.' : '');
  if (automatic.checked && calculated !== null) form.elements.hours.value = String(calculated);
  const hint = form.querySelector('[data-hours-hint]');
  if (hint) hint.textContent = !automatic.checked ? 'Custom hours. Turn on automatic calculation to use the event times.' : calculated === null ? 'Set both times to calculate hours.' : `${calculated} hours from the event times. You can enter a different amount.`;
}
