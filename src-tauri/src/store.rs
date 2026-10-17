use base64::{engine::general_purpose::STANDARD,Engine as _};
use rusqlite::{params,Connection,OptionalExtension};
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs,io::Read,path::{Path,PathBuf},time::{SystemTime,UNIX_EPOCH}};
use uuid::Uuid;

pub struct Store {conn:Connection,root:PathBuf}
fn stamp()->i64 {SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64}
fn id()->String {Uuid::new_v4().to_string()}
fn get<'a>(v:&'a Value,key:&str)->Result<&'a str,String> {
    v.get(key).and_then(Value::as_str).ok_or_else(||format!("Missing {key}"))
}
fn text(v:&Value,key:&str,max:usize)->Result<String,String>{
    let s=v.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    if s.len()>max {return Err(format!("{key} exceeds the size limit"))}
    Ok(s)
}
fn required(v:&Value,key:&str,max:usize)->Result<String,String>{
    let s=text(v,key,max)?;
    if s.trim().is_empty(){return Err(format!("{key} is required"))}
    Ok(s)
}
fn sqlerr(e:rusqlite::Error)->String {format!("Local database error: {e}")}
fn out<T:serde::Serialize>(v:T)->Result<Value,String>{serde_json::to_value(v).map_err(|e|e.to_string())}
#[derive(serde::Serialize)]
struct Channel {
    id:String,name:String,mission:String,audience:String,voice:String,
    created_at:i64,video_count:i64,
}
#[derive(serde::Serialize)]
struct Script{
    id:String,channel_id:String,title:String,concept:String,hook:String,
    takeaway:String,script_text:String,notes:String,status:String,
    thumbnail_file:Option<String>,version:i64,created_at:i64,updated_at:i64,
}
#[derive(serde::Serialize)]
struct Source{
    id:String,script_id:String,name:String,kind:String,notes:String,size_bytes:i64,
    sha256:String,created_at:i64,
}
impl Store{
pub fn open<P:AsRef<Path>>(dir:P)->Result<Self,String>{
    let root=dir.as_ref().to_path_buf();
    fs::create_dir_all(root.join("assets")).map_err(|e|format!("Cannot create local data directory: {e}"))?;
    let conn=Connection::open(root.join("scriptoria.db")).map_err(sqlerr)?;
    conn.execute_batch(r#"
        PRAGMA foreign_keys=ON;
        PRAGMA journal_mode=WAL;
        PRAGMA busy_timeout=4000;
        CREATE TABLE IF NOT EXISTS channels(
          id TEXT PRIMARY KEY,name TEXT NOT NULL,mission TEXT NOT NULL DEFAULT '',
          audience TEXT NOT NULL DEFAULT '',voice TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scripts(
          id TEXT PRIMARY KEY,channel_id TEXT NOT NULL REFERENCES channels(id),
          title TEXT NOT NULL,concept TEXT NOT NULL DEFAULT '',
          hook TEXT NOT NULL DEFAULT '',takeaway TEXT NOT NULL DEFAULT '',
          script_text TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Writing','Review','Ready')),
          thumbnail_file TEXT,version INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS scripts_channel ON scripts(channel_id,updated_at DESC);
        CREATE TABLE IF NOT EXISTS sources(
          id TEXT PRIMARY KEY,script_id TEXT NOT NULL REFERENCES scripts(id),
          name TEXT NOT NULL,kind TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',
          stored_file TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sources_script ON sources(script_id,created_at);
        CREATE TABLE IF NOT EXISTS script_revisions(
          id TEXT PRIMARY KEY,script_id TEXT NOT NULL REFERENCES scripts(id),
          title TEXT NOT NULL,script_text TEXT NOT NULL,created_at INTEGER NOT NULL
        );
    "#).map_err(sqlerr)?;
    Ok(Self{conn,root})
}
fn channels(&self)->Result<Value,String>{
    let mut stmt=self.conn.prepare("SELECT c.id,c.name,c.mission,c.audience,c.voice,c.created_at,(SELECT count(*) FROM scripts s WHERE s.channel_id=c.id) FROM channels c ORDER BY c.created_at,c.name").map_err(sqlerr)?;
    let rows=stmt.query_map([],|r|Ok(Channel{id:r.get(0)?,name:r.get(1)?,mission:r.get(2)?,audience:r.get(3)?,voice:r.get(4)?,created_at:r.get(5)?,video_count:r.get(6)?})).map_err(sqlerr)?;
    out(rows.collect::<Result<Vec<_>,_>>().map_err(sqlerr)?)
}
fn scripts(&self,cid:&str)->Result<Value,String>{
    let mut stmt=self.conn.prepare("SELECT id,channel_id,title,concept,hook,takeaway,script_text,notes,status,thumbnail_file,version,created_at,updated_at FROM scripts WHERE channel_id=? ORDER BY updated_at DESC,id").map_err(sqlerr)?;
    let rows=stmt.query_map([cid],Self::script_row).map_err(sqlerr)?;
    out(rows.collect::<Result<Vec<_>,_>>().map_err(sqlerr)?)
}
fn script_row(r:&rusqlite::Row<'_>)->rusqlite::Result<Script>{
    Ok(Script{id:r.get(0)?,channel_id:r.get(1)?,title:r.get(2)?,concept:r.get(3)?,hook:r.get(4)?,
        takeaway:r.get(5)?,script_text:r.get(6)?,notes:r.get(7)?,status:r.get(8)?,
        thumbnail_file:r.get(9)?,version:r.get(10)?,created_at:r.get(11)?,updated_at:r.get(12)?})
}
fn script(&self,sid:&str)->Result<Script,String>{
    self.conn.query_row("SELECT id,channel_id,title,concept,hook,takeaway,script_text,notes,status,thumbnail_file,version,created_at,updated_at FROM scripts WHERE id=?",[sid],Self::script_row)
        .optional().map_err(sqlerr)?.ok_or("Script not found".to_string())
}
fn sources(&self,sid:&str)->Result<Value,String>{
    let mut stmt=self.conn.prepare("SELECT id,script_id,name,kind,notes,size_bytes,sha256,created_at FROM sources WHERE script_id=? ORDER BY created_at,id").map_err(sqlerr)?;
    let items=stmt.query_map([sid],|r|Ok(Source{id:r.get(0)?,script_id:r.get(1)?,name:r.get(2)?,kind:r.get(3)?,
        notes:r.get(4)?,size_bytes:r.get(5)?,sha256:r.get(6)?,created_at:r.get(7)?})).map_err(sqlerr)?;
    out(items.collect::<Result<Vec<_>,_>>().map_err(sqlerr)?)
}
fn read_file(path:&Path,max:u64)->Result<Vec<u8>,String>{
    let file=fs::File::open(path).map_err(|e|format!("Unable to open selected file: {e}"))?;
    let size=file.metadata().map_err(|e|e.to_string())?.len();
    if size==0||size>max{return Err(format!("Selected file must be between 1 byte and {max} bytes"))}
    let mut bytes=Vec::with_capacity(size as usize);
    file.take(max+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len() as u64>max{return Err("File exceeds the import limit".into())}
    Ok(bytes)
}
fn extension(path:&Path)->String{path.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase()}
fn image_mime(bytes:&[u8])->Option<&'static str>{
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){Some("image/png")}
    else if bytes.starts_with(&[0xff,0xd8,0xff]){Some("image/jpeg")}
    else if bytes.len()>=12&&&bytes[..4]==b"RIFF"&&&bytes[8..12]==b"WEBP"{Some("image/webp")}
    else{None}
}
fn store_bytes(&self,bytes:&[u8],ext:&str)->Result<(String,String),String>{
    let file=format!("{}.{}",id(),ext);
    let sha=format!("{:x}",Sha256::digest(bytes));
    fs::write(self.root.join("assets").join(&file),bytes).map_err(|e|format!("Cannot store attachment: {e}"))?;
    Ok((file,sha))
}
fn add_thumbnail(&mut self,sid:&str,path:&str)->Result<Value,String>{
    self.script(sid)?;
    let bytes=Self::read_file(Path::new(path),12*1024*1024)?;
    let mime=Self::image_mime(&bytes).ok_or("Select a valid PNG, JPEG or WebP image")?;
    let ext=match mime{"image/png"=>"png","image/jpeg"=>"jpg",_=>"webp"};
    let (file,_)=self.store_bytes(&bytes,ext)?;
    let result=self.conn.execute("UPDATE scripts SET thumbnail_file=?,updated_at=?,version=version+1 WHERE id=?",
        params![file,stamp(),sid]).map_err(sqlerr);
    if let Err(e)=result{let _=fs::remove_file(self.root.join("assets").join(&file));return Err(e)}
    out(self.script(sid)?)
}
fn thumbnail(&self,sid:&str)->Result<Value,String>{
    let item=self.script(sid)?;
    if let Some(name)=item.thumbnail_file {
        let bytes=Self::read_file(&self.root.join("assets").join(&name),12*1024*1024)?;
        let mime=Self::image_mime(&bytes).ok_or("Stored thumbnail is not a supported image")?;
        Ok(json!({"data_url":format!("data:{mime};base64,{}",STANDARD.encode(bytes))}))
    }else{Ok(json!({"data_url":null}))}
}
fn add_source(&mut self,sid:&str,path:&str)->Result<Value,String>{
    self.script(sid)?;
    let source=Path::new(path);
    let ext=Self::extension(source);
    if !["pdf","docx","epub","txt","md","markdown","json","png","jpg","jpeg","webp"].contains(&ext.as_str()){
        return Err("Supported references: PDF, DOCX, EPUB, TXT, Markdown, JSON, PNG, JPG and WebP".into())
    }
    let bytes=Self::read_file(source,50*1024*1024)?;
    if ["png","jpg","jpeg","webp"].contains(&ext.as_str())&&Self::image_mime(&bytes).is_none(){
        return Err("Reference image format is invalid".into())
    }
    let (stored,sha)=self.store_bytes(&bytes,&ext)?;
    let name=source.file_name().and_then(|x|x.to_str()).unwrap_or("Imported reference");
    let key=id();
    let result=self.conn.execute("INSERT INTO sources(id,script_id,name,kind,stored_file,size_bytes,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)",
        params![key,sid,name,ext,stored,bytes.len() as i64,sha,stamp()]).map_err(sqlerr);
    if let Err(e)=result{let _=fs::remove_file(self.root.join("assets").join(&stored));return Err(e)}
    Ok(json!({"id":key,"name":name}))
}
pub fn request(&mut self,action:&str,args:Value)->Result<Value,String>{
    match action{
    "info"=>Ok(json!({"name":"SCRIPTORIA","version":env!("CARGO_PKG_VERSION"),"data_directory":self.root.to_string_lossy(),"schema":1})),
    "channels"=>self.channels(),
    "create_channel"=>{
        let name=required(&args,"name",120)?;let key=id();
        self.conn.execute("INSERT INTO channels(id,name,mission,audience,voice,created_at) VALUES(?,?,?,?,?,?)",
            params![key,name,text(&args,"mission",8000)?,text(&args,"audience",4000)?,
                text(&args,"voice",8000)?,stamp()]).map_err(sqlerr)?;
        Ok(json!({"id":key}))
    }
    "save_channel"=>{
        let n=self.conn.execute("UPDATE channels SET name=?,mission=?,audience=?,voice=? WHERE id=?",
            params![required(&args,"name",120)?,text(&args,"mission",8000)?,
                text(&args,"audience",4000)?,text(&args,"voice",8000)?,get(&args,"id")?]).map_err(sqlerr)?;
        if n!=1{return Err("Channel not found".into())}Ok(json!(true))
    }
    "scripts"=>self.scripts(get(&args,"channel_id")?),
    "create_script"=>{
        let cid=get(&args,"channel_id")?;
        let exists:i64=self.conn.query_row("SELECT count(*) FROM channels WHERE id=?",[cid],|r|r.get(0)).map_err(sqlerr)?;
        if exists!=1{return Err("Choose an existing channel".into())}
        let key=id();let now=stamp();
        self.conn.execute("INSERT INTO scripts(id,channel_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
            params![key,cid,required(&args,"title",240)?,now,now]).map_err(sqlerr)?;
        out(self.script(&key)?)
    }
    "script"=>out(self.script(get(&args,"id")?)?),
    "save_script"=>{
        let key=get(&args,"id")?;
        let version=args.get("version").and_then(Value::as_i64).ok_or("Save requires current version")?;
        let status=get(&args,"status")?;
        if !["Draft","Writing","Review","Ready"].contains(&status){return Err("Invalid script status".into())}
        let current=self.script(key)?;
        if current.version!=version{return Err("This script changed elsewhere. Copy unsaved text before reloading.".into())}
        let title=required(&args,"title",240)?;
        let concept=text(&args,"concept",40_000)?;
        let hook=text(&args,"hook",30_000)?;
        let takeaway=text(&args,"takeaway",30_000)?;
        let script_text=text(&args,"script_text",2_000_000)?;
        let notes=text(&args,"notes",100_000)?;
        if current.title==title && current.concept==concept && current.hook==hook &&
           current.takeaway==takeaway && current.script_text==script_text &&
           current.notes==notes && current.status==status {return Ok(json!({"version":version}))}
        let now=stamp();
        let tx=self.conn.transaction().map_err(sqlerr)?;
        let last:i64=tx.query_row("SELECT COALESCE(MAX(created_at),0) FROM script_revisions WHERE script_id=?",
            [key],|r|r.get(0)).map_err(sqlerr)?;
        if (current.script_text!=script_text||current.title!=title) && now-last>120_000{
            tx.execute("INSERT INTO script_revisions(id,script_id,title,script_text,created_at) VALUES(?,?,?,?,?)",
                params![id(),key,current.title,current.script_text,now]).map_err(sqlerr)?;
        }
        let changed=tx.execute("UPDATE scripts SET title=?,concept=?,hook=?,takeaway=?,script_text=?,notes=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=?",
            params![title,concept,hook,takeaway,script_text,notes,status,now,key,version]).map_err(sqlerr)?;
        if changed!=1{return Err("Script changed before save completed".into())}
        tx.commit().map_err(sqlerr)?;Ok(json!({"version":version+1}))
    }
    "script_revisions"=>{
        let sid=get(&args,"script_id")?;self.script(sid)?;
        let mut st=self.conn.prepare("SELECT id,title,script_text,created_at FROM script_revisions WHERE script_id=? ORDER BY created_at DESC LIMIT 50").map_err(sqlerr)?;
        let rows=st.query_map([sid],|r|Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,
            "script_text":r.get::<_,String>(2)?,"created_at":r.get::<_,i64>(3)?}))).map_err(sqlerr)?;
        out(rows.collect::<Result<Vec<_>,_>>().map_err(sqlerr)?)
    }
    "add_thumbnail"=>self.add_thumbnail(get(&args,"script_id")?,get(&args,"path")?),
    "thumbnail"=>self.thumbnail(get(&args,"script_id")?),
    "add_source"=>self.add_source(get(&args,"script_id")?,get(&args,"path")?),
    "sources"=>self.sources(get(&args,"script_id")?),
    "save_source_notes"=>{
        let n=self.conn.execute("UPDATE sources SET notes=? WHERE id=? AND script_id=?",
            params![text(&args,"notes",20_000)?,get(&args,"id")?,get(&args,"script_id")?]).map_err(sqlerr)?;
        if n!=1{return Err("Reference not found for this script".into())}Ok(json!(true))
    }
    "delete_source"=>{
        let n=self.conn.execute("DELETE FROM sources WHERE id=? AND script_id=?",
            params![get(&args,"id")?,get(&args,"script_id")?]).map_err(sqlerr)?;
        if n!=1{return Err("Reference not found for this script".into())}
        // Original bytes are retained until an explicit archival cleanup.
        Ok(json!(true))
    }
    _=>Err("Unknown operation".into())
    }
}
}

