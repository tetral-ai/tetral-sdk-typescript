import type {
  BetaManagedAgentsSessionEvent,
  BetaManagedAgentsStreamSessionEvents,
  EventStreamParams,
} from '@tetral-ai/sdk/resources/beta/sessions/events';
import type { EventStreamParams as ThreadStreamParams } from '@tetral-ai/sdk/resources/beta/sessions/threads/events';

type Assert<T extends true> = T;
type SessionOptIn = Assert<'event_deltas' extends keyof EventStreamParams ? true : false>;
type ThreadFormalOnly = Assert<'event_deltas' extends keyof ThreadStreamParams ? false : true>;
type ListFormalOnly = Assert<
  Extract<BetaManagedAgentsSessionEvent, { type: 'event_start' | 'event_delta' }> extends never ? true : false
>;
type StreamHasStart = Assert<
  Extract<BetaManagedAgentsStreamSessionEvents, { type: 'event_start' }> extends never ? false : true
>;
type StreamHasDelta = Assert<
  Extract<BetaManagedAgentsStreamSessionEvents, { type: 'event_delta' }> extends never ? false : true
>;

const typeProofs: [SessionOptIn, ThreadFormalOnly, ListFormalOnly, StreamHasStart, StreamHasDelta] = [
  true,
  true,
  true,
  true,
  true,
];
void typeProofs;
