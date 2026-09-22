function has(list,pattern){return (list||[]).some(x=>String(x).toLowerCase().includes(pattern));}

export function generateInteractionScenarios(blueprint){
  const b=blueprint?.projectBlueprint||blueprint||{};
  const requirements=b.requirements||{};
  const scenarios=[
    {id:"UI-001",name:"home-page-load",actions:[]},
    {id:"UI-002",name:"interactive-controls-visible",actions:[]}
  ];
  const flows=(b.flows||[]).map(String);
  if(has(flows,"search")) scenarios.push({id:"FLOW-SEARCH",name:"search-flow",actions:[
    {action:"fill",selector:"input[type=search],input[placeholder*='search' i]",value:"test"},
    {action:"press",selector:"input[type=search],input[placeholder*='search' i]",value:"Enter"}
  ]});
  if(has(flows,"sign in")||has(requirements.auth,"sign in")) scenarios.push({id:"FLOW-AUTH",name:"sign-in-flow",actions:[
    {action:"fill",selector:"input[type=email]",value:"test@example.com"},
    {action:"fill",selector:"input[type=password]",value:"TestPassword123!"},
    {action:"click",selector:"button[type=submit],button"}
  ]});
  if(has(flows,"book")||has(flows,"reserve")) scenarios.push({id:"FLOW-BOOKING",name:"booking-flow",actions:[
    {action:"click",selector:"button"}
  ]});
  if(has(flows,"checkout")||has(flows,"purchase")) scenarios.push({id:"FLOW-CHECKOUT",name:"checkout-flow",actions:[
    {action:"click",selector:"button"}
  ]});
  if(b.product?.kind==="game"){
    scenarios.push({id:"GAME-001",name:"game-start-control",actions:[
      {action:"click",selector:"#start,button"}
    ]});
  }
  return scenarios;
}

export function compileScenarioPlan(blueprint){
  const scenarios=generateInteractionScenarios(blueprint);
  return {
    version:"1.0",
    strategy:"blueprint-driven",
    generatedAt:new Date().toISOString(),
    scenarios,
    acceptanceCriteria:[
      "The generated application loads in a browser.",
      "Required interactive controls are discoverable.",
      "Applicable inferred user flows can be exercised without browser errors."
    ]
  };
}
