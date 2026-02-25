import { USER_TYPE } from 'src/core/enums';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        phone_number: string;
        user_type: USER_TYPE;
      };
    }
  }
}
