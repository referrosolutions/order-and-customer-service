import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { extractTokenFromRequest } from 'src/utils/extract-token.util';
import { USER_TYPE } from '../enums';

@Injectable()
export class IsVendorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = request.user;
    if (!user || user.user_type !== USER_TYPE.VENDOR) {
      throw new ForbiddenException('Access restricted to VENDOR only');
    }
    return true;
  }
}
