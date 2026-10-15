import type { StatusLabel } from '../shared/types';

export const isDone = (statuses: StatusLabel[], key: string) => !!statuses.find((s) => s.key === key)?.done;
export const firstOpenKey = (statuses: StatusLabel[]) => (statuses.find((s) => !s.done) ?? statuses[0]).key;
