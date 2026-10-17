import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {open} from "@tauri-apps/plugin-dialog";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {api,message} from "./api";
import {Autosave} from "./autosave";
import type {Channel,Script,Reference,Version} from "./types";
import {wordCount,estimatedDuration,shortTime} from "./types";

type Fields=Pick<Script,"title"|"concept"|"hook"|"takeaway"|"script_text"|"notes"|"status">;
type Revision={id:string;title:string;script_text:string;created_at:number};
const scriptFields=(x:Script):Fields=>({title:x.title,concept:x.concept,hook:x.hook,
  takeaway:x.takeaway,script_text:x.script_text,notes:x.notes,status:x.status});
const button="button";
function ScriptEditor({script,channel,flushRef,onSaved,onUpload,onAttach,attachments,onRefresh,onError}:{
 script:Script;channel:Channel;flushRef:React.MutableRefObject<()=>Promise<void>>;
 onSaved:(draft:Fields,version:number)=>void;
 onUpload:()=>Promise<void>;onAttach:()=>Promise<void>;attachments:Reference[];
 onRefresh:()=>Promise<void>;onError:(v:string)=>void;
}){
 const [draft,setDraft]=useState<Fields>(()=>scriptFields(script));
 const [saveStatus,setSaveStatus]=useState<"pending"|"saving"|"saved"|"error">("saved");
 const [thumbnail,setThumbnail]=useState<string|null>(null);
 const [history,setHistory]=useState<Revision[]|null>(null);
 const [preview,setPreview]=useState(false);
 const saved=useRef<Autosave<Fields>|null>(null);
 const onSavedRef=useRef(onSaved);onSavedRef.current=onSaved;
 if(!saved.current){
  saved.current=new Autosave<Fields>(script.version,async (v,version)=>{
    const data=await api<Version>("save_script",{id:script.id,version,...v});
    onSavedRef.current(v,data.version);
    return data;
  },setSaveStatus);
 }
 const flush=useCallback(()=>saved.current!.flush(),[]);
 useEffect(()=>{
  flushRef.current=flush;
  return()=>{void flush().catch(e=>onError(message(e)))};
 },[flush,flushRef,onError]);
 useEffect(()=>{
  let live=true;
  void api<{data_url:string|null}>("thumbnail",{script_id:script.id})
   .then(v=>{if(live)setThumbnail(v.data_url)})
   .catch(e=>{if(live)onError(message(e))});
  return()=>{live=false};
 },[script.id,script.thumbnail_file,onError]);
 const change=(patch:Partial<Fields>)=>{
  const next={...draft,...patch};
  setDraft(next);saved.current!.enqueue(next);
 };
 const duration=shortTime(estimatedDuration(draft.script_text));
 const words=wordCount(draft.script_text);
 const saveNow=async()=>{try{await flush()}catch(e){onError(message(e))}};
 async function openHistory(){
  try{await flush();setHistory(await api<Revision[]>("script_revisions",{script_id:script.id}))}
  catch(e){onError(message(e))}
 }
 function restore(rev:Revision){
  if(!window.confirm("Restore this previous script text as the newest draft? Current text is not automatically deleted."))return;
  change({title:rev.title,script_text:rev.script_text});
  setHistory(null);
 }
 return <div className="script-editor">
  <header className="editor-header">
   <div><div className="eyebrow">{channel.name.toUpperCase()} <span className="dot">◆</span> SCRIPT EDITOR</div>
    <h1>Write your script<span className="period">.</span></h1>
    <p>Build the argument. Shape the narration. Let the thumbnail clarify the idea.</p></div>
   <div className="editor-actions">
    <span className={"save-status "+saveStatus} role="status">
     {saveStatus==="saved"?"● Saved locally":saveStatus==="saving"?"Saving…":saveStatus==="pending"?"Unsaved changes":"Save failed"}
    </span>
    <button className="secondary" onClick={()=>void openHistory()}>History</button>
    <button className="secondary" onClick={()=>setPreview(v=>!v)}>{preview?"Edit":"Read script"}</button>
    <button className="primary" onClick={()=>void saveNow()}>Save now</button>
   </div>
  </header>
  <div className="script-content">
   <section className="manuscript">
    <div className="manuscript-topline"><span>01 / THE SCRIPT</span><span>{words.toLocaleString()} WORDS &nbsp; · &nbsp; ~{duration} READ</span></div>
    <label className="title-label" htmlFor="script-title">Video title</label>
    <input id="script-title" className="video-title-input" value={draft.title}
     onChange={e=>change({title:e.target.value})} placeholder="What is your video called?"/>
    {preview?<div className="reading-copy">{draft.script_text||"Your narration will appear here when you start writing."}</div>:
     <textarea aria-label="Script narration" className="script-textarea" spellCheck value={draft.script_text}
      onChange={e=>change({script_text:e.target.value})}
      placeholder={"The opening line of your story…\n\nWhat is your argument? What does the viewer need to understand?\n\nStart writing here."}/>}
    <footer className="manuscript-footer">
      <span>LOCAL DRAFT · NOT PUBLISHED</span>
      <button onClick={()=>void navigator.clipboard.writeText(draft.script_text)
          .catch(e=>onError(message(e)))}>Copy narration <span>↗</span></button>
    </footer>
   </section>
   <aside className="writing-context">
    <section className="context-section first">
     <div className="context-heading"><span>02 / THE CONCEPT</span><span>◈</span></div>
     <label htmlFor="script-concept">Central idea &amp; direction</label>
     <textarea id="script-concept" rows={3} value={draft.concept}
      onChange={e=>change({concept:e.target.value})} placeholder="What's the video really about?"/>
     <label htmlFor="script-hook">Opening hook</label>
     <textarea id="script-hook" rows={2} value={draft.hook}
      onChange={e=>change({hook:e.target.value})} placeholder="The question or opening thought…"/>
     <label htmlFor="script-takeaway">Viewer takeaway</label>
     <textarea id="script-takeaway" rows={2} value={draft.takeaway}
      onChange={e=>change({takeaway:e.target.value})} placeholder="What should viewers understand afterward?"/>
     <label htmlFor="script-status">Writing status</label>
     <select id="script-status" value={draft.status} onChange={e=>change({status:e.target.value as Fields["status"]})}>
      {["Draft","Writing","Review","Ready"].map(x=><option key={x}>{x}</option>)}
     </select>
    </section>
    <section className="context-section">
     <div className="context-heading"><span>03 / THE THUMBNAIL</span><span>▧</span></div>
     <div className="thumbnail-frame">
      {thumbnail?<img src={thumbnail} alt="Uploaded thumbnail for this video"/>:
       <div className="thumbnail-placeholder"><span>▧</span><strong>Your thumbnail goes here</strong>
        <small>Visual context for the story, not a design editor.</small></div>}
     </div>
     <button className="secondary full" onClick={()=>void onUpload().catch(e=>onError(message(e)))}>
      {thumbnail?"Change thumbnail":"＋ Upload thumbnail"}
     </button>
    </section>
    <section className="context-section">
     <div className="context-heading"><span>04 / RESEARCH &amp; REFERENCES</span><span>{attachments.length}</span></div>
     <p className="context-hint">Upload evidence and concept material. Files are preserved locally and are not sent to AI.</p>
     {attachments.map(file=><div className="attachment" key={file.id}>
       <div><span className="file-icon">▤</span><strong>{file.name}</strong>
       <small>{file.kind.toUpperCase()} · {Math.ceil(file.size_bytes/1024)} KB</small></div>
       <button aria-label={"Delete "+file.name} title="Remove reference from list" onClick={async()=>{
        if(!window.confirm("Remove this reference from the script list? The stored original is retained for recovery."))return;
        try{await api("delete_source",{id:file.id,script_id:script.id});await onRefresh()}
        catch(e){onError(message(e))}
       }}>×</button>
      </div>)}
     <button className="secondary full" onClick={()=>void onAttach().catch(e=>onError(message(e)))}>＋ Attach source files</button>
    </section>
    <section className="context-section">
     <div className="context-heading"><span>05 / EDITORIAL NOTES</span></div>
     <textarea aria-label="Editorial notes" rows={4} value={draft.notes}
      onChange={e=>change({notes:e.target.value})} placeholder="Sources to check, objections to address, possible lines…"/>
    </section>
    <section className="ai-teaser">
      <span className="small-icon">✧</span>
      <strong>AI Writing Partner</strong>
      <p>Coming next: discuss your argument beside the script, use your channel's voice, and review suggestions before accepting edits.</p>
      <small>Not connected in v0.1</small>
    </section>
   </aside>
  </div>
  {history&&<div className="modal-overlay">
    <div role="dialog" aria-modal="true" className="dialog history-dialog" aria-label="Earlier drafts">
     <div className="dialog-head"><h2>Earlier drafts</h2><button onClick={()=>setHistory(null)}>×</button></div>
     {history.length===0?<p>No previous snapshots yet. SCRIPTORIA preserves a snapshot when the script text changes, at most once every two minutes.</p>:
      history.map(r=><div className="history-entry" key={r.id}><div><b>{r.title}</b>
         <p>{new Date(r.created_at).toLocaleString()} · {wordCount(r.script_text)} words</p>
         <pre>{r.script_text.slice(0,420)}</pre></div>
         <button onClick={()=>restore(r)}>Restore text</button></div>)}
    </div>
   </div>}
 </div>;
}
function ChannelDialog({initial,onClose,onSaved,onError}:{
 initial:Channel|null;onClose:()=>void;onSaved:(id:string)=>Promise<void>;onError:(v:string)=>void;
}){
 const [name,setName]=useState(initial?.name??"");
 const [mission,setMission]=useState(initial?.mission??"");
 const [audience,setAudience]=useState(initial?.audience??"");
 const [voice,setVoice]=useState(initial?.voice??"");
 const [saving,setSaving]=useState(false);
 async function submit(e:React.FormEvent){
  e.preventDefault();setSaving(true);
  try{
   const data={name,mission,audience,voice};
   if(initial){await api("save_channel",{id:initial.id,...data});await onSaved(initial.id)}
   else{const res=await api<{id:string}>("create_channel",data);await onSaved(res.id)}
   onClose();
  }catch(e){onError(message(e))}finally{setSaving(false)}
 }
 return <div className="modal-overlay"><form role="dialog" aria-modal="true" className="dialog" onSubmit={e=>void submit(e)}>
   <div className="dialog-head"><div><div className="eyebrow">CHANNEL IDENTITY</div><h2>{initial?"Edit your channel":"Create your channel"}</h2></div>
     <button type="button" onClick={onClose}>×</button></div>
   <p>Each channel has its own voice and purpose. Future AI responses will use this confirmed channel profile as context.</p>
   <label>Channel name<input required maxLength={120} autoFocus value={name} onChange={e=>setName(e.target.value)}
     placeholder="The Truth Project"/></label>
   <label>Channel mission<textarea rows={3} value={mission} onChange={e=>setMission(e.target.value)}
     placeholder="Why does this channel exist?"/></label>
   <label>Intended audience<textarea rows={2} value={audience} onChange={e=>setAudience(e.target.value)}
     placeholder="Who are you speaking to?"/></label>
   <label>Writing voice &amp; principles<textarea rows={4} value={voice} onChange={e=>setVoice(e.target.value)}
     placeholder="Tone, style, editorial commitments, recurring viewpoints…"/></label>
   <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button>
     <button type="submit" className="primary" disabled={saving||!name.trim()}>{saving?"Saving…":"Save channel"}</button></div>
  </form></div>;
}
function App(){
 const [channels,setChannels]=useState<Channel[]>([]);
 const [channelId,setChannelId]=useState<string|null>(null);
 const [scripts,setScripts]=useState<Script[]>([]);
 const [selected,setSelected]=useState<Script|null>(null);
 const [refs,setRefs]=useState<Reference[]>([]);
 const [dialog,setDialog]=useState<"create"|"edit"|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [info,setInfo]=useState<{data_directory:string}|null>(null);
 const flushRef=useRef<()=>Promise<void>>(async()=>{});
 const fail=useCallback((msg:string)=>setError(msg),[]);
 const activeChannel=channels.find(c=>c.id===channelId)??null;
 const selectedId=selected?.id??null;
 const reloadChannels=useCallback(async()=>{
  const data=await api<Channel[]>("channels");
  setChannels(data);
  return data;
 },[]);
 const loadScripts=useCallback(async(id:string,choose?:string)=>{
  const videos=await api<Script[]>("scripts",{channel_id:id});
  setScripts(videos);
  const target=choose?videos.find(s=>s.id===choose):videos[0];
  setSelected(target??null);
 },[]);
 useEffect(()=>{
  let cancelled=false;
  Promise.all([api<Channel[]>("channels"),api<{data_directory:string}>("info")])
    .then(async ([all,local])=>{
      if(cancelled)return;
      setChannels(all);setInfo(local);
      if(all.length){
       setChannelId(all[0].id);
       const videos=await api<Script[]>("scripts",{channel_id:all[0].id});
       if(!cancelled){setScripts(videos);setSelected(videos[0]??null)}
      }
    }).catch(e=>{if(!cancelled)fail(message(e))})
    .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[fail]);
 useEffect(()=>{
  let active=true;
  if(!selectedId){setRefs([]);return}
  void api<Reference[]>("sources",{script_id:selectedId})
   .then(result=>{if(active)setRefs(result)})
   .catch(e=>{if(active)fail(message(e))});
  return()=>{active=false};
 },[selectedId,fail]);
 useEffect(()=>{
  let cancel=false;
  getCurrentWindow().onCloseRequested(async(e)=>{
   e.preventDefault();
   try{await flushRef.current()}catch(err){fail("Save failed. Copy your script before closing: "+message(err));return}
   if(!cancel)await getCurrentWindow().destroy();
  }).then(unlisten=>{if(cancel)unlisten()}).catch(()=>{});
  return()=>{cancel=true};
 },[fail]);
 const flush=useCallback(async()=>{await flushRef.current()},[]);
 async function changeChannel(id:string){
  try{await flush();flushRef.current=async()=>{};setChannelId(id);await loadScripts(id)}
  catch(e){fail(message(e))}
 }
 async function changeScript(s:Script){
  if(s.id===selectedId)return;
  try{await flush();flushRef.current=async()=>{};setSelected(s)}
  catch(e){fail(message(e))}
 }
 async function addScript(){
  if(!channelId)return;
  const title=window.prompt("New video title");
  if(!title?.trim())return;
  try{
   await flush();
   const result=await api<Script>("create_script",{channel_id:channelId,title});
   flushRef.current=async()=>{};
   await loadScripts(channelId,result.id);
  }catch(e){fail(message(e))}
 }
 async function savedChannel(id:string){
  await flush();
  await reloadChannels();
  setChannelId(id);
  await loadScripts(id);
 }
 async function uploadThumbnail(){
  if(!selected)return;
  const path=await open({multiple:false,filters:[{name:"Thumbnail image",extensions:["png","jpg","jpeg","webp"]}]});
  if(typeof path!=="string")return;
  await flush();
  const updated=await api<Script>("add_thumbnail",{script_id:selected.id,path});
  flushRef.current=async()=>{};
  setSelected(updated);
  setScripts(old=>old.map(s=>s.id===updated.id?updated:s));
 }
 async function attachSources(){
  if(!selected)return;
  const picked=await open({multiple:true,filters:[{name:"Research and references",extensions:
   ["pdf","docx","epub","txt","md","markdown","json","png","jpg","jpeg","webp"]}]});
  if(!picked)return;
  const paths=Array.isArray(picked)?picked:[picked];
  let success=0;const failed:string[]=[];
  for(const path of paths){
   try{await api("add_source",{script_id:selected.id,path});success++}
   catch(e){failed.push(message(e))}
  }
  await refreshReferences();
  if(failed.length)fail(success+" imported; errors: "+failed.join(" · "));
 }
 async function refreshReferences(){
  if(selected)setRefs(await api<Reference[]>("sources",{script_id:selected.id}));
 }
 function savedScript(fields:Fields,version:number){
  setSelected(old=>old?{...old,...fields,version}:null);
  setScripts(old=>old.map(s=>s.id===selectedId?{...s,...fields,version}:s));
 }
 const count=useMemo(()=>scripts.length,[scripts]);
 return <div className="app-shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark"><span>≡</span><i>▶</i></div>
    <div><strong>SCRIPTORIA</strong><small>WRITE YOUR SCRIPT.</small></div></div>
   <div className="sidebar-section">
    <div className="sidebar-section-title"><span>YOUR CHANNELS</span><button title="Add channel" onClick={()=>setDialog("create")}>＋</button></div>
    {channels.map(c=><button className={"channel-pill "+(c.id===channelId?"active":"")} key={c.id}
      onClick={()=>void changeChannel(c.id)}><span className="channel-avatar">{c.name.slice(0,1).toUpperCase()}</span>
      <span className="channel-name">{c.name}<small>{c.video_count} SCRIPTS</small></span>
      {c.id===channelId&&<span className="active-dot">●</span>}</button>)}
    {!channels.length&&<p className="sidebar-empty">Create a channel to begin your first script.</p>}
   </div>
   {activeChannel&&<div className="sidebar-section video-list">
    <div className="sidebar-section-title"><span>VIDEO SCRIPTS</span><button title="New script" onClick={()=>void addScript()}>＋</button></div>
    {scripts.map(s=><button className={"video-link "+(s.id===selectedId?"active":"")} key={s.id} onClick={()=>void changeScript(s)}>
      <span className="video-link-icon">▤</span><span>{s.title}<small>{s.status.toUpperCase()}</small></span></button>)}
    {!count&&<p className="sidebar-empty">No scripts yet. Use + to start one.</p>}
    <button className="outline-add" onClick={()=>void addScript()}>＋ New script</button>
   </div>}
   <div className="sidebar-footer">
    {activeChannel&&<button onClick={()=>setDialog("edit")}>⚙ &nbsp; Channel identity</button>}
    <div><span className="status-indicator"/>LOCAL-FIRST WORKSPACE</div>
    <small>v0.1.0 · WINDOWS</small>
   </div>
  </aside>
  <main className="main-pane">
   {loading?<div className="empty-screen"><h2>Opening SCRIPTORIA…</h2></div>:
   !activeChannel?<div className="empty-screen">
    <div className="empty-icon">▤</div><div className="eyebrow">THE BEGINNING OF A STORY</div>
    <h1>Your story starts with a <em>channel.</em></h1>
    <p>Give your writing a home: define your channel's purpose, audience and voice.</p>
    <button className="primary" onClick={()=>setDialog("create")}>＋ Create your first channel</button>
   </div>:
   !selected?<div className="empty-screen">
    <div className="empty-icon">✎</div><div className="eyebrow">{activeChannel.name.toUpperCase()}</div>
    <h1>Every video begins with <em>an idea.</em></h1>
    <p>Write what your audience will hear. Keep the thumbnail and supporting material beside the story.</p>
    <button className="primary" onClick={()=>void addScript()}>＋ Create a video script</button>
   </div>:
   <ScriptEditor key={selected.id+":"+(selected.thumbnail_file??"")} script={selected}
    channel={activeChannel} flushRef={flushRef} onSaved={savedScript}
    onUpload={uploadThumbnail} onAttach={attachSources} attachments={refs}
    onRefresh={refreshReferences} onError={fail}/>}
  </main>
  {info&&<div className="footnote" title={info.data_directory}>OFFLINE · YOUR WRITING STAYS ON YOUR COMPUTER</div>}
  {dialog&&<ChannelDialog initial={dialog==="edit"?activeChannel:null} onClose={()=>setDialog(null)}
    onSaved={savedChannel} onError={fail}/>}
  {error&&<div className="error-toast" role="alert"><span>{error}</span><button onClick={()=>setError("")}>Dismiss ×</button></div>}
 </div>;
}
export default App;