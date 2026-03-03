export type TransitionIssueSeverity = 'info' | 'warning';

export type TransitionIssue = {
  severity: TransitionIssueSeverity;
  title: string;
  detail: string;
  autoFixedFields: string[];
};

export type TransitionResult<S> = { state: S; issues: TransitionIssue[] };

