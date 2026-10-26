import type { Job, JobUpdate } from '../../src/shared/types.js';

/** A job with a live update applied, or undefined if lines were missed in between. */
export function applyJobUpdate(known: Job | undefined, update: JobUpdate): Job | undefined {
  const { added, logCount, ...rest } = update;
  const before = known?.logs ?? [];
  if (before.length + added.length !== logCount) return undefined;
  return { ...rest, logs: added.length ? [...before, ...added] : before };
}

export const withJob = (jobs: Job[], job: Job) => [job, ...jobs.filter((j) => j.id !== job.id)].sort((a, b) => b.createdAt - a.createdAt);

