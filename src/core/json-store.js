import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {dirname} from "node:path";

function isJsonSyntaxError(error){
  return error?.name==="SyntaxError" || error instanceof SyntaxError;
}

export class JsonStore {
  constructor({file}={}){if(!file) throw new Error("file is required"); this.file=file;}

  async read(defaultValue={}){
    try{
      return JSON.parse(await readFile(this.file,"utf8"));
    }catch(error){
      if(error.code==="ENOENT") return defaultValue;
      if(!isJsonSyntaxError(error)) throw error;

      // A partially written/corrupted state file must not take the production
      // control plane down. Preserve it for forensics, then restore a valid
      // default document atomically.
      const corruptFile=`${this.file}.corrupt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      try{
        await rename(this.file,corruptFile);
      }catch(renameError){
        if(renameError.code!=="ENOENT") throw renameError;
      }
      await this.write(defaultValue);
      return defaultValue;
    }
  }

  async write(value){
    await mkdir(dirname(this.file),{recursive:true});
    const tmp=this.file+".tmp";
    await writeFile(tmp,JSON.stringify(value,null,2)+"\n","utf8");
    await rename(tmp,this.file);
    return value;
  }
}
