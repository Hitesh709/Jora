import {loadPortfolio,buildPortfolioPlan} from "./project-portfolio-engine.js";
import {loadResourceScheduler} from "./resource-scheduling-engine.js";
import {loadGovernanceState} from "./autonomy-governance-engine.js";
import {loadProjectIntelligence} from "./project-intelligence-engine.js";

export async function buildAutonomousCommandCenter(root){
  const [portfolio,resources,governance,intelligence]=await Promise.all([
    loadPortfolio(root),loadResourceScheduler(root),loadGovernanceState(root),loadProjectIntelligence(root)
  ]);
  const projects=(portfolio?.projects||[]).map(project=>({
    id:project.id,name:project.name,status:project.status,priority:project.priority,health:project.health,missionStatus:project.missionStatus
  }));
  const plan=portfolio?buildPortfolioPlan(portfolio):null;
  const activeProjects=projects.filter(p=>["active","registered"].includes(p.status));
  return {
    version:"1.0",
    status:"COMMAND_CENTER_READY",
    portfolio:{projectCount:projects.length,activeCount:activeProjects.length,projects,plan},
    resources:{workers:resources?.workers||0,queued:resources?.queue?.length||0,leased:resources?.leases?.length||0},
    governance:{mode:governance?.mode||"guarded",lastDecision:(governance?.decisions||[]).at(-1)||null},
    intelligence:intelligence?.signals||{health:"unknown",risk:"unknown",progress:"unknown"},
    nextActions:plan?.assignments?.map(a=>({type:"RUN_PROJECT",projectId:a.projectId}))||[]
  };
}
export default {buildAutonomousCommandCenter};