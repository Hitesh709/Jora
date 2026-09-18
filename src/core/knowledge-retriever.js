export class KnowledgeRetriever {
  constructor({knowledgeStore,agentMemory=null}={}){if(!knowledgeStore)throw new Error("knowledgeStore is required");this.knowledgeStore=knowledgeStore;this.agentMemory=agentMemory;}
  async retrieve({query,agentId=null,limit=8}={}){const knowledge=await this.knowledgeStore.search(query,{limit});const memories=this.agentMemory?await this.agentMemory.recall({agentId,limit}):[];return {query,knowledge,memory:memories};}
  context({retrieval,maxCharacters=12000}={}){const chunks=[];for(const x of retrieval?.knowledge??[])chunks.push(`[KNOWLEDGE ${x.id}] ${x.title}: ${x.content}`);for(const x of retrieval?.memory??[])chunks.push(`[MEMORY ${x.type}] ${x.content}`);return chunks.join("\n").slice(0,maxCharacters);}
}
