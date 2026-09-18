export class SharedTeamMemory {
  constructor({memory}={}){if(!memory)throw new Error("memory is required");this.memory=memory;}
  async publish({teamId,agentId,content,type="team-fact",metadata={}}={}){return this.memory.remember({agentId:`team:${teamId}`,sessionId:teamId,content,type,metadata:{...metadata,sourceAgentId:agentId}});}
  async read({teamId,limit=50}={}){return this.memory.recall({agentId:`team:${teamId}`,sessionId:teamId,limit});}
  async clear(teamId){return this.memory.clear({agentId:`team:${teamId}`});}
}
