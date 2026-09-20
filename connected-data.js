// Browser-safe settings. No database passwords or service-role keys belong here.
export const connection={url:'https://pzshxdujegdnsahvpriv.supabase.co',publishableKey:'sb_publishable_ovEZni1bIGFVLF63g9K_Lw_JaMHnDAl'};
// Exact setup fixtures, never name-based filtering of student records.
const setupPerson='47f07024-5ea3-4a35-a7ef-806cf748a3bf';
const setupSession='30000000-0000-4000-8000-000000000002';
function visibleRecord(table,row){
 if(table==='hub_people'&&row.id===setupPerson)return false;
 if(table==='hub_sessions'&&row.id===setupSession)return false;
 return row.person_id!==setupPerson&&row.session_id!==setupSession;
}
export function createRepository(client){
 async function rows(table,query=x=>x){const result=await query(client.from(table).select('*'));if(result.error)throw result.error;return (result.data||[]).filter(row=>visibleRecord(table,row));}
 return {
  async load(){
   const {data,error}=await client.auth.getUser();if(error)throw error;if(!data.user)throw Error('Sign in to continue.');
   const profileResult=await client.rpc('hub_my_profile');if(profileResult.error)throw profileResult.error;
   const members=profileResult.data||[];
   const profile=members[0];if(!profile?.active)throw Error('Your account is not linked to an active team member yet. Ask the team administrator to connect it.');
   const [events,roles,signups,hours,certificates,attachments]=await Promise.all([
    rows('hub_sessions',q=>q.order('date',{ascending:true})),rows('hub_session_roles'),
    rows('hub_signups',q=>q.eq('person_id',profile.id)),rows('hub_hours',q=>q.eq('person_id',profile.id).order('date',{ascending:false})),rows('hub_certifications',q=>q.eq('person_id',profile.id)),rows('hub_attachments',q=>q.eq('person_id',profile.id))]);
   const available=await client.rpc('hub_availability');if(available.error)throw available.error;
   const status=await client.rpc('hub_admin_status');if(status.error)throw status.error;
   return {isAdmin:status.data===true,profile,events:events.map(e=>({...e,signed_count:available.data.find(a=>a.session_id===e.id)?.signed_count||0,roles:roles.filter(r=>r.session_id===e.id).map(r=>({...r,taken:available.data.find(a=>a.session_id===e.id)?.role_counts?.[r.name]||0}))})),signups,hours,certificates,attachments};
  },
  async evidence(form){const {data,error}=await client.functions.invoke('drive-evidence',{body:form});if(error){let message='Upload failed. Please try again.';try{const detail=await error.context.json();message=detail.error||message;}catch{}throw Error(message);}return data;},
  async saveProfile(name,grade){const {error}=await client.rpc('hub_save_profile',{p_name:name,p_grade:grade});if(error)throw error;},
  async loadAdmin(){const {data,error}=await client.rpc('hub_admin_status');if(error)throw error;if(!data)throw Error('This account does not have admin access.');const [people,events,signups,hours,certificates,attachments,programs,roles,rules]=await Promise.all([rows('hub_people'),rows('hub_sessions',q=>q.order('date')),rows('hub_signups'),rows('hub_hours',q=>q.order('submitted_at',{ascending:false})),rows('hub_certifications'),rows('hub_attachments'),rows('hub_programs'),rows('hub_session_roles'),rows('hub_assignment_rules')]);return {people,events,signups,hours,certificates,attachments,programs,roles,rules};},
  async reviewHours(id,status,hours,note){const {error}=await client.rpc('hub_review_hours',{p_id:id,p_status:status,p_hours:hours,p_note:note});if(error)throw error;},
  async reviewCertificate(id,status,note){const {error}=await client.rpc('hub_review_certificate',{p_id:id,p_status:status,p_note:note});if(error)throw error;},
  async saveEvent(id,payload){const {data,error}=await client.rpc('hub_save_session',{p_id:id||null,p_data:payload});if(error)throw error;return data;},
  async saveProgram(id,payload){const {data,error}=await client.rpc('hub_save_program',{p_id:id||null,p_data:payload});if(error)throw error;return data;},
  async assign(session,person,role,remove=false){const {error}=await client.rpc('hub_assign',{p_session:session,p_person:person,p_role:role,p_remove:remove});if(error)throw error;},
  async saveRule(payload){const {error}=await client.from('hub_assignment_rules').insert(payload);if(error)throw error;},
  async disableRule(id){const {error}=await client.from('hub_assignment_rules').update({active:false}).eq('id',id);if(error)throw error;},
  async generateAssignments(program){const {data,error}=await client.rpc('hub_generate_assignments',{p_program:program});if(error)throw error;return data;},
  async attendance(payload,people){const {data,error}=await client.rpc('hub_past_attendance',{p_data:payload,p_people:people});if(error)throw error;return data;},
  async setEventActive(id,active){const {data,error}=await client.from('hub_sessions').update({active}).eq('id',id).select('id');if(error)throw error;if(!data.length)throw Error('Event could not be updated');},
  async signup(sessionId,role){const {error}=await client.rpc('hub_signup',{p_session:sessionId,p_role:role||null});if(error)throw error;},
  async cancel(sessionId){const {error}=await client.rpc('hub_cancel_signup',{p_session:sessionId});if(error)throw error;}
 };
}
