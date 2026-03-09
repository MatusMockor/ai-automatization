export type AutomationInboxHistoryEventType =
  | 'rule_matched'
  | 'draft_created'
  | 'draft_superseded'
  | 'draft_started'
  | 'task_snoozed'
  | 'task_dismissed'
  | 'task_restored';

export class AutomationInboxHistoryEventDto {
  type!: AutomationInboxHistoryEventType;
  occurredAt!: string;
  executionId!: string | null;
  ruleId!: string | null;
  ruleName!: string | null;
  message!: string;
}

export class AutomationInboxHistoryResponseDto {
  taskKey!: string;
  items!: AutomationInboxHistoryEventDto[];
}
