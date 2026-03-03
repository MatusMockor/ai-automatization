export class AsanaWorkspaceScopeDto {
  id!: string;
  name!: string;
  taskCount!: number;
}

export class JiraProjectScopeDto {
  key!: string;
  name!: string;
  taskCount!: number;
}

export class AsanaProjectScopeDto {
  id!: string;
  name!: string;
  workspaceId!: string;
  workspaceName!: string;
  taskCount!: number;
}

export class TaskScopesResponseDto {
  asanaWorkspaces!: AsanaWorkspaceScopeDto[];
  asanaProjects!: AsanaProjectScopeDto[];
  jiraProjects!: JiraProjectScopeDto[];
}
