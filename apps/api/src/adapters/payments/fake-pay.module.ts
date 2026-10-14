import { Module } from '@nestjs/common';
import { FakePayController } from './fake-pay.controller.js';

@Module({ controllers: [FakePayController] })
export class FakePayModule {}
