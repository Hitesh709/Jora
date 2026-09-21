import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {dirname} from "node:path";

const locks=new Map();

function isJsonSyntaxError(error){
  return error?.name==="SyntaxError" || error instanceof SyntaxError;
}

async function withFileLock(file,operation){
  const previous=locks.get(file)||Promise.resolve();
  let release;
  const current=new Promise(resolve=>{release=resolve});
  locks.set(file,current);
  await previous;
  try{return await operation()}
  finally{
    release();
    if(locks.get(file)===current) locks.delete(file);
  }
}

export class JsonStore {
  constructor({file}={}){if(!file) throw new Error("file is required"); this.file=file;}

  async read(defaultValue={}){
    return withFileLock(this.file,async()=>{
      try{
        return JSON.parse(await readFile(this.file,"utf8"));
      }catch(error){
        if(error.code==="ENOENT") return defaultValue;
        if(!isJsonSyntaxError(error)) throw error;

        const corruptFile=`${this.file}.corrupt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        try{
          await rename(this.file,corruptFile);
        }catch(renameError){
          if(renameError.code!=="ENOENT") throw renameError;
        }
        return this._writeUnlocked(defaultValue);
      }
    });
  }

  async _writeUnlocked(value){
    await mkdir(dirname(this.file),{recursive:true});
    const tmp=`${this.file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    await writeFile(tmp,JSON.stringify(value,null,2)+"\n","utf8");
    try{
      await rename(tmp,this.file);
    }catch(error){
      try{await import("node:fs/promises").then(fs=>fs.rm(tmp,{force:true}))}catch{}
      throw error;
    }
    return value;
  }

  async write(value){
    return withFileLock(this.file,()=>this._writeUnlocked(value));
  }
}
