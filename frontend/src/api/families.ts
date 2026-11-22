import { getToken, USE_MOCK } from './client'
import { mock } from './mockServer'
import { realFamilies } from './real'

export const familiesApi = {
  list: () => (USE_MOCK ? mock.listFamilies(getToken()) : realFamilies.list()),
  get: (id: string) => (USE_MOCK ? mock.getFamily(getToken(), id) : realFamilies.get(id)),
}
