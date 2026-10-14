import { Injectable } from '@nestjs/common';
import type { PlatformAlertName } from '@driveos/shared';

export interface AlertMeasurement {
  value: number;
  schoolId: string | null;
}

export interface AlertProbe {
  name: PlatformAlertName;
  threshold: number;
  measure(now: Date): Promise<AlertMeasurement>;
}

@Injectable()
export class AlertProbes {
  private readonly probes = new Map<PlatformAlertName, AlertProbe>();

  register(probe: AlertProbe): void {
    if (this.probes.has(probe.name))
      throw new Error(`Alert probe "${probe.name}" is registered twice`);
    this.probes.set(probe.name, probe);
  }

  list(): AlertProbe[] {
    return [...this.probes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
