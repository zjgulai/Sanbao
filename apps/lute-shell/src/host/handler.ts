/** One routable request handler inside the host process. */

/** Fetch-shaped handler with an explicit request-body buffering mode. */
export interface FetchHandler {
  /** How the transport must deliver the request body. */
  requestBodyMode(): 'buffered'
  /** Serve one request. */
  fetch(request: Request): Promise<Response>
}
