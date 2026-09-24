/**
 * Jora Phase 6 — Evidence-Based Multi-Agent Coordination
 *
 * Coordinates specialist assignments with explicit capability matching,
 * bounded parallelism, evidence requirements and conflict detection.
 */
export class MultiAgentCoordinationEngine {
  constructor({maxAgents=4,minQualityScore=0.7}={}) {
    this.version="6.0.0";
    this.maxAgents=Math.max(1,Number(maxAgents)||4);
    this.minQualityScore=Number(minQualityScore);
  }

  plan({requirements=[],agents=[]}={}) {
    const selected=[];
    const used=new Set();
    for(const requirement of requirements) {
      if(selected.length>=this.maxAgents) break;
      const candidates=agents.filter(agent =>
        !used.has(agent.id) &&
        (agent.status==="available"||!agent.status) &&
        (!requirement.capability || agent.capabilities?.includes(requirement.capability))
      ).sort((a,b)=>Number(b.score||0)-Number(a.score||0));
      const agent=candidates[0]||null;
      if(agent) {
        used.add(agent.id);
        selected.push({
          task:requirement.task||requirement.capability||"task",
          capability:requirement.capability||null,
          agentId:agent.id,
          score:Number(agent.score||0)
        });
      }
    }
    const unassigned=requirements.slice(selected.length).map(x=>x.task||x.capability||"task");
    return {
      accepted:true,
      status:unassigned.length?"PARTIALLY_ASSIGNED":"ASSIGNED",
      version:this.version,
      assignments:selected,
      unassigned
    };
  }

  evaluate({assignments=[],results=[]}={}) {
    const byTask=new Map(results.map(result=>[result.task||result.taskId,result]));
    const evaluated=assignments.map(assignment=>{
      const result=byTask.get(assignment.task);
      const quality=Number(result?.qualityScore??result?.score??0);
      return {
        ...assignment,
        status:result?"COMPLETED":"MISSING_EVIDENCE",
        qualityScore:quality,
        evidence:result?.evidence??null,
        accepted:Boolean(result && quality>=this.minQualityScore)
      };
    });
    const conflicts=evaluated.filter(x=>x.evidence?.conflict===true).map(x=>x.task);
    return {
      accepted:true,
      status:conflicts.length?"CONFLICT_DETECTED":evaluated.every(x=>x.accepted)?"COORDINATION_VERIFIED":"EVIDENCE_INCOMPLETE",
      assignments:evaluated,
      conflicts,
      productionReady:!conflicts.length && evaluated.length>0 && evaluated.every(x=>x.accepted)
    };
  }
}
