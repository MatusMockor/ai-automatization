export class TaskManagerProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskManagerProviderError';
  }
}

export class TaskManagerProviderAuthError extends TaskManagerProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'TaskManagerProviderAuthError';
  }
}

export class TaskManagerProviderNotFoundError extends TaskManagerProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'TaskManagerProviderNotFoundError';
  }
}

export class TaskManagerProviderRequestError extends TaskManagerProviderError {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'TaskManagerProviderRequestError';
  }
}

export class TaskManagerProviderConfigurationError extends TaskManagerProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'TaskManagerProviderConfigurationError';
  }
}
