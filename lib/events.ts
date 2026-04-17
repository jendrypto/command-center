import { EventEmitter } from 'events'

const globalForEvents = globalThis as unknown as { ccEvents: EventEmitter }

export const events = globalForEvents.ccEvents || new EventEmitter()
globalForEvents.ccEvents = events
