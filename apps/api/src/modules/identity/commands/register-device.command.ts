import { Command } from '../../../kernel/cqrs/index.js';

export interface RegisteredDevice {
  id: string;
}

export class RegisterDeviceCommand extends Command<RegisteredDevice> {
  constructor(
    readonly userId: string,
    readonly platform: 'ios' | 'android',
    readonly pushToken: string,
    readonly locale: string,
  ) {
    super();
  }
}
