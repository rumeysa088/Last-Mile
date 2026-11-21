import { http, getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import type { Family, Paged } from './types'

export const familiesApi = {
  list: () => (USE_MOCK ? mock.listFamilies(getToken()) : http<Paged<Family>>('/families')),
  get: (id: string) => (USE_MOCK ? mock.getFamily(getToken(), id) : http<Family>(`/families/${id}`)),
}
