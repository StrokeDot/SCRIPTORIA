import {invoke} from "@tauri-apps/api/core";
export function api<T>(action:string,args:Record<string,unknown>={}):Promise<T>{
 return invoke<T>("request",{action,args});
}
export function message(error:unknown){return error instanceof Error?error.message:String(error);}
