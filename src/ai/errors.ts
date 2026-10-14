/** Error raised by the optional AI step (configuration, network or provider failures). */
export class AiError extends Error {
  override readonly name = 'AiError';

  constructor(
    message: string,
    /** HTTP status when the provider answered with a non-2xx response. */
    readonly status?: number,
  ) {
    super(message);
  }
}
