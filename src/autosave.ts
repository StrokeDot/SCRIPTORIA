// Serialized writes and optimistic versions prevent slow autosaves overwriting newer work.
export class Autosave<T extends object>{
 private pending:T|null=null;
 private active:Promise<void>|null=null;
 private timer:ReturnType<typeof setTimeout>|undefined;
 public error:unknown=null;
 constructor(private version:number,private persist:(draft:T,version:number)=>Promise<{version:number}>,
 private status:(value:"pending"|"saving"|"saved"|"error")=>void){}
 enqueue(draft:T){
  this.pending=draft;this.status("pending");
  clearTimeout(this.timer);
  this.timer=setTimeout(()=>{void this.flush().catch(()=>{})},500);
 }
 async flush():Promise<void>{
  clearTimeout(this.timer);
  if(this.active){await this.active;if(this.pending)return this.flush();return;}
  if(!this.pending){if(this.error)throw this.error;return;}
  this.active=this.drain();
  try{await this.active;}finally{this.active=null;}
 }
 private async drain(){
  while(this.pending){
   const value=this.pending;this.pending=null;this.status("saving");
   try{this.version=(await this.persist(value,this.version)).version;this.error=null;}
   catch(e){this.pending=this.pending??value;this.error=e;this.status("error");throw e;}
  }
  this.status("saved");
 }
}
