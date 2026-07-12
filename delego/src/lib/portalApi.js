// Client für das öffentliche Delegationsportal. Spricht ausschließlich die
// Edge Functions an (kein direkter Tabellenzugriff).
import { callFunction } from './functionsClient'

export function portalSession(token) {
  return callFunction('portal-session', { token })
}

export function portalCreatePerson(token, person) {
  return callFunction('portal-persons', { token, action: 'create', person })
}

export function portalUpdatePerson(token, person) {
  return callFunction('portal-persons', { token, action: 'update', person })
}

export function portalDeletePerson(token, id) {
  return callFunction('portal-persons', { token, action: 'delete', person: { id } })
}

export function portalCreateTravelGroup(token, travel_group) {
  return callFunction('portal-travel', { token, action: 'create', travel_group })
}

export function portalUpdateTravelGroup(token, travel_group) {
  return callFunction('portal-travel', { token, action: 'update', travel_group })
}

export function portalDeleteTravelGroup(token, id) {
  return callFunction('portal-travel', { token, action: 'delete', travel_group: { id } })
}
