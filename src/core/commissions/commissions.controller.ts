import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CommissionsService } from './commissions.service';
import { IsCreatorGuard } from '../guards/isCreator.guard';
import { IsVendorGuard } from '../guards/isVendor.guard';

@ApiTags('Commissions')
@ApiBearerAuth()
@ApiCookieAuth('accessToken')
@Controller('v1/commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @UseGuards(IsCreatorGuard)
  @Get('creator/me')
  @ApiOperation({ summary: 'Get commission summary for the authenticated creator' })
  @ApiResponse({ status: 200, description: 'Creator commission summary' })
  getCreatorSummary(@Req() req: Request) {
    return this.commissionsService.getCreatorSummary(req.user!.id);
  }

  @UseGuards(IsVendorGuard)
  @Get('vendor/me')
  @ApiOperation({ summary: 'Get commission/revenue summary for the authenticated vendor' })
  @ApiResponse({ status: 200, description: 'Vendor revenue summary' })
  getVendorSummary(@Req() req: Request) {
    return this.commissionsService.getVendorSummary(req.user!.id);
  }
}
