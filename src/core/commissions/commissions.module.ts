import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionRecord } from 'src/entity/commission-record.entity';
import { CommissionsService } from './commissions.service';
import { CommissionsController } from './commissions.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionRecord]), JwtModule.register({})],
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
