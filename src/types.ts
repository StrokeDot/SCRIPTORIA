export type Channel={id:string;name:string;mission:string;audience:string;voice:string;created_at:number;video_count:number};
export type Script={id:string;channel_id:string;title:string;concept:string;hook:string;takeaway:string;script_text:string;notes:string;status:"Draft"|"Writing"|"Review"|"Ready";thumbnail_file:string|null;version:number;created_at:number;updated_at:number};
export type Reference={id:string;script_id:string;name:string;kind:string;notes:string;size_bytes:number;sha256:string;created_at:number};
export type Version={version:number};
export function wordCount(s:string){return s.trim()?s.trim().split(/\s+/u).length:0;}
export function estimatedDuration(s:string){return Math.max(0,Math.round(wordCount(s)*60/135));}
export function shortTime(seconds:number){return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;}
