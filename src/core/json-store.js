import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname} from "node:path";
export class JsonStore {
  constructor({file}={}){if(!file) throw new Error("file is required"); this.file=file;}
  async read(defaultValue={}){try{return JSON.parse(await readFile(this.file,"utf8"));}catch(e){if(e.code==="ENOENT") return defaultValue; throw e;}}
  async write(value){await mkdir(dirname(this.file),{recursive:true}); const tmp=this.file+".tmp"; await writeFile(tmp,JSON.stringify(value,null,2)+"\n","utf8"); const {rename}=await import("node:fs/promises"); await rename(tmp,this.file); return value;}
}
