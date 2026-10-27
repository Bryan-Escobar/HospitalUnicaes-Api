import { ErrorCode } from './error-codes';

export interface ErrorHandlerInterface {
  statusCode: number;
  code: ErrorCode;
  message: string;
}
