// Browser orchestration only. Workspace credentials stay in the Edge function.
export function createSlackWorkspace({request,render,identity}) {
  const initial=()=>({status:null,directory:null,preview:null,result:null,sessionId:'',loading:false,error:'',notice:'',mappingSearch:'',mappingOpen:false,drafts:Object.create(null),editedDrafts:Object.create(null),draftVersions:Object.create(null),reviewedDraft:null});
  let state=initial(),version=0;
  const actor=()=>identity?.()||null;
  const draftVersion=sessionId=>state.draftVersions[sessionId]||0;
  const reviewed=(sessionId,previewHash)=>state.preview?.can_sync&&state.preview.connected&&state.status?.connected&&state.preview.event?.id===sessionId&&state.preview.preview_hash===previewHash&&state.reviewedDraft?.sessionId===sessionId&&state.reviewedDraft.version===draftVersion(sessionId)&&state.reviewedDraft.text===state.drafts[sessionId];
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
    invalidatePreviews(){version++;state.preview=null;state.reviewedDraft=null;state.loading=false;},
    select(sessionId){version++;state.sessionId=sessionId;state.preview=null;state.reviewedDraft=null;state.result=null;state.error='';state.notice='';state.loading=false;render();},
    editDraft(sessionId,value){
      if(!actor()||state.sessionId!==sessionId||state.loading==='Updating private channel')return false;
      const text=String(value??'');if(state.drafts[sessionId]===text)return false;
      state.drafts[sessionId]=text;state.editedDrafts[sessionId]=true;state.draftVersions[sessionId]=draftVersion(sessionId)+1;
      state.reviewedDraft=null;state.result=null;state.notice='';return true;
    },
    search(value){state.mappingSearch=value;},
    mappingOpen(value){state.mappingOpen=Boolean(value);},
    async load(){return run('Loading Slack',async current=>{
      state.preview=null;state.reviewedDraft=null;
      const status=await request({action:'status'});if(!current())return;state.status=status;
      if(status.connected){const directory=await request({action:'directory'});if(current())state.directory=directory;}
      else {state.directory=null;state.preview=null;}
    });},
    async directory(){return run('Loading members',async current=>{
      const directory=await request({action:'directory'});if(current()){state.directory=directory;state.preview=null;state.reviewedDraft=null;}
    });},
    async preview(sessionId){
      const currentDraftVersion=draftVersion(sessionId),customMessage=state.editedDrafts[sessionId]?state.drafts[sessionId]:undefined;
      return run('Reviewing message',async current=>{
        state.sessionId=sessionId;state.preview=null;state.reviewedDraft=null;state.result=null;
        const preview=await request({action:'preview',session_id:sessionId,...(customMessage!==undefined?{custom_message:customMessage}:{})});
        if(!current()||state.sessionId!==sessionId||draftVersion(sessionId)!==currentDraftVersion)return;
        state.preview=preview;
        const text=typeof preview.custom_message==='string'?preview.custom_message:state.drafts[sessionId]??'';
        state.drafts[sessionId]=text;
        state.reviewedDraft={sessionId,text,version:currentDraftVersion,...(customMessage!==undefined?{customMessage}:{})};
      });
    },
    async map(personId,slackUserId){return run('Saving member',async current=>{
      state.mappingOpen=true;
      await request({action:'map_person',person_id:personId,slack_user_id:slackUserId||null});if(!current())return;
      state.preview=null;state.reviewedDraft=null;state.result=null;
      const directory=await request({action:'directory'});if(current()){state.directory=directory;state.notice='Slack member saved.';}
    });},
    async sync(sessionId,previewHash){
      if(!reviewed(sessionId,previewHash))return;
      const customMessage=state.reviewedDraft.customMessage;
      return run('Updating private channel',async current=>{
        state.reviewedDraft=null;
        const result=await request({action:'sync',session_id:sessionId,preview_hash:previewHash,request_id:crypto.randomUUID(),...(customMessage!==undefined?{custom_message:customMessage}:{})});
        if(!current())return;state.result=result;state.preview=null;
        const success=result.ok&&!result.partial&&!result.needs_review&&!result.errors?.length;
        if(success)delete state.editedDrafts[sessionId];
        state.notice=success?'Event sent to Slack.':result.needs_review?'Review the channel before retrying.':'Some changes need attention.';
      });
    },
  };
}
