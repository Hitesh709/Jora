export class ProjectFactory {
  constructor({pipeline, evaluator} = {}) {
    if (!pipeline || !evaluator) throw new Error("pipeline and evaluator are required");
    this.pipeline = pipeline;
    this.evaluator = evaluator;
  }

  async create({type = "project", request, specification, progress=null} = {}) {
    if (!request || !specification) throw new Error("request and specification are required");
    const plan = await this.pipeline.plan?.({type, request, specification})
      ?? {type, request, specification};

    const result = await this.pipeline.executeProject?.({
      type,
      request,
      specification,
      plan,
      progress
    }) ?? {status: "PLANNED", plan};

    const evaluation = await this.evaluator.evaluateProject?.({
      type,
      request,
      specification,
      result,
      progress
    }) ?? {passed: result.status === "SUCCEEDED"};

    return {
      type,
      request,
      specification,
      plan,
      result,
      evaluation,
      productionReady: evaluation.passed === true
    };
  }
}
