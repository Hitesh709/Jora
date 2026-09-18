export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register({ name, description = "", inputSchema = {}, handler, permissions = [] }) {
    if (!name || typeof handler !== "function") throw new Error("Tool name and handler are required");
    if (this.tools.has(name)) throw new Error(`Tool already registered: ${name}`);
    this.tools.set(name, { name, description, inputSchema, handler, permissions });
  }

  schemas(grantedPermissions = []) {
    return [...this.tools.values()]
      .filter(tool => tool.permissions.every(p => grantedPermissions.includes(p)))
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  async execute(name, args = {}, grantedPermissions = []) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (!tool.permissions.every(p => grantedPermissions.includes(p))) {
      throw new Error(`Permission denied for tool: ${name}`);
    }
    return tool.handler(args);
  }
}