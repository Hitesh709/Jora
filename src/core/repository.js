export class InMemoryRepository {
  constructor(initial={}) { this.files=new Map(Object.entries(initial).map(([p,c])=>[p,{content:c,sha:this.sha(c)}])); }
  sha(content) { let h=2166136261; for(const ch of content){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)} return (h>>>0).toString(16); }
  list(prefix="") { return [...this.files.keys()].filter(p=>p.startsWith(prefix)).sort(); }
  read(path) { const f=this.files.get(path); if(!f) throw new Error(`File not found: ${path}`); return {path,...structuredClone(f)}; }
  write(path,content,expectedSha=null) {
    const current=this.files.get(path);
    if(current && expectedSha && current.sha!==expectedSha) throw new Error("Repository conflict: SHA mismatch");
    const sha=this.sha(content); this.files.set(path,{content,sha}); return {path,sha};
  }
  search(query) {
    if(!query) return [];
    return [...this.files.entries()].filter(([,f])=>f.content.includes(query)).map(([path])=>path);
  }
}