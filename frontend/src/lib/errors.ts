// Two kinds of failure the UI must treat differently:
// NetworkError -> keep the work on the phone and retry later.
// ApiError     -> the server answered "no"; show why, do not blindly retry.
export class NetworkError extends Error {
  constructor(message = 'No connection') { super(message); this.name = 'NetworkError' }
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message); this.name = 'ApiError'
  }
}
export const isNetworkError = (e: unknown): e is NetworkError =>
  e instanceof NetworkError || (e instanceof TypeError && /fetch|network/i.test(e.message))
