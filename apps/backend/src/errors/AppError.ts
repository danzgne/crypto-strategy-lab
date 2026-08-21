export class AppError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ServiceUnavailableError extends AppError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, 503, 'SERVICE_UNAVAILABLE', options);
  }
}
