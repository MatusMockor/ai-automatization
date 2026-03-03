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

export class TaskScopesResponseDto {
  asanaWorkspaces!: AsanaWorkspaceScopeDto[];
  jiraProjects!: JiraProjectScopeDto[];
}
