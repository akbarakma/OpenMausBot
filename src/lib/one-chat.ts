/** This app shows one chat per bot: nothing starts a second thread, and hidden work opens beside the chat, read only. */
export const ONE_CHAT = true;

/** A routine's run, a side job or a teammate's exchange: a thread the server hides from every thread list. */
export function hiddenWork(task: { routineRunId?: unknown } | undefined): boolean {
  return ONE_CHAT && Boolean(task?.routineRunId);
}
