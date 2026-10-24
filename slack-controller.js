// Browser orchestration only. Workspace credentials stay in the Edge function.
export function createSlackWorkspace({request,render,identity}) {
  const initial=()=>({status:null,directory:null,preview:null,result:null,sessionId:'',loading:false,error:'',notice:'',mappingSearch:'',mappingOpen:false});
  let state=initial(),version=0;
  const actor=()=>identity?.()||null;
  async function run(label,operation) {
    if(state.loading||!actor())return;
    const ticket=++version,owner=actor();
    const current=()=>ticket===version&&owner===actor()&&!!owner;
    state.loading=label;state.error='';state.notice='';render();
    try {await operation(current);}
    catch(error){if(current())state.error=error?.message||'Slack could not be loaded. Try again.';}
    finally {if(current()){state.loading=false;render();}}
  }
  return {
    get state(){return state;},
    reset(){version++;state=initial();},
    invalidatePreviews(){version++;state.preview=null;state.loading=false;},
    select(sessionId){version++;state.sessionId=sessionId;state.preview=null;state.result=null;state.error='';state.notice='';state.loading=false;render();},
    search(value){state.mappingSearch=value;},
    mappingOpen(value){state.mappingOpen=Boolean(value);},
    async load(){return run('Loading Slack',async current=>{
      state.preview=null;
      const status=await request({action:'status'});if(!current())return;state.status=status;
      if(status.connected){const directory=await request({action:'directory'});if(current())state.directory=directory;}
      else {state.directory=null;state.preview=null;}
    });},
    async directory(){return run('Loading members',async current=>{
      const directory=await request({action:'directory'});if(current()){state.directory=directory;state.preview=null;}
    });},
    async preview(sessionId){return run('Checking roster',async current=>{
      state.sessionId=sessionId;state.preview=null;state.result=null;
      const preview=await request({action:'preview',session_id:sessionId});if(current()&&state.sessionId===sessionId)state.preview=preview;
    });},
    async map(personId,slackUserId){return run('Saving member',async current=>{
      state.mappingOpen=true;
      await request({action:'map_person',person_id:personId,slack_user_id:slackUserId||null});if(!current())return;
      state.preview=null;state.result=null;
      const directory=await request({action:'directory'});if(current()){state.directory=directory;state.notice='Slack member saved.';}
    });},
    async sync(sessionId,previewHash){
      const preview=state.preview;
      if(!preview?.can_sync||!preview.connected||!state.status?.connected||preview.event?.id!==sessionId||preview.preview_hash!==previewHash)return;
      return run('Updating private channel',async current=>{
        const result=await request({action:'sync',session_id:sessionId,preview_hash:previewHash,request_id:crypto.randomUUID()});
        if(!current())return;state.result=result;state.preview=null;
        state.notice=result.ok&&!result.partial&&!result.needs_review&&!result.errors?.length?'Event sent to Slack.':result.needs_review?'Review the channel before retrying.':'Some changes need attention.';
      });
    },
  };
}
