// Client für die Einsatztag-Sichten (Fahrer & Koordinatoren). Token-basiert,
// ohne Login, über die Edge Functions.
import { callFunction } from './functionsClient'

export function driverSession(token) {
  return callFunction('driver-session', { token })
}

export function coordinatorSession(token) {
  return callFunction('coordinator-session', { token })
}

export function coordinatorSetStatus(token, person_id, status) {
  return callFunction('coordinator-checkin', { token, action: 'set_status', person_id, status })
}

export function coordinatorAddWalkin(token, walkin) {
  return callFunction('coordinator-checkin', { token, action: 'walkin_add', ...walkin })
}

export function coordinatorRemoveWalkin(token, id) {
  return callFunction('coordinator-checkin', { token, action: 'walkin_remove', id })
}
