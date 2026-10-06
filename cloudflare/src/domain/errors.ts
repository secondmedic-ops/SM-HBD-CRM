/** A request that breaks a business rule (more received than due, staff of another department, ...). HTTP 400. */
export class RuleError extends Error {}

/** HTTP error with a status and a message for the user. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export const notFound = (what: string, id: string) => new ApiError(404, `${what} not found: ${id}`);
export const forbidden = (message: string) => new ApiError(403, message);