#[cfg(test)]
mod tests{
use super::*;
#[test]
fn writing_survives_relaunch_and_projects_are_isolated(){
 let dir=tempfile::tempdir().unwrap();let mut db=Store::open(dir.path()).unwrap();
 let c=db.request("create_channel",json!({"name":"The Truth Project","voice":"Reflective"})).unwrap()["id"].as_str().unwrap().to_string();
 let other=db.request("create_channel",json!({"name":"A Fair Critique"})).unwrap()["id"].as_str().unwrap().to_string();
 let sc=db.request("create_script",json!({"channel_id":c,"title":"Why Do We Lie?"})).unwrap();
 let sid=sc["id"].as_str().unwrap().to_string();
 assert_eq!(db.request("scripts",json!({"channel_id":other})).unwrap().as_array().unwrap().len(),0);
 let saved=db.request("save_script",json!({"id":sid,"version":0,"title":"Why Do We Lie?","concept":"Two negotiators",
    "hook":"Why do we lie?","takeaway":"Conscious choice","script_text":"A scene with Georgie.",
    "notes":"Check source","status":"Writing"})).unwrap();
 assert_eq!(saved["version"],1);
 assert!(db.request("save_script",json!({"id":sid,"version":0,"title":"Old","status":"Draft"})).is_err());
 let img=dir.path().join("thumb.png");fs::write(&img,b"\x89PNG\r\n\x1a\n01234567890").unwrap();
 db.request("add_thumbnail",json!({"script_id":sid,"path":img.to_str().unwrap()})).unwrap();
 assert!(db.request("thumbnail",json!({"script_id":sid})).unwrap()["data_url"].as_str().unwrap().starts_with("data:image/png;base64,"));
 let note=dir.path().join("research.txt");fs::write(&note,b"An important source").unwrap();
 db.request("add_source",json!({"script_id":sid,"path":note.to_str().unwrap()})).unwrap();
 drop(db);
 let mut db=Store::open(dir.path()).unwrap();
 assert_eq!(db.request("script",json!({"id":sid})).unwrap()["script_text"],"A scene with Georgie.");
 assert_eq!(db.request("sources",json!({"script_id":sid})).unwrap().as_array().unwrap().len(),1);
 assert_eq!(db.request("info",json!({})).unwrap()["name"],"SCRIPTORIA");
}
}
