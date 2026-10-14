import { billingSamples } from './billing.js';
import { documentsSamples } from './documents.js';
import { messagingSamples } from './messaging.js';
import { platformSamples } from './platform.js';
import { reportingSamples } from './reporting.js';
import { schedulingSamples } from './scheduling.js';
import { schoolSamples } from './school.js';
import { theorySamples } from './theory.js';
import { trainingSamples } from './training.js';

export { SAMPLE_IDS } from './fixtures.js';
export {
  billingSamples,
  documentsSamples,
  messagingSamples,
  platformSamples,
  reportingSamples,
  schedulingSamples,
  schoolSamples,
  theorySamples,
  trainingSamples,
};

export const DTO_SAMPLES = {
  school: schoolSamples,
  platform: platformSamples,
  scheduling: schedulingSamples,
  training: trainingSamples,
  theory: theorySamples,
  billing: billingSamples,
  documents: documentsSamples,
  messaging: messagingSamples,
  reporting: reportingSamples,
};
