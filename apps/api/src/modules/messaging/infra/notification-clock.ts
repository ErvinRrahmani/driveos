import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationClock {
  now(): Date {
    return new Date();
  }
}
