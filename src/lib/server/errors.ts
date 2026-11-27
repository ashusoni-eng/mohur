export class AppError extends Error {
  constructor(message: string, public status = 400, public code = "invalid_request", public field?: string) { super(message); }
}
