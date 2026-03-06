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
export class IsVendorOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: Request = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const user = request.user;
    if (!user || (user.user_type !== USER_TYPE.VENDOR && user.user_type !== USER_TYPE.ADMIN)) {
      throw new ForbiddenException('Access restricted to Vendor or Admin only');
    }
    return true;
  }
}
